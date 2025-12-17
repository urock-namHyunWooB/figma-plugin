import { FinalAstTree } from "@compiler";
import { traverseBFS } from "@compiler/utils/traverse";
import ts from "typescript";

class ReactGenerator {
  private astTree: FinalAstTree;
  private factory = ts.factory;
  private styleVariables: Map<string, string> = new Map(); // node.id -> style variable name

  constructor(astTree: FinalAstTree) {
    this.astTree = astTree;
  }

  /**
   * Props 인터페이스 생성
   * astTree.props → ts.InterfaceDeclaration
   */
  private createPropsInterface(componentName: string): ts.InterfaceDeclaration {
    const members: ts.TypeElement[] = [];

    for (const [propName, propDef] of Object.entries(this.astTree.props)) {
      const prop = propDef as any; // props는 실제로는 객체 타입
      const typeNode = this._createPropTypeNode(prop);
      const isOptional = prop.defaultValue !== undefined;

      const propSig = this.factory.createPropertySignature(
        undefined,
        propName,
        isOptional
          ? this.factory.createToken(ts.SyntaxKind.QuestionToken)
          : undefined,
        typeNode
      );

      members.push(propSig);
    }

    const interfaceDeclaration = this.factory.createInterfaceDeclaration(
      [this.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      `${componentName}Props`,
      undefined,
      undefined,
      members
    );

    return interfaceDeclaration;
  }

  /**
   * 필요한 import 문들 생성
   * - React (React.ReactNode 타입 사용)
   * - emotion css (스타일링)
   */
  private createImports(): ts.ImportDeclaration[] {
    const imports: ts.ImportDeclaration[] = [];

    // React import: import React from "react";
    imports.push(this._createReactImport());

    // emotion css import: import { css } from "@emotion/css";
    imports.push(this._createEmotionCssImport());

    return imports;
  }

  /**
   * JSX 트리 생성 (재귀)
   * FinalAstTree → ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression
   */
  private createJsxTree(
    node: FinalAstTree
  ): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
    // 1. Slot 처리: Slot 노드는 prop 참조로 대체
    if ((node as any).isSlot) {
      const slotName = (node as any).slotName;
      return this.factory.createJsxExpression(
        undefined,
        this.factory.createIdentifier(slotName)
      );
    }

    // 2. 태그 이름 결정
    const tagName = this._getTagName(node);

    // 3. Attributes 생성
    const attributes: ts.JsxAttributeLike[] = [];
    const styleAttr = this._createStyleAttribute(node);
    if (styleAttr) {
      attributes.push(styleAttr);
    }

    // 4. Children 생성
    const children: ts.JsxChild[] = [];
    for (const child of node.children) {
      const childJsx = this.createJsxTree(child);
      // Visible 조건 처리
      if (child.visible.type === "condition") {
        const condition = this._convertEstreeToTsExpression(
          child.visible.condition
        );
        const conditionalJsx = this._wrapWithConditionalRendering(
          condition,
          childJsx as ts.JsxElement | ts.JsxSelfClosingElement
        );
        children.push(conditionalJsx);
      } else {
        // static인 경우 그대로 추가
        children.push(childJsx as ts.JsxChild);
      }
    }

    // 5. JSX Element 생성
    if (children.length === 0) {
      return this.factory.createJsxSelfClosingElement(
        this.factory.createIdentifier(tagName),
        undefined,
        this.factory.createJsxAttributes(attributes)
      );
    } else {
      return this.factory.createJsxElement(
        this.factory.createJsxOpeningElement(
          this.factory.createIdentifier(tagName),
          undefined,
          this.factory.createJsxAttributes(attributes)
        ),
        children,
        this.factory.createJsxClosingElement(
          this.factory.createIdentifier(tagName)
        )
      );
    }
  }

