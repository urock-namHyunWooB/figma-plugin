/**
 * EmotionStyleStrategy
 *
 * DesignTree용 Emotion CSS-in-JS 전략 구현
 * css() 함수와 Record 객체를 사용하여 스타일을 생성합니다.
 *
 * 생성 예시:
 * ```typescript
 * const buttonSizeStyles = {
 *   Large: css({ padding: "16px" }),
 *   Medium: css({ padding: "12px" }),
 * };
 *
 * const buttonCss = (size: Size) => css({
 *   display: "flex",
 *   ...buttonSizeStyles[size]
 * });
 * ```
 */

import ts from "typescript";
import type {
  DesignTree,
  DesignNode,
  PropDefinition,
  StyleDefinition,
} from "@compiler/types/architecture";
import type { ConditionNode } from "@compiler/types/customType";
import type { IStyleStrategy, DynamicStyleInfo } from "./IStyleStrategy";
import { normalizeName, capitalize } from "@compiler/utils/stringUtils";

/**
 * 조건에서 추출된 prop 정보
 */
interface ExtractedCondition {
  propName: string;
  propValue: string;
}

class EmotionStyleStrategy implements IStyleStrategy {
  readonly name = "emotion" as const;

  private factory: ts.NodeFactory;

  /** 노드별 생성된 CSS 변수명 캐시 */
  private cssVarNameCache: Map<string, string> = new Map();
  /** 변수명 중복 추적 */
  private usedNames: Map<string, number> = new Map();
  /** 컴포넌트 이름 (루트 노드용) */
  private componentName: string | undefined;

  constructor(factory: ts.NodeFactory) {
    this.factory = factory;
  }

  /**
   * Emotion import 문 생성
   */
  generateImports(): ts.ImportDeclaration[] {
    return [
      this.factory.createImportDeclaration(
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
        this.factory.createStringLiteral("@emotion/react")
      ),
    ];
  }

  /**
   * CSS 변수 및 스타일 객체 선언 생성
   */
  generateDeclarations(
    tree: DesignTree,
    componentName: string,
    props: PropDefinition[]
  ): ts.Statement[] {
    this.componentName = componentName;
    const statements: ts.Statement[] = [];

    // 트리 순회하며 각 노드의 스타일 변수 생성
    this.traverseTree(tree.root, (node) => {
      const nodeStatements = this.createNodeStyleStatements(
        node,
        props,
        componentName
      );
      statements.push(...nodeStatements);
    });

    return statements;
  }

