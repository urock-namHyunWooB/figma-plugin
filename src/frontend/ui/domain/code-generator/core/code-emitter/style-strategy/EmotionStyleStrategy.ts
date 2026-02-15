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
  PropStyleGroup,
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
      node.styles?.dynamic || [],
      props
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
   *
   * propStyles가 있으면 분석 없이 바로 사용 (TreeBuilder에서 분석 완료)
   * 없으면 기존 분석 로직 사용 (하위 호환)
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

    // propStyles가 있으면 TreeBuilder에서 분석된 결과 사용
    // 없으면 기존 분석 로직 사용 (하위 호환)
    const groupedDynamicStyles = node.styles?.propStyles
      ? this.convertPropStylesToGrouped(node.styles.propStyles)
      : this.groupDynamicStylesByProp(node.styles?.dynamic || [], props);

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

    // Boolean props 식별 (True/False, true/false 키를 가진 prop)
    const booleanStyleProps = new Set<string>();
    for (const [propName, variants] of groupedDynamicStyles.entries()) {
      const keys = Array.from(variants.keys());
      const hasTrueFalse = keys.some(k => k.toLowerCase() === "true") &&
                           keys.some(k => k.toLowerCase() === "false");
      if (hasTrueFalse) {
        booleanStyleProps.add(propName);
      }
    }

    // Variant props: 기존 Record 패턴 유지 (boolean은 제외)
    for (const [propName, variants] of groupedDynamicStyles.entries()) {
      // propName은 lowercase, slotProps도 실제 prop name과 비교 (lowercase로 비교)
      if (slotProps.some((sp) => sp.toLowerCase() === propName)) continue;
      // pseudo로 처리되는 prop은 Record 생성 제외
      if (pseudoHandledProps.has(propName)) continue;
      // boolean props는 Record 대신 ternary로 처리하므로 제외
      if (booleanStyleProps.has(propName)) {
        // Boolean prop: 다른 variant prop(Color)에 의존하는지 확인
        const booleanByVariant = this.extractBooleanStylesByVariant(
          propName,
          node.styles?.dynamic || [],
          props
        );

        const baseName = cssVarName.replace(/Css$/, "");
        const propCapitalized = capitalize(propName);

        if (booleanByVariant) {
          // Color별로 다른 스타일 → Record 생성
          const { dependsOn, trueStyles, falseStyles, trueInvariant } = booleanByVariant;
          const depCapitalized = capitalize(dependsOn);

          if (trueInvariant && Object.keys(trueInvariant).length > 0) {
            // True가 invariant인 경우: 단일 TrueCss 생성
            const trueVarName = `${baseName}${propCapitalized}TrueCss`;
            statements.push(this.createTemplateLiteralCss(trueVarName, trueInvariant));
          } else if (trueStyles.size > 0) {
            const recordVarName = `${baseName}${propCapitalized}TrueBy${depCapitalized}`;
            const recordStatement = this.createRecordStatement(recordVarName, trueStyles);
            statements.push(recordStatement);
          }
          if (falseStyles.size > 0) {
            const recordVarName = `${baseName}${propCapitalized}FalseBy${depCapitalized}`;
            const recordStatement = this.createRecordStatement(recordVarName, falseStyles);
            statements.push(recordStatement);
          }
        } else {
          // 단일 스타일
          const trueStyle = variants.get("True") || variants.get("true");
          const falseStyle = variants.get("False") || variants.get("false");
          const hasTrueStyle = trueStyle && Object.keys(trueStyle).length > 0;
          const hasFalseStyle = falseStyle && Object.keys(falseStyle).length > 0;
          if (hasTrueStyle) {
            const trueVarName = `${baseName}${propCapitalized}TrueCss`;
            statements.push(this.createTemplateLiteralCss(trueVarName, trueStyle));
          }
          if (hasFalseStyle) {
            const falseVarName = `${baseName}${propCapitalized}FalseCss`;
            statements.push(this.createTemplateLiteralCss(falseVarName, falseStyle));
          }
        }
        continue;
      }
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
      slotProps,
      props,
      booleanStyleProps
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
   * 같은 prop/value에 여러 스타일이 있으면:
   *   1. 먼저 공통 속성 추출 시도
   *   2. 공통 속성이 없으면, 다른 prop들이 기본값인 variant의 스타일 사용
   */
  private groupDynamicStylesByProp(
    dynamicStyles: StyleDefinition["dynamic"],
    props: PropDefinition[] = []
  ): Map<string, Map<string, Record<string, string | number>>> {
    // 0단계: 각 prop의 기본값 맵 생성
    // customXxx → xxx 매핑도 추가 (조건에서는 원래 prop 이름 사용)
    const propDefaults = new Map<string, string>();
    for (const prop of props) {
      if (prop.defaultValue !== undefined) {
        const name = prop.name.toLowerCase();
        propDefaults.set(name, String(prop.defaultValue));
        // customXxx → xxx 매핑 추가
        if (name.startsWith("custom")) {
          propDefaults.set(name.slice(6), String(prop.defaultValue));
        }
      }
    }

    // 1단계: 모든 스타일 수집 (조건 정보 포함)
    interface StyleWithConditions {
      style: Record<string, string | number>;
      conditions: ExtractedCondition[];
    }
    const collected = new Map<
      string,
      Map<string, Array<StyleWithConditions>>
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
        variants.get(propValue)!.push({ style, conditions: allConditions });
      }
    }

    // 2단계: Boolean prop 여부 먼저 판별 (True/False 키 존재 여부)
    const booleanProps = new Set<string>();
    for (const [propName, variants] of collected.entries()) {
      const keys = Array.from(variants.keys());
      const hasTrueFalse = keys.some(k => k.toLowerCase() === "true") &&
                           keys.some(k => k.toLowerCase() === "false");
      if (hasTrueFalse) {
        booleanProps.add(propName);
      }
    }

    // 3단계: 각 prop/value에 대해 대표 스타일 추출
    const grouped = new Map<
      string,
      Map<string, Record<string, string | number>>
    >();

    for (const [propName, variants] of collected.entries()) {
      grouped.set(propName, new Map());

      // 해당 prop의 모든 값에 대한 스타일 수집 (prop별 스타일 비교용)
      const allVariantsForProp = Array.from(variants.entries()).flatMap(
        ([pv, entries]) => entries.map(e => ({ propValue: pv, ...e }))
      );

      for (const [propValue, styleEntries] of variants.entries()) {
        if (styleEntries.length === 1) {
          // 스타일이 하나뿐이면 그대로 사용
          grouped.get(propName)!.set(propValue, styleEntries[0].style);
        } else {
          // 여러 스타일이 있으면 공통 속성 추출 시도
          const styles = styleEntries.map(e => e.style);
          const commonStyle = this.extractCommonStyles(styles);

          if (Object.keys(commonStyle).length > 0) {
            grouped.get(propName)!.set(propValue, commonStyle);
          } else {
            // 공통 스타일이 없으면, 해당 prop이 변경하는 속성만 추출
            const defaultStyle = this.findPropSpecificStyle(
              propName,
              propValue,
              allVariantsForProp,
              propDefaults
            );
            if (defaultStyle && Object.keys(defaultStyle).length > 0) {
              grouped.get(propName)!.set(propValue, defaultStyle);
            } else if (booleanProps.has(propName)) {
              // Boolean prop의 경우, 스타일이 없어도 빈 객체로 등록
              grouped.get(propName)!.set(propValue, {});
            }
          }
        }
      }
    }

    return grouped;
  }

  /**
   * 해당 prop이 실제로 변경하는 스타일 속성만 추출
   *
   * 1. 다른 prop들을 기본값으로 고정
   * 2. 대상 prop의 각 값에 대한 스타일 수집 (모든 prop 값 포함)
   * 3. prop 값에 따라 변하는 속성만 추출
   */
  private findPropSpecificStyle(
    targetPropName: string,
    targetPropValue: string,
    allVariants: Array<{ propValue: string; style: Record<string, string | number>; conditions: ExtractedCondition[] }>,
    propDefaults: Map<string, string>
  ): Record<string, string | number> | null {
    // 1. 다른 prop들이 기본값인 variant들만 필터 (모든 prop 값 포함)
    const defaultVariants: Array<{ propValue: string; style: Record<string, string | number> }> = [];

    for (const entry of allVariants) {
      let allOtherPropsAreDefault = true;

      for (const cond of entry.conditions) {
        const condPropName = cond.propName.toLowerCase();

        // 대상 prop은 스킵
        if (condPropName === targetPropName.toLowerCase()) continue;

        const defaultValue = propDefaults.get(condPropName);
        if (defaultValue === undefined) continue;

        const condValue = cond.propValue.toLowerCase();
        const defaultLower = defaultValue.toLowerCase();

        if (condValue !== defaultLower) {
          allOtherPropsAreDefault = false;
          break;
        }
      }

      if (allOtherPropsAreDefault) {
        defaultVariants.push({ propValue: entry.propValue, style: entry.style });
      }
    }

    // 2. 기본값 조건의 variant가 없으면 null 반환
    if (defaultVariants.length === 0) {
      return null;
    }

    // 2.5. Boolean prop의 기본값은 스타일 생성 안 함
    // (variant prop은 Record에 모든 값이 필요하므로 기본값도 포함)
    const targetPropDefault = propDefaults.get(targetPropName.toLowerCase());
    const isBooleanValue = targetPropValue.toLowerCase() === "true" ||
                           targetPropValue.toLowerCase() === "false";
    if (isBooleanValue &&
        targetPropDefault &&
        targetPropDefault.toLowerCase() === targetPropValue.toLowerCase()) {
      return null;
    }

    // 3. 대상 prop 값의 스타일 찾기
    const targetVariant = defaultVariants.find(v => v.propValue === targetPropValue);
    if (!targetVariant) {
      return null;
    }

    // 4. 다른 prop 값들과 비교하여 변하는 속성만 추출
    const result: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(targetVariant.style)) {
      const normalizedValue = this.extractCssVarFallback(value);

      // 같은 prop의 다른 값들과 비교
      let variesByProp = false;
      for (const other of defaultVariants) {
        if (other.propValue === targetPropValue) continue;

        const otherValue = other.style[key];
        if (otherValue === undefined) {
          variesByProp = true;
          break;
        }

        if (this.extractCssVarFallback(otherValue) !== normalizedValue) {
          variesByProp = true;
          break;
        }
      }

      // 해당 prop에 의해 변하는 속성만 포함
      if (variesByProp) {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Boolean prop의 스타일이 다른 variant prop에 따라 달라지는지 확인하고,
   * 달라지면 variant prop을 키로 하는 Map 반환
   *
   * @returns Map<variantPropValue, style> 또는 null (의존성 없으면)
   */
  private findBooleanStyleByVariant(
    targetPropName: string,
    targetPropValue: string,
    allVariants: Array<{ propValue: string; style: Record<string, string | number>; conditions: ExtractedCondition[] }>,
    propDefaults: Map<string, string>
  ): { dependsOn: string; styles: Map<string, Record<string, string | number>> } | null {
    const isBooleanValue = targetPropValue.toLowerCase() === "true" ||
                           targetPropValue.toLowerCase() === "false";
    if (!isBooleanValue) return null;

    // Boolean prop의 기본값이면 스킵
    const targetPropDefault = propDefaults.get(targetPropName.toLowerCase());
    if (targetPropDefault && targetPropDefault.toLowerCase() === targetPropValue.toLowerCase()) {
      return null;
    }

    // Size prop을 기본값으로 고정하고, 다른 variant prop(Color 등)별로 스타일 수집
    const stylesByVariantProp = new Map<string, Map<string, Record<string, string | number>>>();

    for (const entry of allVariants) {
      if (entry.propValue !== targetPropValue) continue;

      // 조건에서 다른 prop들 확인
      for (const cond of entry.conditions) {
        const condPropName = cond.propName.toLowerCase();
        if (condPropName === targetPropName.toLowerCase()) continue;

        // Size prop이 기본값이 아니면 스킵
        const sizeDefault = propDefaults.get("size");
        const sizeInCond = entry.conditions.find(c => c.propName.toLowerCase() === "size");
        if (sizeDefault && sizeInCond && sizeInCond.propValue.toLowerCase() !== sizeDefault.toLowerCase()) {
          continue;
        }

        // variant prop별로 스타일 수집 (Color 등)
        const propDefault = propDefaults.get(condPropName);
        if (propDefault === undefined) continue; // variant prop이 아님

        if (!stylesByVariantProp.has(condPropName)) {
          stylesByVariantProp.set(condPropName, new Map());
        }
        stylesByVariantProp.get(condPropName)!.set(cond.propValue, entry.style);
      }
    }

    // 가장 많은 스타일을 가진 variant prop 선택 (보통 Color)
    let bestProp: string | null = null;
    let bestStyles: Map<string, Record<string, string | number>> | null = null;

    for (const [propName, styles] of stylesByVariantProp) {
      if (!bestStyles || styles.size > bestStyles.size) {
        bestProp = propName;
        bestStyles = styles;
      }
    }

    if (!bestProp || !bestStyles || bestStyles.size <= 1) {
      return null; // 의존성 없음 (모든 variant에서 같은 스타일)
    }

    // 스타일이 실제로 다른지 확인
    const styleValues = Array.from(bestStyles.values());
    const firstStyle = JSON.stringify(styleValues[0]);
    const allSame = styleValues.every(s => JSON.stringify(s) === firstStyle);
    if (allSame) {
      return null; // 모두 같으면 의존성 없음
    }

    return { dependsOn: bestProp, styles: bestStyles };
  }

  /**
   * Boolean prop의 스타일을 다른 variant prop별로 추출
   * 예: Disabled=True일 때 Color별로 다른 스타일이면 Color를 키로 하는 Map 반환
   */
  private extractBooleanStylesByVariant(
    boolPropName: string,
    dynamicStyles: StyleDefinition["dynamic"],
    props: PropDefinition[]
  ): {
    dependsOn: string;
    trueStyles: Map<string, Record<string, string | number>>;
    falseStyles: Map<string, Record<string, string | number>>;
    /** True가 invariant이고 False가 variant에 의존하는 경우 */
    trueInvariant?: Record<string, string | number>;
  } | null {
    // variant prop 찾기 (Size, Color 등)
    const variantProps = props.filter(p => p.type === "variant");
    if (variantProps.length === 0) return null;

    // Size의 기본값 찾기
    const sizeDefault = props.find(p => p.name.toLowerCase() === "size")?.defaultValue?.toString().toLowerCase();

    // Boolean prop의 True/False 스타일을 variant prop별로 수집
    const trueByVariant = new Map<string, Map<string, Record<string, string | number>>>();
    const falseByVariant = new Map<string, Map<string, Record<string, string | number>>>();

    for (const { condition, style } of dynamicStyles) {
      const conditions = this.extractAllConditions(condition);
      if (conditions.length === 0) continue;

      // Boolean prop 값 찾기
      const boolCond = conditions.find(c => c.propName.toLowerCase() === boolPropName.toLowerCase());
      if (!boolCond) continue;

      // Size가 기본값이 아니면 스킵 (Size 영향 제외)
      const sizeCond = conditions.find(c => c.propName.toLowerCase() === "size");
      if (sizeDefault && sizeCond && sizeCond.propValue.toLowerCase() !== sizeDefault) {
        continue;
      }

      // 다른 variant prop별로 스타일 수집
      for (const cond of conditions) {
        const condName = cond.propName.toLowerCase();
        if (condName === boolPropName.toLowerCase() || condName === "size") continue;

        // variant prop인지 확인
        const isVariantProp = variantProps.some(p => p.name.toLowerCase() === condName);
        if (!isVariantProp) continue;

        const targetMap = boolCond.propValue.toLowerCase() === "true" ? trueByVariant : falseByVariant;
        if (!targetMap.has(condName)) {
          targetMap.set(condName, new Map());
        }
        targetMap.get(condName)!.set(cond.propValue, style);
      }
    }

    // 가장 많은 variant를 가진 prop 선택 (보통 Color)
    let bestProp: string | null = null;
    let bestTrueMap: Map<string, Record<string, string | number>> = new Map();
    let bestFalseMap: Map<string, Record<string, string | number>> = new Map();

    for (const [propName, styles] of trueByVariant) {
      if (styles.size > bestTrueMap.size) {
        bestProp = propName;
        bestTrueMap = styles;
        bestFalseMap = falseByVariant.get(propName) || new Map();
      }
    }

    if (!bestProp || bestTrueMap.size <= 1) {
      return null; // 의존성 없음
    }

    // True 스타일이 모두 같은지 확인 (invariant True)
    const trueStyleValues = Array.from(bestTrueMap.values());
    const falseStyleValues = Array.from(bestFalseMap.values());

    // 스타일 속성별로 True가 invariant인지 확인
    const trueInvariantStyle: Record<string, string | number> = {};
    const firstTrueStyle = trueStyleValues[0] || {};

    for (const [key, value] of Object.entries(firstTrueStyle)) {
      const normalized = this.extractCssVarFallback(value);
      const allTrueSame = trueStyleValues.every(s =>
        this.extractCssVarFallback(s[key] || "") === normalized
      );
      if (allTrueSame) {
        trueInvariantStyle[key] = value;
      }
    }

    // False 스타일이 variant별로 다른지 확인
    const falseVariesByVariant = falseStyleValues.length > 1 &&
      Object.keys(firstTrueStyle).some(key => {
        const values = falseStyleValues.map(s => this.extractCssVarFallback(s[key] || ""));
        return new Set(values).size > 1;
      });

    // 패턴 1: True가 invariant이고 False가 variant에 의존
    // 예: 텍스트 색상 - Disabled=True면 모두 gray, False면 Color별로 다름
    if (Object.keys(trueInvariantStyle).length > 0 && falseVariesByVariant) {
      // True와 False에서 실제로 다른 속성만 필터링
      const propsAffectedByBoolean = new Set<string>();
      for (const [variantValue, trueStyle] of bestTrueMap) {
        const falseStyle = bestFalseMap.get(variantValue) || {};
        for (const [key, trueVal] of Object.entries(trueStyle)) {
          const falseVal = falseStyle[key];
          if (falseVal === undefined) continue;
          if (this.extractCssVarFallback(trueVal) !== this.extractCssVarFallback(falseVal)) {
            propsAffectedByBoolean.add(key);
          }
        }
      }

      if (propsAffectedByBoolean.size === 0) {
        return null;
      }

      // trueInvariant에서 영향받는 속성만 필터링
      const filteredTrueInvariant: Record<string, string | number> = {};
      for (const key of propsAffectedByBoolean) {
        if (trueInvariantStyle[key] !== undefined) {
          filteredTrueInvariant[key] = trueInvariantStyle[key];
        }
      }

      // False styles 수집 (모든 variant 포함)
      const filteredFalseMap = new Map<string, Record<string, string | number>>();
      for (const [variantValue, falseStyle] of bestFalseMap) {
        const falseFiltered: Record<string, string | number> = {};
        for (const key of propsAffectedByBoolean) {
          if (falseStyle[key] !== undefined) {
            falseFiltered[key] = falseStyle[key];
          }
        }
        filteredFalseMap.set(variantValue, falseFiltered);
      }

      return {
        dependsOn: bestProp,
        trueStyles: new Map(),  // 빈 맵 (invariant이므로)
        falseStyles: filteredFalseMap,
        trueInvariant: filteredTrueInvariant,
      };
    }

    // 패턴 2: True도 variant에 의존 (기존 로직)
    // True 스타일이 모두 같으면 의존성 없음으로 처리
    if (trueStyleValues.length > 1) {
      const firstStyleKeys = Object.keys(firstTrueStyle);
      const allTrueSame = firstStyleKeys.every(key => {
        const firstVal = this.extractCssVarFallback(firstTrueStyle[key] || "");
        return trueStyleValues.every(s =>
          this.extractCssVarFallback(s[key] || "") === firstVal
        );
      });
      if (allTrueSame) {
        return null;
      }
    }

    // 먼저 Boolean prop에 의해 실제로 변하는 스타일 속성 찾기
    const propsAffectedByBoolean = new Set<string>();

    for (const [variantValue, trueStyle] of bestTrueMap) {
      const falseStyle = bestFalseMap.get(variantValue) || {};

      for (const [key, trueVal] of Object.entries(trueStyle)) {
        const falseVal = falseStyle[key];
        if (falseVal === undefined) continue;

        const trueNorm = this.extractCssVarFallback(trueVal);
        const falseNorm = this.extractCssVarFallback(falseVal);

        if (trueNorm !== falseNorm) {
          propsAffectedByBoolean.add(key);
        }
      }
    }

    // Boolean에 영향받는 속성이 없으면 의존성 없음
    if (propsAffectedByBoolean.size === 0) {
      return null;
    }

    // 모든 variant에 대해 해당 속성만 추출 (빈 객체도 포함하여 TypeScript 안전성 보장)
    const filteredTrueMap = new Map<string, Record<string, string | number>>();
    const filteredFalseMap = new Map<string, Record<string, string | number>>();

    for (const [variantValue, trueStyle] of bestTrueMap) {
      const falseStyle = bestFalseMap.get(variantValue) || {};

      const trueFiltered: Record<string, string | number> = {};
      const falseFiltered: Record<string, string | number> = {};

      for (const key of propsAffectedByBoolean) {
        if (trueStyle[key] !== undefined) {
          trueFiltered[key] = trueStyle[key];
        }
        if (falseStyle[key] !== undefined) {
          falseFiltered[key] = falseStyle[key];
        }
      }

      // 모든 variant 포함 (빈 객체도 포함)
      filteredTrueMap.set(variantValue, trueFiltered);
      filteredFalseMap.set(variantValue, falseFiltered);
    }

    return {
      dependsOn: bestProp,
      trueStyles: filteredTrueMap,
      falseStyles: filteredFalseMap,
    };
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
    slotProps: string[] = [],
    props: PropDefinition[] = [],
    booleanStyleProps: Set<string> = new Set()
  ): ts.VariableStatement {
    const baseStyles = node.styles?.base || {};
    const pseudoStyles = node.styles?.pseudo || {};

    if (dynamicProps.length > 0) {
      // 함수로 생성: const cssVarName = (size, disabled) => [baseCss, sizeStyles[size], disabled ? trueCss : falseCss]
      const parameters = dynamicProps.map((propName) => {
        const propNameLower = propName.toLowerCase();
        const originalPropName = propNameLower.startsWith("custom")
          ? propNameLower.slice(6)
          : propNameLower;

        // prop 정의에서 타입 확인
        const propDef = props.find(
          p => p.name.toLowerCase() === propNameLower ||
               p.name.toLowerCase() === originalPropName
        );

        // boolean prop이거나 booleanStyleProps에 포함된 경우 boolean 타입 사용
        const isBooleanProp = propDef?.type === "boolean" ||
                              booleanStyleProps.has(propNameLower) ||
                              booleanStyleProps.has(originalPropName);

        const typeNode = isBooleanProp
          ? this.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
          : this.factory.createTypeReferenceNode(capitalize(propName), undefined);

        return this.factory.createParameterDeclaration(
          undefined,
          undefined,
          this.factory.createIdentifier(propName),
          undefined,
          typeNode,
          undefined
        );
      });

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
          // Boolean prop: variant prop에 의존하는지 확인
          if (booleanStyleProps.has(recordKey)) {
            const baseName = cssVarName.replace(/Css$/, "");
            const propCapitalized = capitalize(recordKey);

            // Boolean 스타일이 다른 variant prop에 의존하는지 확인
            const booleanByVariant = this.extractBooleanStylesByVariant(
              recordKey,
              node.styles?.dynamic || [],
              props
            );

            if (booleanByVariant) {
              // Color별로 다른 스타일 → Record 접근
              const { dependsOn, trueStyles, falseStyles, trueInvariant } = booleanByVariant;
              const depCapitalized = capitalize(dependsOn);
              const hasTrueInvariant = trueInvariant && Object.keys(trueInvariant).length > 0;
              const hasTrueStyles = trueStyles.size > 0;
              const hasFalseStyles = falseStyles.size > 0;

              // dependsOn prop의 실제 변수명 찾기 (customColor → color 등)
              const depVarName = dynamicProps.find(p =>
                p.toLowerCase() === dependsOn ||
                p.toLowerCase() === `custom${dependsOn}`
              ) || dependsOn;

              if (hasTrueInvariant && hasFalseStyles) {
                // True가 invariant: propName ? TrueCss : FalseByColor[color]
                const trueCssName = `${baseName}${propCapitalized}TrueCss`;
                const falseRecordName = `${baseName}${propCapitalized}FalseBy${depCapitalized}`;
                const ternaryExpr = this.factory.createConditionalExpression(
                  this.factory.createIdentifier(propName),
                  this.factory.createToken(ts.SyntaxKind.QuestionToken),
                  this.factory.createIdentifier(trueCssName),
                  this.factory.createToken(ts.SyntaxKind.ColonToken),
                  this.factory.createElementAccessExpression(
                    this.factory.createIdentifier(falseRecordName),
                    this.factory.createIdentifier(depVarName)
                  )
                );
                cssArrayElements.push(ternaryExpr);
              } else if (hasTrueInvariant) {
                // True만 있으면 (invariant): propName && TrueCss
                const trueCssName = `${baseName}${propCapitalized}TrueCss`;
                const andExpr = this.factory.createBinaryExpression(
                  this.factory.createIdentifier(propName),
                  this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                  this.factory.createIdentifier(trueCssName)
                );
                cssArrayElements.push(andExpr);
              } else if (hasTrueStyles && hasFalseStyles) {
                // 둘 다 있으면: propName ? TrueByColor[color] : FalseByColor[color]
                const trueRecordName = `${baseName}${propCapitalized}TrueBy${depCapitalized}`;
                const falseRecordName = `${baseName}${propCapitalized}FalseBy${depCapitalized}`;
                const ternaryExpr = this.factory.createConditionalExpression(
                  this.factory.createIdentifier(propName),
                  this.factory.createToken(ts.SyntaxKind.QuestionToken),
                  this.factory.createElementAccessExpression(
                    this.factory.createIdentifier(trueRecordName),
                    this.factory.createIdentifier(depVarName)
                  ),
                  this.factory.createToken(ts.SyntaxKind.ColonToken),
                  this.factory.createElementAccessExpression(
                    this.factory.createIdentifier(falseRecordName),
                    this.factory.createIdentifier(depVarName)
                  )
                );
                cssArrayElements.push(ternaryExpr);
              } else if (hasTrueStyles) {
                // True만 있으면: propName && TrueByColor[color]
                const trueRecordName = `${baseName}${propCapitalized}TrueBy${depCapitalized}`;
                const andExpr = this.factory.createBinaryExpression(
                  this.factory.createIdentifier(propName),
                  this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                  this.factory.createElementAccessExpression(
                    this.factory.createIdentifier(trueRecordName),
                    this.factory.createIdentifier(depVarName)
                  )
                );
                cssArrayElements.push(andExpr);
              } else if (hasFalseStyles) {
                // False만 있으면: !propName && FalseByColor[color]
                const falseRecordName = `${baseName}${propCapitalized}FalseBy${depCapitalized}`;
                const andExpr = this.factory.createBinaryExpression(
                  this.factory.createPrefixUnaryExpression(
                    ts.SyntaxKind.ExclamationToken,
                    this.factory.createIdentifier(propName)
                  ),
                  this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                  this.factory.createElementAccessExpression(
                    this.factory.createIdentifier(falseRecordName),
                    this.factory.createIdentifier(depVarName)
                  )
                );
                cssArrayElements.push(andExpr);
              }
            } else {
              // 단일 스타일
              const trueCssName = `${baseName}${propCapitalized}TrueCss`;
              const falseCssName = `${baseName}${propCapitalized}FalseCss`;

              const variants = groupedDynamicStyles.get(recordKey);
              const trueStyle = variants?.get("True") || variants?.get("true");
              const falseStyle = variants?.get("False") || variants?.get("false");
              const hasTrueStyle = trueStyle && Object.keys(trueStyle).length > 0;
              const hasFalseStyle = falseStyle && Object.keys(falseStyle).length > 0;

              if (hasTrueStyle && hasFalseStyle) {
                const ternaryExpr = this.factory.createConditionalExpression(
                  this.factory.createIdentifier(propName),
                  this.factory.createToken(ts.SyntaxKind.QuestionToken),
                  this.factory.createIdentifier(trueCssName),
                  this.factory.createToken(ts.SyntaxKind.ColonToken),
                  this.factory.createIdentifier(falseCssName)
                );
                cssArrayElements.push(ternaryExpr);
              } else if (hasTrueStyle) {
                const andExpr = this.factory.createBinaryExpression(
                  this.factory.createIdentifier(propName),
                  this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                  this.factory.createIdentifier(trueCssName)
                );
                cssArrayElements.push(andExpr);
              } else if (hasFalseStyle) {
                const andExpr = this.factory.createBinaryExpression(
                  this.factory.createPrefixUnaryExpression(
                    ts.SyntaxKind.ExclamationToken,
                    this.factory.createIdentifier(propName)
                  ),
                  this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                  this.factory.createIdentifier(falseCssName)
                );
                cssArrayElements.push(andExpr);
              }
            }
            // 둘 다 없으면 아무것도 추가 안 함
          } else {
            // Record 변수명은 groupedDynamicStyles의 키와 일치해야 함
            const recordVarName = `${cssVarName}${capitalize(recordKey)}Styles`;
            const elementAccess = this.factory.createElementAccessExpression(
              this.factory.createIdentifier(recordVarName),
              this.factory.createIdentifier(propName)
            );
            cssArrayElements.push(elementAccess);
          }
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
   * TreeBuilder의 propStyles를 기존 groupedDynamicStyles 형식으로 변환
   *
   * propStyles 구조:
   *   { size: { type: "variant", variants: { Large: {...}, Medium: {...} } } }
   *
   * groupedDynamicStyles 구조:
   *   Map<"size", Map<"Large" | "Medium", Record<string, string | number>>>
   */
  private convertPropStylesToGrouped(
    propStyles: Record<string, PropStyleGroup>
  ): Map<string, Map<string, Record<string, string | number>>> {
    const result = new Map<string, Map<string, Record<string, string | number>>>();

    for (const [propName, group] of Object.entries(propStyles)) {
      const variants = new Map<string, Record<string, string | number>>();

      // Boolean prop with dependsOn: "True:Primary" → "True", "False:Primary" → "False"
      if (group.dependsOn) {
        for (const [key, style] of Object.entries(group.variants)) {
          const [boolValue] = key.split(":");
          if (!variants.has(boolValue)) {
            variants.set(boolValue, {});
          }
          // 기존 스타일과 병합
          variants.set(boolValue, { ...variants.get(boolValue), ...style });
        }
      } else {
        // 일반 variant/slot/boolean
        for (const [value, style] of Object.entries(group.variants)) {
          variants.set(value, style);
        }
      }

      result.set(propName, variants);
    }

    return result;
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