  /**
   * 스타일 변수들 생성 (컴포넌트 함수 내부에서 사용할 스타일 상수)
   * 모든 노드를 순회하며 스타일이 있는 노드의 스타일 변수 생성
   */
  private createStyleVariables(): ts.VariableStatement {
    const styleProperties: ts.PropertyAssignment[] = [];

    // 모든 노드를 순회하며 스타일 수집
    traverseBFS(this.astTree, (node) => {
      const baseStyle = node.style.base || {};
      const dynamicStyles = node.style.dynamic || [];

      // 스타일이 있는 경우만 처리
      if (Object.keys(baseStyle).length === 0 && dynamicStyles.length === 0) {
        return;
      }

      // TODO: dynamic styles 처리 필요
      // 일단 base style만 처리
      const styleObjectProperties = Object.entries(baseStyle).map(
        ([key, value]) =>
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier(key),
            this._convertStyleValueToExpression(value)
          )
      );

      // 빈 스타일 객체는 제외
      if (styleObjectProperties.length === 0) {
        return;
      }

      const styleVarName = this._getStyleVariableName(node);

      const styleObject = this.factory.createObjectLiteralExpression(
        styleObjectProperties,
        true
      );

      // css({...}) 호출
      const cssCall = this.factory.createCallExpression(
        this.factory.createIdentifier("css"),
        undefined,
        [styleObject]
      );

      styleProperties.push(
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(styleVarName),
          cssCall
        )
      );
    });

    // styles 객체 생성
    const stylesObject = this.factory.createObjectLiteralExpression(
      styleProperties,
      true
    );

    // const styles = { ... }
    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("styles"),
            undefined,
            undefined,
            stylesObject
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * Prop 정의를 TypeScript TypeNode로 변환
   */
  private _createPropTypeNode(propDef: any): ts.TypeNode {
    // variantOptions가 있으면 유니온 타입으로 변환
    if (propDef.variantOptions && propDef.variantOptions.length > 0) {
      const literals = propDef.variantOptions.map((opt: string) =>
        this.factory.createLiteralTypeNode(
          this.factory.createStringLiteral(opt)
        )
      );
      return this.factory.createUnionTypeNode(literals);
    }

    switch (propDef.type) {
      case "SLOT":
        // SLOT은 React.ReactNode 타입
        return this.factory.createTypeReferenceNode(
          this.factory.createQualifiedName(
            this.factory.createIdentifier("React"),
            "ReactNode"
          ),
          undefined
        );
      case "TEXT":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "VARIANT":
        // variantOptions가 없으면 string으로 fallback
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
      case "BOOLEAN":
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
      default:
        return this.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
    }
  }

  /**
   * React import 문 생성: import React from "react";
   */
  private _createReactImport(): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        this.factory.createIdentifier("React"),
        undefined
      ),
      this.factory.createStringLiteral("react")
    );
  }

  /**
   * Emotion css import 문 생성: import { css } from "@emotion/css";
   */
  private _createEmotionCssImport(): ts.ImportDeclaration {
    return this.factory.createImportDeclaration(
      undefined,
      this.factory.createImportClause(
        false,
        undefined,
        this.factory.createNamedImports([
          this.factory.createImportSpecifier(
            false,
            undefined,
            this.factory.createIdentifier("css")
          ),
        ])
      ),
      this.factory.createStringLiteral("@emotion/css")
    );
  }

  /**
   * 노드 타입에 따라 태그 이름 결정
   */
  private _getTagName(node: FinalAstTree): string {
    if (node.type === "TEXT") return "span";
    if (node.type === "INSTANCE") {
      // INSTANCE는 컴포넌트 이름 사용 (공백 제거, PascalCase로 변환?)
      return node.name.replace(/\s+/g, "");
    }
    return "div";
  }

  /**
   * Style 속성 생성 (스타일 변수 참조)
   */
  private _createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    const baseStyle = node.style.base || {};
    const dynamicStyles = node.style.dynamic || [];

    // 스타일이 없는 경우
    if (Object.keys(baseStyle).length === 0 && dynamicStyles.length === 0) {
      return null;
    }

    // 스타일 변수 이름 가져오기 (없으면 생성)
    const styleVarName = this._getStyleVariableName(node);

    // styles.container 형태로 참조
    const styleReference = this.factory.createPropertyAccessExpression(
      this.factory.createIdentifier("styles"),
      this.factory.createIdentifier(styleVarName)
    );

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("className"),
      this.factory.createJsxExpression(undefined, styleReference)
    );
  }

  /**
   * 노드의 스타일 변수 이름 생성 (node.id 기반)
   */
  private _getStyleVariableName(node: FinalAstTree): string {
    if (this.styleVariables.has(node.id)) {
      return this.styleVariables.get(node.id)!;
    }

    // node.id를 기반으로 변수 이름 생성 (예: "4139:411" -> "node_4139_411")
    // 또는 node.name을 사용하되 유효한 식별자로 변환
    const varName = this._sanitizeIdentifierName(node.name || node.id);
    const uniqueVarName = this._ensureUniqueVarName(varName);

    this.styleVariables.set(node.id, uniqueVarName);
    return uniqueVarName;
  }

  /**
   * 식별자 이름으로 변환 (공백, 특수문자 제거, camelCase)
   */
  private _sanitizeIdentifierName(name: string): string {
    // 공백, 특수문자 제거 후 camelCase로 변환
    return (
      name
        .replace(/[^a-zA-Z0-9]/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word, index) => {
          if (index === 0) {
            return word.toLowerCase();
          }
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join("") || "node"
    );
  }

  /**
   * 고유한 변수 이름 보장 (중복 시 숫자 추가)
   */
  private _ensureUniqueVarName(baseName: string): string {
    const existingNames = Array.from(this.styleVariables.values());
    let uniqueName = baseName;
    let counter = 0;

    while (existingNames.includes(uniqueName)) {
      counter++;
      uniqueName = `${baseName}${counter}`;
    }

    return uniqueName;
  }

  /**
   * 스타일 값을 TypeScript Expression으로 변환
   */
  private _convertStyleValueToExpression(value: any): ts.Expression {
    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    return this.factory.createNull();
  }

  /**
   * ESTree AST를 TypeScript Expression으로 변환
   * TODO: 더 정교한 변환 필요 (현재는 간단한 경우만 처리)
   */
  private _convertEstreeToTsExpression(_estreeNode: any): ts.Expression {
    // 일단 generate로 문자열로 변환 후 파싱하는 방식은 복잡하므로
    // 간단한 경우만 직접 처리
    // TODO: ESTree 노드 타입별로 처리 필요
    return this.factory.createTrue(); // 임시
  }

  /**
   * 조건부 렌더링으로 JSX 요소 감싸기
   */
  private _wrapWithConditionalRendering(
    condition: ts.Expression,
    element: ts.JsxElement | ts.JsxSelfClosingElement
  ): ts.JsxExpression {
    const conditionalExpression = this.factory.createBinaryExpression(
      condition,
      this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
      element
    );

    return this.factory.createJsxExpression(undefined, conditionalExpression);
  }
}

export default ReactGenerator;