  /**
   * css={} 속성 생성
   */
  createStyleAttribute(
    node: DesignNode,
    props: PropDefinition[]
  ): ts.JsxAttribute | null {
    const hasStyles = this.hasStyles(node);
    if (!hasStyles) {
      return null;
    }

    const cssVarName = this.getCssVariableName(node, this.componentName || "");
    const dynamicProps = this.collectDynamicProps(node, props);

    let cssExpression: ts.Expression;

    if (dynamicProps.length > 0) {
      // 함수 호출: cssVarName(size, variant)
      const args = dynamicProps.map((p) =>
        this.factory.createIdentifier(p)
      );
      cssExpression = this.factory.createCallExpression(
        this.factory.createIdentifier(cssVarName),
        undefined,
        args
      );
    } else {
      // 변수 참조: cssVarName
      cssExpression = this.factory.createIdentifier(cssVarName);
    }

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("css"),
      this.factory.createJsxExpression(undefined, cssExpression)
    );
  }

  /**
   * 동적 스타일 정보 조회
   */
  getDynamicStyleInfo(node: DesignNode): DynamicStyleInfo | null {
    const dynamicStyles = node.styles?.dynamic;
    if (!dynamicStyles || dynamicStyles.length === 0) {
      return null;
    }

    const propToVariants = new Map<string, string[]>();
    const variantStyles = new Map<string, string>();

    for (const { condition, style } of dynamicStyles) {
      const extracted = this.extractCondition(condition);
      if (!extracted) continue;

      if (!propToVariants.has(extracted.propName)) {
        propToVariants.set(extracted.propName, []);
      }
      propToVariants.get(extracted.propName)!.push(extracted.propValue);

      const key = `${extracted.propName}:${extracted.propValue}`;
      variantStyles.set(key, JSON.stringify(style));
    }

    return { propToVariants, variantStyles };
  }

  /**
   * CSS 변수 이름 조회
   */
  getCssVariableName(node: DesignNode, componentName: string): string {
    if (this.cssVarNameCache.has(node.id)) {
      return this.cssVarNameCache.get(node.id)!;
    }

    const baseName = this.getNodeBaseName(node, componentName);
    const varName = this.generateUniqueVarName(`${normalizeName(baseName)}Css`);

    this.cssVarNameCache.set(node.id, varName);
    return varName;
  }

  /**
   * 노드의 스타일 statement들 생성
   */
  private createNodeStyleStatements(
    node: DesignNode,
    props: PropDefinition[],
    componentName: string
  ): ts.Statement[] {
    const statements: ts.Statement[] = [];

    if (!this.hasStyles(node)) {
      return statements;
    }

    const cssVarName = this.getCssVariableName(node, componentName);
    const dynamicProps = this.collectDynamicProps(node, props);

    // 동적 스타일 Record 객체 생성 (prop별로 그룹화)
    const groupedDynamicStyles = this.groupDynamicStylesByProp(node.styles?.dynamic || []);

    if (groupedDynamicStyles.size > 0) {
      for (const [propName, variants] of groupedDynamicStyles.entries()) {
        const recordVarName = `${cssVarName}${capitalize(propName)}Styles`;
        const recordStatement = this.createRecordStatement(recordVarName, variants);
        statements.push(recordStatement);
      }
    }

    // CSS 함수 또는 변수 생성
    const cssStatement = this.createCssStatement(
      node,
      cssVarName,
      dynamicProps,
      groupedDynamicStyles
    );
    statements.push(cssStatement);

    return statements;
  }

  /**
   * dynamic 스타일을 prop별로 그룹화
   */
  private groupDynamicStylesByProp(
    dynamicStyles: StyleDefinition["dynamic"]
  ): Map<string, Map<string, Record<string, string | number>>> {
    const grouped = new Map<string, Map<string, Record<string, string | number>>>();

    for (const { condition, style } of dynamicStyles) {
      const extracted = this.extractCondition(condition);
      if (!extracted) continue;

      if (!grouped.has(extracted.propName)) {
        grouped.set(extracted.propName, new Map());
      }
      grouped.get(extracted.propName)!.set(extracted.propValue, style);
    }

    return grouped;
  }

  /**
   * Record 객체 statement 생성
   * const sizeStyles = { Large: css({...}), Medium: css({...}) };
   */
  private createRecordStatement(
    varName: string,
    variants: Map<string, Record<string, string | number>>
  ): ts.VariableStatement {
    const properties: ts.PropertyAssignment[] = [];

    for (const [value, style] of variants.entries()) {
      const cssCall = this.createCssCall(style);

      // 유효한 식별자인지 확인
      const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value);
      const propertyName = isValidIdentifier
        ? this.factory.createIdentifier(value)
        : this.factory.createStringLiteral(value);

      properties.push(
        this.factory.createPropertyAssignment(propertyName, cssCall)
      );
    }

    const objectLiteral = this.factory.createObjectLiteralExpression(
      properties,
      true
    );

    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            varName,
            undefined,
            undefined,
            objectLiteral
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * CSS 함수 또는 변수 statement 생성
   */
  private createCssStatement(
    node: DesignNode,
    cssVarName: string,
    dynamicProps: string[],
    groupedDynamicStyles: Map<string, Map<string, Record<string, string | number>>>
  ): ts.VariableStatement {
    const baseStyles = node.styles?.base || {};
    const pseudoStyles = node.styles?.pseudo || {};

    // Base 스타일 CSS 객체
    const styleProperties: ts.PropertyAssignment[] = [];

    // Base 스타일 추가
    for (const [key, value] of Object.entries(baseStyles)) {
      styleProperties.push(
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(key),
          this.factory.createStringLiteral(String(value))
        )
      );
    }

    // Pseudo 스타일 추가
    for (const [pseudo, styles] of Object.entries(pseudoStyles)) {
      const pseudoProperties: ts.PropertyAssignment[] = [];
      for (const [key, value] of Object.entries(styles as Record<string, string>)) {
        pseudoProperties.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier(key),
            this.factory.createStringLiteral(String(value))
          )
        );
      }

      const pseudoObject = this.factory.createObjectLiteralExpression(
        pseudoProperties,
        true
      );

      // &:hover 형태로 키 생성
      const pseudoKey = `&${pseudo}`;
      styleProperties.push(
        this.factory.createPropertyAssignment(
          this.factory.createStringLiteral(pseudoKey),
          pseudoObject
        )
      );
    }

    const styleObject = this.factory.createObjectLiteralExpression(
      styleProperties,
      true
    );

    const cssCall = this.factory.createCallExpression(
      this.factory.createIdentifier("css"),
      undefined,
      [styleObject]
    );

    if (dynamicProps.length > 0) {
      // 함수로 생성: const cssVarName = (size) => [baseCss, sizeStyles[size]]
      const parameters = dynamicProps.map((propName) =>
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          this.factory.createIdentifier(propName),
          undefined,
          this.factory.createTypeReferenceNode(capitalize(propName), undefined),
          undefined
        )
      );

      // CSS 배열: [baseCss, sizeStyles[size], ...]
      const cssArrayElements: ts.Expression[] = [cssCall];

      for (const propName of dynamicProps) {
        if (groupedDynamicStyles.has(propName)) {
          const recordVarName = `${cssVarName}${capitalize(propName)}Styles`;
          const elementAccess = this.factory.createElementAccessExpression(
            this.factory.createIdentifier(recordVarName),
            this.factory.createIdentifier(propName)
          );
          cssArrayElements.push(elementAccess);
        }
      }

      const bodyExpression = cssArrayElements.length > 1
        ? this.factory.createArrayLiteralExpression(cssArrayElements, false)
        : cssCall;

      const arrowFunction = this.factory.createArrowFunction(
        undefined,
        undefined,
        parameters,
        undefined,
        this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        bodyExpression
      );

      return this.factory.createVariableStatement(
        undefined,
        this.factory.createVariableDeclarationList(
          [
            this.factory.createVariableDeclaration(
              cssVarName,
              undefined,
              undefined,
              arrowFunction
            ),
          ],
          ts.NodeFlags.Const
        )
      );
    } else {
      // 변수로 생성: const cssVarName = css({...})
      return this.factory.createVariableStatement(
        undefined,
        this.factory.createVariableDeclarationList(
          [
            this.factory.createVariableDeclaration(
              cssVarName,
              undefined,
              undefined,
              cssCall
            ),
          ],
          ts.NodeFlags.Const
        )
      );
    }
  }

  /**
   * css() 호출 생성
   */
  private createCssCall(style: Record<string, string | number>): ts.CallExpression {
    const styleProperties: ts.PropertyAssignment[] = [];

    for (const [key, value] of Object.entries(style)) {
      styleProperties.push(
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(key),
          this.factory.createStringLiteral(String(value))
        )
      );
    }

    const styleObject = this.factory.createObjectLiteralExpression(
      styleProperties,
      true
    );

    return this.factory.createCallExpression(
      this.factory.createIdentifier("css"),
      undefined,
      [styleObject]
    );
  }

  /**
   * ConditionNode에서 prop 이름과 값 추출
   * 예: props.size === "Large" → { propName: "size", propValue: "Large" }
   */
  private extractCondition(condition: ConditionNode): ExtractedCondition | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    const binaryExpr = condition as any;

    // props.X === "value" 형태 처리
    if (
      binaryExpr.operator === "===" &&
      binaryExpr.left?.type === "MemberExpression" &&
      binaryExpr.left.object?.name === "props" &&
      binaryExpr.right?.type === "Literal"
    ) {
      const propName = binaryExpr.left.property?.name;
      const propValue = binaryExpr.right.value;

      if (propName && propValue !== undefined) {
        // camelCase로 변환 (Size → size)
        const camelPropName = propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          propName: camelPropName,
          propValue: String(propValue),
        };
      }
    }

    return null;
  }

  /**
   * 노드에 스타일이 있는지 확인
   */
  private hasStyles(node: DesignNode): boolean {
    const styles = node.styles;
    if (!styles) return false;

    const hasBase = styles.base && Object.keys(styles.base).length > 0;
    const hasDynamic = styles.dynamic && styles.dynamic.length > 0;
    const hasPseudo = styles.pseudo && Object.keys(styles.pseudo).length > 0;

    return hasBase || hasDynamic || hasPseudo;
  }

  /**
   * 노드에서 동적 prop 이름들 수집
   */
  private collectDynamicProps(
    node: DesignNode,
    props: PropDefinition[]
  ): string[] {
    const dynamicStyles = node.styles?.dynamic;
    if (!dynamicStyles || dynamicStyles.length === 0) return [];

    const propNames: string[] = [];

    for (const { condition } of dynamicStyles) {
      const extracted = this.extractCondition(condition);
      if (!extracted) continue;

      // props에 존재하는지 확인
      const exists = props.some((p) => p.name.toLowerCase() === extracted.propName.toLowerCase());
      if (exists && !propNames.includes(extracted.propName)) {
        propNames.push(extracted.propName);
      }
    }

    return propNames;
  }

  /**
   * 노드의 기본 이름 가져오기
   */
  private getNodeBaseName(node: DesignNode, componentName: string): string {
    // semanticRole이 'root'이면 componentName 사용
    if (node.semanticRole === "root") {
      return componentName;
    }

    // 숫자만 있는 이름은 semanticRole 사용
    const isNumericOnly = /^[0-9]+$/.test(node.name);
    if (isNumericOnly && node.semanticRole) {
      return node.semanticRole;
    }

    return node.name;
  }

  /**
   * 고유한 변수명 생성
   */
  private generateUniqueVarName(baseName: string): string {
    const count = this.usedNames.get(baseName) || 0;
    this.usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  }

  /**
   * 트리 순회
   */
  private traverseTree(
    node: DesignNode,
    callback: (node: DesignNode) => void
  ): void {
    callback(node);
    for (const child of node.children) {
      this.traverseTree(child, callback);
    }
  }
}

export default EmotionStyleStrategy;
