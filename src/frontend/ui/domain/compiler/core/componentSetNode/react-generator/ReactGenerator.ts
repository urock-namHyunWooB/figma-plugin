import { FinalAstTree } from "@compiler";
import { traverseBFS } from "@compiler/utils/traverse";
import ts from "typescript";

class ReactGenerator {
  private astTree: FinalAstTree;
  private factory = ts.factory;
  private styleVariables: Map<string, string> = new Map(); // node.id -> style variable name
  private cssObjectCache: Map<string, ts.CallExpression> = new Map(); // 스타일 문자열 -> css() 호출 결과 캐시

  constructor(astTree: FinalAstTree) {
    this.astTree = astTree;
  }

  /**
   * Props 인터페이스 생성
   * astTree.props → ts.InterfaceDeclaration
   */
  public createPropsInterface(componentName: string): ts.InterfaceDeclaration {
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
  public createImports(): ts.ImportDeclaration[] {
    const imports: ts.ImportDeclaration[] = [];

    // React import: import React from "react";
    imports.push(this._createReactImport());

    // emotion css import: import { css, cx } from "@emotion/css";
    imports.push(this._createEmotionCssImport());

    return imports;
  }

  /**
   * JSX 트리 생성 (재귀)
   * FinalAstTree → ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression
   */
  public createJsxTree(
    node: FinalAstTree
  ): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
    // 1. Slot 처리: Slot 노드는 props.slotName으로 참조
    if ((node as any).isSlot) {
      const slotName = (node as any).slotName;
      return this.factory.createJsxExpression(
        undefined,
        this.factory.createPropertyAccessExpression(
          this.factory.createIdentifier("props"),
          this.factory.createIdentifier(slotName)
        )
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
  public createStyleVariables(): ts.VariableStatement {
    const styleProperties: ts.PropertyAssignment[] = [];

    // 모든 노드를 순회하며 스타일 수집
    traverseBFS(this.astTree, (node) => {
      // 스타일 최적화: dynamic styles에서 공통 속성을 base로 이동
      const optimized = this._optimizeStyles(node);
      const baseStyle = optimized.base;
      const dynamicStyles = optimized.dynamic;

      // 스타일이 있는 경우만 처리
      if (Object.keys(baseStyle).length === 0 && dynamicStyles.length === 0) {
        return;
      }

      const baseStyleVarName = this._getStyleVariableName(node);

      // 1. Base style 처리 (CSS 객체 캐싱 사용)
      if (Object.keys(baseStyle).length > 0) {
        const baseCssCall = this._createCssCall(baseStyle);

        styleProperties.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier(baseStyleVarName),
            baseCssCall
          )
        );
      }

      // 2. Dynamic styles를 prop별로 그룹핑하여 variant map 생성
      const grouped = this._groupDynamicStylesByProp(dynamicStyles);

      // 각 prop별로 variant style map 생성
      for (const [propName, variants] of grouped.entries()) {
        // 각 variant의 스타일을 머지 (같은 value를 가진 variant가 여러 개일 수 있음)
        const mergedVariants = new Map<string, Record<string, any>>();

        for (const variant of variants) {
          if (!mergedVariants.has(variant.value)) {
            mergedVariants.set(variant.value, {});
          }
          // 같은 value의 스타일들을 병합
          Object.assign(mergedVariants.get(variant.value)!, variant.style);
        }

        // 머지된 variant들을 배열로 변환
        const mergedArray = Array.from(mergedVariants.entries()).map(
          ([value, style]) => ({ value, style })
        );

        if (mergedArray.length > 0) {
          // 변수명 최적화: baseStyleVarName + PropName (첫 글자 대문자)
          // 예: sizelarge + Size → sizelargeSize
          const variantMapName = `${baseStyleVarName}${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
          const variantMap = this._createVariantStyleMap(
            variantMapName,
            mergedArray
          );

          styleProperties.push(variantMap);

          // variant map 정보 저장 (나중에 className 결합 시 사용)
          const variantMapKey = `${node.id}_variant_${propName}`;
          (this.styleVariables as any).set(variantMapKey, {
            varName: variantMapName,
            propName: propName,
          });
        }
      }
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
   * Emotion css import 문 생성: import { css, cx } from "@emotion/css";
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
          this.factory.createImportSpecifier(
            false,
            undefined,
            this.factory.createIdentifier("cx")
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
   * Style 속성 생성 (base + variant style maps)
   */
  private _createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    // 스타일 최적화: dynamic styles에서 공통 속성을 base로 이동
    const optimized = this._optimizeStyles(node);
    const baseStyle = optimized.base;
    const dynamicStyles = optimized.dynamic;

    // 스타일이 없는 경우
    if (Object.keys(baseStyle).length === 0 && dynamicStyles.length === 0) {
      return null;
    }

    const baseStyleVarName = this._getStyleVariableName(node);
    const classNameParts: ts.Expression[] = [];

    // 1. Base style 추가
    if (Object.keys(baseStyle).length > 0) {
      const baseStyleReference = this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("styles"),
        this.factory.createIdentifier(baseStyleVarName)
      );
      classNameParts.push(baseStyleReference);
    }

    // 2. Dynamic styles를 prop별로 그룹핑하여 variant map 참조
    const grouped = this._groupDynamicStylesByProp(dynamicStyles);

    for (const [propName] of grouped.entries()) {
      // variant map 이름: {baseStyleVarName}{PropName} (Styles 접미사 제거)
      const variantMapName = `${baseStyleVarName}${propName.charAt(0).toUpperCase() + propName.slice(1)}`;

      // styles.{variantMapName}[props.{propName}]
      const variantMapAccess = this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("styles"),
        this.factory.createIdentifier(variantMapName)
      );

      const propAccess = this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("props"),
        this.factory.createIdentifier(propName)
      );

      const variantStyleAccess = this.factory.createElementAccessExpression(
        variantMapAccess,
        propAccess
      );

      classNameParts.push(variantStyleAccess);
    }

    // 3. cx 함수를 사용하여 className 결합
    // cx(styles.base, styles.sizeStyles[props.size], styles.stateStyles[props.state])
    let classNameExpression: ts.Expression;

    if (classNameParts.length === 1) {
      // 단일 스타일만 있는 경우
      classNameExpression = classNameParts[0];
    } else {
      // cx 함수 호출: cx(style1, style2, ...)
      const cxIdentifier = this.factory.createIdentifier("cx");
      classNameExpression = this.factory.createCallExpression(
        cxIdentifier,
        undefined,
        classNameParts
      );
    }

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("className"),
      this.factory.createJsxExpression(undefined, classNameExpression)
    );
  }

  /**
   * 노드의 스타일 변수 이름 생성 (짧고 의미있는 이름)
   */
  private _getStyleVariableName(node: FinalAstTree): string {
    if (this.styleVariables.has(node.id)) {
      return this.styleVariables.get(node.id)!;
    }

    // 1. 노드 타입과 이름을 기반으로 짧은 이름 생성
    const baseName = this._generateShortName(node);
    const uniqueVarName = this._ensureUniqueVarName(baseName);

    this.styleVariables.set(node.id, uniqueVarName);
    return uniqueVarName;
  }

  /**
   * 짧고 의미있는 변수명 생성
   */
  private _generateShortName(node: FinalAstTree): string {
    // 1. 노드 타입 기반 기본 이름
    const typeMap: Record<string, string> = {
      TEXT: "text",
      INSTANCE: "icon",
      FRAME: "frame",
      GROUP: "group",
      VECTOR: "vector",
      RECTANGLE: "rect",
      ELLIPSE: "ellipse",
    };

    let baseName = typeMap[node.type] || "node";

    // 2. 노드 이름에서 의미있는 키워드 추출 (짧게)
    const nameWords = this._extractKeywords(node.name);

    if (nameWords.length > 0) {
      // 첫 번째 키워드 사용 (최대 2개 단어 조합)
      const keyword = nameWords.slice(0, 2).join("");
      if (keyword.length <= 10) {
        baseName = keyword.toLowerCase();
      } else {
        // 너무 길면 첫 글자만 사용
        baseName = nameWords
          .slice(0, 3)
          .map((w) => w.charAt(0))
          .join("")
          .toLowerCase();
      }
    }

    // 3. node.id의 마지막 숫자 부분을 짧은 식별자로 사용 (중복 방지)
    // 예: "4139:411" -> "411" 또는 해시값
    const idParts = node.id.split(":");
    if (idParts.length > 1) {
      const lastPart = idParts[idParts.length - 1];
      // 숫자가 너무 길면 마지막 3자리만 사용
      const shortId = lastPart.slice(-3);
      // 기존 baseName과 결합하되, 이미 충분히 구분되면 생략
      if (!baseName || baseName === "node") {
        baseName = `node${shortId}`;
      }
    }

    return baseName || "node";
  }

  /**
   * 노드 이름에서 의미있는 키워드 추출
   */
  private _extractKeywords(name: string): string[] {
    if (!name) return [];

    // 특수 문자, 숫자, 등호 제거 후 단어 추출
    const cleaned = name.replace(/[=:,]/g, " ").replace(/\d+/g, "").trim();

    // 공백으로 분리하고 의미없는 단어 필터링
    const stopWords = new Set([
      "false",
      "true",
      "default",
      "disabled",
      "enabled",
      "the",
      "a",
      "an",
    ]);

    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => word.length > 1 && !stopWords.has(word.toLowerCase()))
      .slice(0, 3); // 최대 3개만 사용
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
   * ESTree 조건에서 prop 이름과 값 추출
   * props.Size === "Large" → { prop: "size", value: "Large" }
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    // props.X === "value" 형태만 처리
    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
        // prop 이름을 camelCase로 변환 (예: "Size" → "size")
        const camelPropName =
          propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          prop: camelPropName,
          value: String(propValue),
        };
      }
    }

    return null;
  }

  /**
   * Dynamic styles를 prop별로 그룹핑
   */
  private _groupDynamicStylesByProp(
    dynamicStyles: Array<{ condition: any; style: Record<string, any> }>
  ): Map<string, Array<{ value: string; style: Record<string, any> }>> {
    const grouped = new Map<
      string,
      Array<{ value: string; style: Record<string, any> }>
    >();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue; // 추출 불가능한 조건은 스킵

      if (!grouped.has(extracted.prop)) {
        grouped.set(extracted.prop, []);
      }

      grouped.get(extracted.prop)!.push({
        value: extracted.value,
        style: dynamicStyle.style,
      });
    }

    return grouped;
  }

  /**
   * CSS 속성 키를 camelCase로 변환
   * "flex-direction" → "flexDirection"
   */
  private _normalizeCssKey(key: string): string {
    return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  /**
   * CSS 객체 생성 (중복 체크 및 캐싱)
   */
  private _createCssCall(style: Record<string, any>): ts.CallExpression {
    // 스타일 객체를 문자열로 변환하여 캐시 키 생성 (정규화된 키 사용)
    const normalizedStyle: Record<string, any> = {};
    for (const [key, value] of Object.entries(style)) {
      normalizedStyle[this._normalizeCssKey(key)] = value;
    }
    const cacheKey = JSON.stringify(normalizedStyle);

    if (this.cssObjectCache.has(cacheKey)) {
      return this.cssObjectCache.get(cacheKey)!;
    }

    const styleObjectProperties = Object.entries(normalizedStyle).map(
      ([key, value]) =>
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(key),
          this._convertStyleValueToExpression(value)
        )
    );

    const styleObject = this.factory.createObjectLiteralExpression(
      styleObjectProperties,
      true
    );

    const cssCall = this.factory.createCallExpression(
      this.factory.createIdentifier("css"),
      undefined,
      [styleObject]
    );

    this.cssObjectCache.set(cacheKey, cssCall);
    return cssCall;
  }

  /**
   * Variant 스타일 map 생성 (예: sizeStyles: { Large: css({...}), Medium: css({...}) })
   */
  private _createVariantStyleMap(
    mapName: string,
    variants: Array<{ value: string; style: Record<string, any> }>
  ): ts.PropertyAssignment {
    // 객체 리터럴 속성들 생성: { Large: css({...}), Medium: css({...}), ... }
    const variantProperties: ts.PropertyAssignment[] = variants.map(
      (variant) => {
        const cssCall = this._createCssCall(variant.style);

        return this.factory.createPropertyAssignment(
          this.factory.createIdentifier(variant.value), // "Large", "Medium", etc.
          cssCall
        );
      }
    );

    const variantMapObject = this.factory.createObjectLiteralExpression(
      variantProperties,
      true
    );

    return this.factory.createPropertyAssignment(
      this.factory.createIdentifier(mapName),
      variantMapObject
    );
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
   * ConditionNode (BinaryExpression | UnaryExpression | MemberExpression | Literal) → ts.Expression
   */
  private _convertEstreeToTsExpression(estreeNode: any): ts.Expression {
    if (!estreeNode || !estreeNode.type) {
      return this.factory.createTrue(); // fallback
    }

    switch (estreeNode.type) {
      case "BinaryExpression":
        return this._convertBinaryExpression(estreeNode);

      case "UnaryExpression":
        return this._convertUnaryExpression(estreeNode);

      case "MemberExpression":
        return this._convertMemberExpression(estreeNode);

      case "Literal":
        return this._convertLiteral(estreeNode);

      case "LogicalExpression":
        // ESTree의 LogicalExpression (&&, ||)도 BinaryExpression으로 처리
        return this._convertBinaryExpression(estreeNode);

      case "Identifier":
        return this._convertIdentifier(estreeNode);

      default:
        console.warn(
          `Unknown ESTree node type: ${estreeNode.type}`,
          estreeNode
        );
        return this.factory.createTrue(); // fallback
    }
  }

  /**
   * BinaryExpression 변환 (예: props.size === 'L')
   */
  private _convertBinaryExpression(node: any): ts.BinaryExpression {
    const left = this._convertEstreeToTsExpression(node.left);
    const right = this._convertEstreeToTsExpression(node.right);

    const operatorMap: Record<string, ts.SyntaxKind> = {
      "===": ts.SyntaxKind.EqualsEqualsEqualsToken,
      "!==": ts.SyntaxKind.ExclamationEqualsEqualsToken,
      "==": ts.SyntaxKind.EqualsEqualsToken,
      "!=": ts.SyntaxKind.ExclamationEqualsToken,
      "<": ts.SyntaxKind.LessThanToken,
      "<=": ts.SyntaxKind.LessThanEqualsToken,
      ">": ts.SyntaxKind.GreaterThanToken,
      ">=": ts.SyntaxKind.GreaterThanEqualsToken,
      "&&": ts.SyntaxKind.AmpersandAmpersandToken,
      "||": ts.SyntaxKind.BarBarToken,
      "+": ts.SyntaxKind.PlusToken,
      "-": ts.SyntaxKind.MinusToken,
      "*": ts.SyntaxKind.AsteriskToken,
      "/": ts.SyntaxKind.SlashToken,
      "%": ts.SyntaxKind.PercentToken,
    };

    const syntaxKind =
      operatorMap[node.operator] || ts.SyntaxKind.EqualsEqualsEqualsToken;

    return this.factory.createBinaryExpression(
      left,
      (this.factory.createToken as any)(syntaxKind),
      right
    );
  }

  /**
   * UnaryExpression 변환 (예: !props.isOpen)
   */
  private _convertUnaryExpression(node: any): ts.PrefixUnaryExpression {
    const operand = this._convertEstreeToTsExpression(node.argument);
    const operatorKind =
      node.operator === "!"
        ? ts.SyntaxKind.ExclamationToken
        : ts.SyntaxKind.MinusToken;
    const operatorToken = this.factory.createToken(operatorKind);

    return this.factory.createPrefixUnaryExpression(
      operatorToken as any,
      operand
    );
  }

  /**
   * MemberExpression 변환 (예: props.size, props['Left Icon'])
   */
  private _convertMemberExpression(node: any): ts.Expression {
    const object = this._convertEstreeToTsExpression(node.object);

    // computed가 true면 bracket notation (props['Left Icon']), false면 dot notation (props.size)
    if (node.computed) {
      const property = this._convertEstreeToTsExpression(node.property);
      return this.factory.createElementAccessExpression(object, property);
    } else {
      // property가 Identifier인 경우
      const propertyName = node.property.name || node.property;
      return this.factory.createPropertyAccessExpression(
        object,
        this.factory.createIdentifier(propertyName)
      );
    }
  }

  /**
   * Identifier 변환 (예: props, 변수명 등)
   */
  private _convertIdentifier(node: any): ts.Identifier {
    const name = node.name || "unknown";
    return this.factory.createIdentifier(name);
  }

  /**
   * Literal 변환 (string, number, boolean 등)
   */
  private _convertLiteral(node: any): ts.Expression {
    const value = node.value;

    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    if (value === null) {
      return this.factory.createNull();
    }

    // 기본값
    return this.factory.createStringLiteral(String(value));
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

  /**
   * 컴포넌트 함수 생성
   * export default function ComponentName(props: Props) { ... }
   */
  public createComponentFunction(
    componentName: string
  ): ts.FunctionDeclaration {
    const jsxTree = this.createJsxTree(this.astTree);

    return this.factory.createFunctionDeclaration(
      [
        this.factory.createModifier(ts.SyntaxKind.ExportKeyword),
        this.factory.createModifier(ts.SyntaxKind.DefaultKeyword),
      ],
      undefined,
      componentName,
      undefined,
      [
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          this.factory.createIdentifier("props"),
          undefined,
          this.factory.createTypeReferenceNode(
            this.factory.createIdentifier(`${componentName}Props`),
            undefined
          ),
          undefined
        ),
      ],
      undefined,
      this.factory.createBlock(
        [
          // const styles = { ... };
          this.createStyleVariables(),
          // return <JSX>;
          this.factory.createReturnStatement(jsxTree),
        ],
        true
      )
    );
  }

  /**
   * SourceFile 생성 (모든 코드 합치기)
   */
  public buildSourceFile(componentName: string): ts.SourceFile {
    const statements: ts.Statement[] = [
      // Imports
      ...this.createImports(),
      // Props Interface
      this.createPropsInterface(componentName),
      // Component Function
      this.createComponentFunction(componentName),
    ];

    return this.factory.createSourceFile(
      statements,
      this.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None
    );
  }

  /**
   * 최종 코드 문자열 생성
   */
  public generateComponentCode(componentName: string): string {
    const sourceFile = this.buildSourceFile(componentName);
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    });
    return printer.printFile(sourceFile);
  }

  /**
   * Dynamic styles에서 공통 속성을 추출하여 base style로 이동
   */
  private _optimizeStyles(node: FinalAstTree): {
    base: Record<string, any>;
    dynamic: Array<{ condition: any; style: Record<string, any> }>;
  } {
    const baseStyle = { ...(node.style.base || {}) };
    const dynamicStyles = node.style.dynamic || [];

    if (dynamicStyles.length === 0) {
      return { base: baseStyle, dynamic: [] };
    }

    // 1. 모든 dynamic styles의 키 수집
    const allDynamicKeys = new Set<string>();
    dynamicStyles.forEach((dynamic) => {
      Object.keys(dynamic.style).forEach((key) => allDynamicKeys.add(key));
    });

    // 2. 각 키에 대해 모든 dynamic styles에서 같은 값인지 확인
    const commonProperties: Record<string, any> = {};

    for (const key of allDynamicKeys) {
      const firstValue = dynamicStyles[0].style[key];
      if (firstValue === undefined) continue;

      // 모든 dynamic styles에서 같은 값인지 확인
      const allSame = dynamicStyles.every(
        (dynamic) => dynamic.style[key] === firstValue
      );

      if (allSame) {
        // 공통 속성 발견 → base로 이동
        commonProperties[key] = firstValue;
      }
    }

    // 3. Base style에 공통 속성 추가
    Object.assign(baseStyle, commonProperties);

    // 4. Dynamic styles에서 공통 속성 제거
    const optimizedDynamic = dynamicStyles
      .map((dynamic) => {
        const optimizedStyle = { ...dynamic.style };
        Object.keys(commonProperties).forEach((key) => {
          delete optimizedStyle[key];
        });
        return {
          condition: dynamic.condition,
          style: optimizedStyle,
        };
      })
      .filter((dynamic) => Object.keys(dynamic.style).length > 0); // 빈 스타일 제거

    return { base: baseStyle, dynamic: optimizedDynamic };
  }

  /**
   * 테스트용: 생성되는 코드 문자열 확인 (전체 합쳐서)
   */
  public testCodeGeneration(): void {
    console.log("=== 스타일 데이터 확인 ===\n");

    // 모든 노드의 스타일 데이터 확인
    traverseBFS(this.astTree, (node) => {
      const baseStyle = node.style.base || {};
      const dynamicStyles = node.style.dynamic || [];

      if (Object.keys(baseStyle).length > 0 || dynamicStyles.length > 0) {
        console.log(`\n[노드: ${node.name}]`);
        console.log(`Base style:`, baseStyle);
        console.log(`Dynamic styles 개수:`, dynamicStyles.length);

        // 공통화 전
        const allDynamicKeys = new Set<string>();
        dynamicStyles.forEach((dynamic) => {
          Object.keys(dynamic.style).forEach((key) => allDynamicKeys.add(key));
        });

        const commonInDynamic: Record<string, any> = {};
        for (const key of allDynamicKeys) {
          const firstValue = dynamicStyles[0]?.style[key];
          if (
            firstValue !== undefined &&
            dynamicStyles.every((d) => d.style[key] === firstValue)
          ) {
            commonInDynamic[key] = firstValue;
          }
        }

        if (Object.keys(commonInDynamic).length > 0) {
          console.log(`⚠️ Dynamic styles에서 공통 속성 발견:`, commonInDynamic);
        }

        if (dynamicStyles.length > 0) {
          dynamicStyles.forEach((dynamic, index) => {
            console.log(`  Dynamic ${index}:`, {
              condition: dynamic.condition,
              style: dynamic.style,
            });
          });
        }
      }
    });

    console.log("\n=== 전체 컴포넌트 코드 ===\n");

    // generateComponentCode 사용
    const fullCode = this.generateComponentCode("Button");
    console.log(fullCode);

    console.log("\n=== 코드 생성 완료 ===");
  }

  /**
   * 테스트용: ESTree 변환 결과 확인
   */
  public testEstreeConversion(): void {
    console.log("=== ESTree 변환 테스트 시작 ===");

    const collectConditions = (
      node: FinalAstTree
    ): Array<{ nodeName: string; condition: any }> => {
      const conditions: Array<{ nodeName: string; condition: any }> = [];

      if (node.visible.type === "condition") {
        conditions.push({
          nodeName: node.name,
          condition: node.visible.condition,
        });
      }

      for (const child of node.children) {
        conditions.push(...collectConditions(child));
      }

      return conditions;
    };

    const conditions = collectConditions(this.astTree);
    console.log(`조건 개수: ${conditions.length}`);

    conditions.forEach(({ nodeName, condition }, index) => {
      console.log(`\n[${index + 1}] 노드: ${nodeName}`);
      console.log("ESTree 조건:", JSON.stringify(condition, null, 2));

      try {
        const tsExpression = this._convertEstreeToTsExpression(condition);
        const sourceFile = ts.createSourceFile(
          "test.ts",
          "",
          ts.ScriptTarget.Latest,
          false,
          ts.ScriptKind.TS
        );
        const printer = ts.createPrinter();
        const code = printer.printNode(
          ts.EmitHint.Expression,
          tsExpression,
          sourceFile
        );
        console.log("TypeScript Expression:", code);
      } catch (error) {
        console.error("변환 에러:", error);
      }
    });

    console.log("\n=== ESTree 변환 테스트 종료 ===");
  }
}

export default ReactGenerator;
