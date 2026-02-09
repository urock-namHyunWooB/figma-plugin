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
} from "@code-generator/types/architecture";
import type { ConditionNode } from "@code-generator/types/customType";
import type { IStyleStrategy, DynamicStyleInfo } from "./IStyleStrategy";
import { normalizeName, capitalize } from "@code-generator/utils/stringUtils";

/**
 * 조건에서 추출된 prop 정보
 */
interface ExtractedCondition {
  propName: string;
  propValue: string;
}

/**
 * kebab-case를 camelCase로 변환
 * 예: "stroke-width" → "strokeWidth", "font-family" → "fontFamily"
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
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
    const groupedDynamicStyles = this.groupDynamicStylesByProp(
      node.styles?.dynamic || []
    );

    // Slot props vs variant props 분리
    const slotProps = this.getSlotDynamicProps(dynamicProps, props);
    const variantProps = dynamicProps.filter((p) => !slotProps.includes(p));

    let cssExpression: ts.Expression;

    if (slotProps.length > 0) {
      // Slot props: css={[HeaderrootCss, rightIcon != null ? WithCss : WithoutCss]}
      cssExpression = this.createSlotCssArrayExpression(
        cssVarName,
        slotProps,
        variantProps,
        groupedDynamicStyles
      );
    } else if (variantProps.length > 0) {
      // Variant props only: 함수 호출: cssVarName(size, variant)
      const args = variantProps.map((p) => this.factory.createIdentifier(p));
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
   * Slot props용 CSS 배열 표현식 생성
   */
  private createSlotCssArrayExpression(
    cssVarName: string,
    slotProps: string[],
    variantProps: string[],
    groupedDynamicStyles: Map<
      string,
      Map<string, Record<string, string | number>>
    >
  ): ts.Expression {
    const elements: ts.Expression[] = [];

    // Base CSS (variantProps가 있으면 함수 호출)
    if (variantProps.length > 0) {
      const args = variantProps.map((p) => this.factory.createIdentifier(p));
      elements.push(
        this.factory.createCallExpression(
          this.factory.createIdentifier(cssVarName),
          undefined,
          args
        )
      );
    } else {
      elements.push(this.factory.createIdentifier(cssVarName));
    }

    // Slot prop별 conditional expression
    for (const slotProp of slotProps) {
      const baseName = cssVarName.replace(/Css$/, "");
      const slotCapitalized = capitalize(slotProp);
      const withCssName = `${baseName}With${slotCapitalized}Css`;
      const withoutCssName = `${baseName}Without${slotCapitalized}Css`;

      // Check which styles actually exist
      const variants = groupedDynamicStyles.get(slotProp.toLowerCase());
      const hasWithStyle = variants?.get("True") || variants?.get("true");
      const hasWithoutStyle = variants?.get("False") || variants?.get("false");

      // Only add conditional if at least one style exists
      if (hasWithStyle && hasWithoutStyle) {
        // Both exist: slotProp != null ? WithCss : WithoutCss
        const conditional = this.factory.createConditionalExpression(
          this.factory.createBinaryExpression(
            this.factory.createIdentifier(slotProp),
            this.factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
            this.factory.createNull()
          ),
          this.factory.createToken(ts.SyntaxKind.QuestionToken),
          this.factory.createIdentifier(withCssName),
          this.factory.createToken(ts.SyntaxKind.ColonToken),
          this.factory.createIdentifier(withoutCssName)
        );
        elements.push(conditional);
      } else if (hasWithStyle) {
        // Only With style exists: slotProp != null && WithCss
        const conditional = this.factory.createBinaryExpression(
          this.factory.createBinaryExpression(
            this.factory.createIdentifier(slotProp),
            this.factory.createToken(ts.SyntaxKind.ExclamationEqualsToken),
            this.factory.createNull()
          ),
          this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
          this.factory.createIdentifier(withCssName)
        );
        elements.push(conditional);
      } else if (hasWithoutStyle) {
        // Only Without style exists: slotProp == null && WithoutCss
        const conditional = this.factory.createBinaryExpression(
          this.factory.createBinaryExpression(
            this.factory.createIdentifier(slotProp),
            this.factory.createToken(ts.SyntaxKind.EqualsEqualsToken),
            this.factory.createNull()
          ),
          this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
          this.factory.createIdentifier(withoutCssName)
        );
        elements.push(conditional);
      }
      // If neither exists, don't add anything
    }

    return this.factory.createArrayLiteralExpression(elements, false);
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
    const groupedDynamicStyles = this.groupDynamicStylesByProp(
      node.styles?.dynamic || []
    );

    // Slot props vs variant props 분리
    const slotProps = this.getSlotDynamicProps(dynamicProps, props);
    const variantProps = dynamicProps.filter((p) => !slotProps.includes(p));

    // Slot props: With/Without 별도 CSS 변수 생성 (template literal)
    for (const slotProp of slotProps) {
      const variants = groupedDynamicStyles.get(slotProp.toLowerCase());
      if (!variants) continue;

      const baseName = cssVarName.replace(/Css$/, "");
      const slotCapitalized = capitalize(slotProp);

      // With CSS (True/true 값)
      const withStyle = variants.get("True") || variants.get("true");
      if (withStyle) {
        const withVarName = `${baseName}With${slotCapitalized}Css`;
        statements.push(this.createTemplateLiteralCss(withVarName, withStyle));
      }

      // Without CSS (False/false 값)
      const withoutStyle = variants.get("False") || variants.get("false");
      if (withoutStyle) {
        const withoutVarName = `${baseName}Without${slotCapitalized}Css`;
        statements.push(
          this.createTemplateLiteralCss(withoutVarName, withoutStyle)
        );
      }
    }

    // pseudo 스타일이 있으면 state prop은 CSS pseudo-class로 처리되므로 제외
    const hasPseudoStyles = node.styles?.pseudo && Object.keys(node.styles.pseudo).length > 0;
    const pseudoHandledProps = new Set<string>();
    if (hasPseudoStyles) {
      pseudoHandledProps.add("state");
    }

    // Variant props: 기존 Record 패턴 유지
    for (const [propName, variants] of groupedDynamicStyles.entries()) {
      // propName은 lowercase, slotProps도 실제 prop name과 비교 (lowercase로 비교)
      if (slotProps.some((sp) => sp.toLowerCase() === propName)) continue;
      // pseudo로 처리되는 prop은 Record 생성 제외
      if (pseudoHandledProps.has(propName)) continue;
      const recordVarName = `${cssVarName}${capitalize(propName)}Styles`;
      const recordStatement = this.createRecordStatement(
        recordVarName,
        variants
      );
      statements.push(recordStatement);
    }

    // CSS 함수 또는 변수 생성 (slot props는 제외)
    const cssStatement = this.createCssStatement(
      node,
      cssVarName,
      variantProps,
      groupedDynamicStyles,
      slotProps
    );
    statements.push(cssStatement);

    return statements;
  }

  /**
   * Template literal CSS 변수 생성
   */
  private createTemplateLiteralCss(
    varName: string,
    style: Record<string, string | number>
  ): ts.VariableStatement {
    const cssProperties = Object.entries(style)
      .map(([key, value]) => {
        const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
        return `  ${kebabKey}: ${value};`;
      })
      .join("\n");

    const template = this.factory.createNoSubstitutionTemplateLiteral(
      `\n${cssProperties}\n`
    );

    const taggedTemplate = this.factory.createTaggedTemplateExpression(
      this.factory.createIdentifier("css"),
      undefined,
      template
    );

    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            varName,
            undefined,
            undefined,
            taggedTemplate
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * dynamicProps 중 slot 타입인 것들만 필터링
   */
  private getSlotDynamicProps(
    dynamicProps: string[],
    props: PropDefinition[]
  ): string[] {
    return dynamicProps.filter((propName) => {
      const prop = props.find(
        (p) => p.name.toLowerCase() === propName.toLowerCase()
      );
      return prop?.type === "slot";
    });
  }

  /**
   * dynamic 스타일을 prop별로 그룹화
   * 복합 조건의 경우 모든 prop에 대해 그룹화
   * 같은 prop/value에 여러 스타일이 있으면 공통 속성만 추출
   */
  private groupDynamicStylesByProp(
    dynamicStyles: StyleDefinition["dynamic"]
  ): Map<string, Map<string, Record<string, string | number>>> {
    // 1단계: 모든 스타일 수집 (덮어쓰지 않고 배열로)
    const collected = new Map<
      string,
      Map<string, Array<Record<string, string | number>>>
    >();

    for (const { condition, style } of dynamicStyles) {
      const allConditions = this.extractAllConditions(condition);
      if (allConditions.length === 0) continue;

      for (const { propName, propValue } of allConditions) {
        const normalizedPropName = propName.toLowerCase();
        if (!collected.has(normalizedPropName)) {
          collected.set(normalizedPropName, new Map());
        }
        const variants = collected.get(normalizedPropName)!;
        if (!variants.has(propValue)) {
          variants.set(propValue, []);
        }
        variants.get(propValue)!.push(style);
      }
    }

    // 2단계: 각 prop/value에 대해 공통 속성만 추출
    const grouped = new Map<
      string,
      Map<string, Record<string, string | number>>
    >();

    for (const [propName, variants] of collected.entries()) {
      grouped.set(propName, new Map());
      for (const [propValue, styles] of variants.entries()) {
        if (styles.length === 1) {
          // 스타일이 하나뿐이면 그대로 사용
          grouped.get(propName)!.set(propValue, styles[0]);
        } else {
          // 여러 스타일이 있으면 공통 속성만 추출
          const commonStyle = this.extractCommonStyles(styles);
          if (Object.keys(commonStyle).length > 0) {
            grouped.get(propName)!.set(propValue, commonStyle);
          }
        }
      }
    }

    return grouped;
  }

  /**
   * CSS 변수에서 fallback 값 추출
   * "var(--Color-text-00, #FFF)" → "#FFF"
   * "18px" → "18px" (그대로)
   */
  private extractCssVarFallback(value: string | number): string {
    if (typeof value !== "string") return String(value);

    // var(--xxx, fallback) 패턴 매칭
    const match = value.match(/^var\([^,]+,\s*(.+)\)$/);
    if (match) {
      return match[1].trim();
    }
    return value;
  }

  /**
   * 여러 스타일에서 공통 속성만 추출
   * Size에 따라 달라지는 속성(fontSize 등)은 제외됨
   * CSS 변수와 raw 값이 섞여 있어도 fallback 값이 같으면 동일하게 처리
   */
  private extractCommonStyles(
    styles: Array<Record<string, string | number>>
  ): Record<string, string | number> {
    if (styles.length === 0) return {};
    if (styles.length === 1) return styles[0];

    const common: Record<string, string | number> = {};
    const firstStyle = styles[0];

    for (const [key, value] of Object.entries(firstStyle)) {
      // 모든 스타일에서 동일한 값인지 확인 (CSS 변수 fallback 고려)
      const normalizedValue = this.extractCssVarFallback(value);
      const isCommon = styles.every((s) => {
        const otherValue = s[key];
        if (otherValue === undefined) return false;
        return this.extractCssVarFallback(otherValue) === normalizedValue;
      });

      if (isCommon) {
        // CSS 변수가 있는 값을 우선 사용 (더 의미 있는 값)
        const preferredValue =
          styles.find(
            (s) => typeof s[key] === "string" && String(s[key]).startsWith("var(")
          )?.[key] ?? value;
        common[key] = preferredValue;
      }
    }

    return common;
  }

  /**
   * 조건에서 모든 prop-value 쌍 추출 (복합 조건 지원)
   */
  private extractAllConditions(condition: ConditionNode): ExtractedCondition[] {
    if (!condition) return [];
    const results: ExtractedCondition[] = [];

    if (condition.type === "BinaryExpression") {
      const extracted = this.extractFromBinaryExpression(condition as any);
      if (extracted) results.push(extracted);
    } else if (condition.type === "LogicalExpression") {
      const logical = condition as any;
      results.push(...this.extractAllConditions(logical.left));
      results.push(...this.extractAllConditions(logical.right));
    }

    return results;
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
   * 항상 template literal 형식 사용: css`...`
   */
  private createCssStatement(
    node: DesignNode,
    cssVarName: string,
    dynamicProps: string[],
    groupedDynamicStyles: Map<
      string,
      Map<string, Record<string, string | number>>
    >,
    slotProps: string[] = []
  ): ts.VariableStatement {
    const baseStyles = node.styles?.base || {};
    const pseudoStyles = node.styles?.pseudo || {};

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

      // Base CSS as tagged template
      const baseCssExpr = this.createCssTaggedTemplateExpression(
        baseStyles,
        pseudoStyles
      );

      // CSS 배열: [baseCss, sizeStyles[size], ...]
      const cssArrayElements: ts.Expression[] = [baseCssExpr];

      for (const propName of dynamicProps) {
        // groupedDynamicStyles는 조건에서 추출된 원래 prop 이름을 키로 사용
        // dynamicProps는 rename된 이름 (customType)을 사용
        // 둘 다 확인: customType → type, customDisabled → disabled 등
        const propNameLower = propName.toLowerCase();
        const originalPropName = propNameLower.startsWith("custom")
          ? propNameLower.slice(6)
          : propNameLower;

        // groupedDynamicStyles에서 실제 사용하는 키 찾기
        const recordKey = groupedDynamicStyles.has(propNameLower)
          ? propNameLower
          : groupedDynamicStyles.has(originalPropName)
            ? originalPropName
            : null;

        if (recordKey) {
          // Record 변수명은 groupedDynamicStyles의 키와 일치해야 함
          const recordVarName = `${cssVarName}${capitalize(recordKey)}Styles`;
          const elementAccess = this.factory.createElementAccessExpression(
            this.factory.createIdentifier(recordVarName),
            this.factory.createIdentifier(propName)
          );
          cssArrayElements.push(elementAccess);
        }
      }

      const bodyExpression =
        cssArrayElements.length > 1
          ? this.factory.createArrayLiteralExpression(cssArrayElements, false)
          : baseCssExpr;

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
      // 변수로 생성: const cssVarName = css`...`
      return this.createBaseCssAsTemplateLiteral(
        cssVarName,
        baseStyles,
        pseudoStyles
      );
    }
  }

  /**
   * CSS tagged template expression 생성 (변수가 아닌 표현식 자체)
   */
  private createCssTaggedTemplateExpression(
    baseStyles: Record<string, string | number>,
    pseudoStyles: Record<string, Record<string, string | number>>
  ): ts.TaggedTemplateExpression {
    const cssLines: string[] = [];

    for (const [key, value] of Object.entries(baseStyles)) {
      const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      cssLines.push(`  ${kebabKey}: ${value};`);
    }

    for (const [pseudo, styles] of Object.entries(pseudoStyles)) {
      cssLines.push(`  &${pseudo} {`);
      for (const [key, value] of Object.entries(styles)) {
        const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
        cssLines.push(`    ${kebabKey}: ${value};`);
      }
      cssLines.push(`  }`);
    }

    const cssContent = cssLines.length > 0 ? `\n${cssLines.join("\n")}\n` : "";
    const template =
      this.factory.createNoSubstitutionTemplateLiteral(cssContent);

    return this.factory.createTaggedTemplateExpression(
      this.factory.createIdentifier("css"),
      undefined,
      template
    );
  }

  /**
   * Base CSS를 template literal로 생성
   */
  private createBaseCssAsTemplateLiteral(
    cssVarName: string,
    baseStyles: Record<string, string | number>,
    pseudoStyles: Record<string, Record<string, string | number>>
  ): ts.VariableStatement {
    const cssLines: string[] = [];

    for (const [key, value] of Object.entries(baseStyles)) {
      const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      cssLines.push(`  ${kebabKey}: ${value};`);
    }

    for (const [pseudo, styles] of Object.entries(pseudoStyles)) {
      cssLines.push(`  &${pseudo} {`);
      for (const [key, value] of Object.entries(styles)) {
        const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
        cssLines.push(`    ${kebabKey}: ${value};`);
      }
      cssLines.push(`  }`);
    }

    const cssContent = cssLines.length > 0 ? `\n${cssLines.join("\n")}\n` : "";
    const template =
      this.factory.createNoSubstitutionTemplateLiteral(cssContent);
    const taggedTemplate = this.factory.createTaggedTemplateExpression(
      this.factory.createIdentifier("css"),
      undefined,
      template
    );

    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            cssVarName,
            undefined,
            undefined,
            taggedTemplate
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * css() 호출 생성
   */
  private createCssCall(
    style: Record<string, string | number>
  ): ts.CallExpression {
    const styleProperties: ts.PropertyAssignment[] = [];

    for (const [key, value] of Object.entries(style)) {
      const camelKey = kebabToCamel(key);
      styleProperties.push(
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(camelKey),
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
   * 단순 조건: props.size === "Large" → { propName: "size", propValue: "Large" }
   * 복합 조건: props.size === "Large" && props.leftIcon === "false" → 첫 번째 prop 추출
   */
  private extractCondition(
    condition: ConditionNode
  ): ExtractedCondition | null {
    if (!condition) {
      return null;
    }

    // BinaryExpression: props.X === "value"
    if (condition.type === "BinaryExpression") {
      return this.extractFromBinaryExpression(condition as any);
    }

    // LogicalExpression: 복합 조건에서 첫 번째 BinaryExpression 추출
    if (condition.type === "LogicalExpression") {
      return this.extractFromLogicalExpression(condition as any);
    }

    return null;
  }

  /**
   * BinaryExpression에서 prop 추출
   */
  private extractFromBinaryExpression(
    binaryExpr: any
  ): ExtractedCondition | null {
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
        const camelPropName =
          propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          propName: camelPropName,
          propValue: String(propValue),
        };
      }
    }

    return null;
  }

  /**
   * LogicalExpression에서 첫 번째 BinaryExpression 추출 (재귀)
   * 구조: (left && right) && right → left부터 탐색
   */
  private extractFromLogicalExpression(
    logicalExpr: any
  ): ExtractedCondition | null {
    // 왼쪽부터 탐색 (가장 중요한 prop이 보통 먼저 옴)
    if (logicalExpr.left) {
      if (logicalExpr.left.type === "BinaryExpression") {
        return this.extractFromBinaryExpression(logicalExpr.left);
      }
      if (logicalExpr.left.type === "LogicalExpression") {
        return this.extractFromLogicalExpression(logicalExpr.left);
      }
    }

    // 왼쪽에서 못 찾으면 오른쪽 탐색
    if (logicalExpr.right) {
      if (logicalExpr.right.type === "BinaryExpression") {
        return this.extractFromBinaryExpression(logicalExpr.right);
      }
      if (logicalExpr.right.type === "LogicalExpression") {
        return this.extractFromLogicalExpression(logicalExpr.right);
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

    return this.hasStylesInDefinition(styles);
  }

  /**
   * StyleDefinition에 스타일이 있는지 확인
   */
  private hasStylesInDefinition(styles: StyleDefinition): boolean {
    const hasBase = styles.base && Object.keys(styles.base).length > 0;
    const hasDynamic = styles.dynamic && styles.dynamic.length > 0;
    const hasPseudo = styles.pseudo && Object.keys(styles.pseudo).length > 0;

    return hasBase || hasDynamic || hasPseudo;
  }

  /**
   * 노드에서 동적 prop 이름들 수집
   * 복합 조건(A && B)에서 모든 prop을 추출
   * 단, pseudo 스타일로 처리되는 prop(state)은 제외
   */
  private collectDynamicProps(
    node: DesignNode,
    props: PropDefinition[]
  ): string[] {
    const dynamicStyles = node.styles?.dynamic;
    if (!dynamicStyles || dynamicStyles.length === 0) return [];

    // pseudo 스타일이 있으면 state prop은 CSS pseudo-class로 처리되므로 제외
    const hasPseudoStyles = node.styles?.pseudo && Object.keys(node.styles.pseudo).length > 0;
    const pseudoHandledProps = new Set<string>();
    if (hasPseudoStyles) {
      // state prop은 pseudo로 처리됨
      pseudoHandledProps.add("state");
    }

    const propNames: string[] = [];

    for (const { condition } of dynamicStyles) {
      // 복합 조건에서 모든 prop 추출
      const allConditions = this.extractAllConditions(condition);

      for (const extracted of allConditions) {
        // pseudo로 처리되는 prop은 건너뜀
        if (pseudoHandledProps.has(extracted.propName.toLowerCase())) {
          continue;
        }

        // props에 존재하는지 확인하고, 실제 prop.name 사용 (case 일치 보장)
        // HTML 충돌 prop도 매칭 (type → customType, disabled → customDisabled 등)
        const matchedProp = props.find(
          (p) =>
            p.name.toLowerCase() === extracted.propName.toLowerCase() ||
            p.name.toLowerCase() ===
              `custom${extracted.propName}`.toLowerCase()
        );
        if (matchedProp && !propNames.includes(matchedProp.name)) {
          propNames.push(matchedProp.name);
        }
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
