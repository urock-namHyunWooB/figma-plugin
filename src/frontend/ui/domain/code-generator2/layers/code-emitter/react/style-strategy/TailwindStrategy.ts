/**
 * TailwindStrategy
 *
 * Tailwind CSS 스타일 전략
 * CSS 속성을 Tailwind 유틸리티 클래스로 변환
 */

import type { StyleObject, PseudoClass } from "../../../../types/types";
import type { IStyleStrategy, StyleResult, JsxStyleAttribute } from "./IStyleStrategy";
import { groupDynamicByProp, type DecomposedValue } from "./groupDynamicByProp";
import { extractAllPropInfos } from "../../../../types/conditionUtils";

/**
 * CSS 속성+값 → Tailwind 클래스 매핑
 */
const CSS_TO_TAILWIND: Record<string, Record<string, string>> = {
  display: {
    flex: "flex",
    "inline-flex": "inline-flex",
    grid: "grid",
    block: "block",
    "inline-block": "inline-block",
    none: "hidden",
  },
  position: {
    absolute: "absolute",
    relative: "relative",
    fixed: "fixed",
    sticky: "sticky",
  },
  flexDirection: {
    row: "flex-row",
    column: "flex-col",
    "row-reverse": "flex-row-reverse",
    "column-reverse": "flex-col-reverse",
  },
  justifyContent: {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
  },
  alignItems: {
    "flex-start": "items-start",
    "flex-end": "items-end",
    center: "items-center",
    stretch: "items-stretch",
    baseline: "items-baseline",
  },
  textAlign: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
  },
  fontStyle: {
    normal: "not-italic",
    italic: "italic",
  },
  overflow: {
    hidden: "overflow-hidden",
    auto: "overflow-auto",
    scroll: "overflow-scroll",
    visible: "overflow-visible",
  },
};

/**
 * CSS 속성 → Tailwind 접두사
 */
const CSS_TO_PREFIX: Record<string, string> = {
  width: "w",
  minWidth: "min-w",
  maxWidth: "max-w",
  height: "h",
  minHeight: "min-h",
  maxHeight: "max-h",
  padding: "p",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  margin: "m",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  gap: "gap",
  borderRadius: "rounded",
  fontSize: "text",
  lineHeight: "leading",
  opacity: "opacity",
  zIndex: "z",
};

/**
 * Pseudo-class → Tailwind prefix
 */
const PSEUDO_TO_PREFIX: Record<PseudoClass, string> = {
  ":hover": "hover:",
  ":active": "active:",
  ":focus": "focus:",
  ":disabled": "disabled:",
  ":focus-visible": "focus-visible:",
  ":checked": "checked:",
  ":visited": "visited:",
};

export interface TailwindStrategyOptions {
  /** cn 함수를 인라인으로 생성할지 (기본: true) */
  inlineCn?: boolean;
  /** cn import 경로 (inlineCn: false일 때 사용) */
  cnImportPath?: string;
}

export class TailwindStrategy implements IStyleStrategy {
  readonly name = "tailwind";
  private readonly options: TailwindStrategyOptions;

  constructor(options: TailwindStrategyOptions = {}) {
    this.options = {
      inlineCn: options.inlineCn ?? true,
      cnImportPath: options.cnImportPath ?? "@/lib/cn",
    };
  }

  /**
   * import 문 생성
   */
  getImports(): string[] {
    return ['import { cva } from "class-variance-authority";'];
  }

  /**
   * cn 함수 생성 — cva 사용 시 불필요 (호환성을 위해 유지)
   */
  getCnFunction(): string {
    return "";
  }

  /**
   * StyleObject를 Tailwind 클래스로 변환
   */
  generateStyle(
    nodeId: string,
    nodeName: string,
    style: StyleObject,
    parentPath?: string[]
  ): StyleResult {
    // Step 1: 변수명 생성 (경로 기반 or ID 기반)
    const variableName = this.createVariableName(nodeId, nodeName, parentPath);

    // base 스타일 → Tailwind 클래스
    const baseClasses = this.cssObjectToTailwind(style.base);
    const hasBaseStyles = baseClasses.length > 0;

    // pseudo 스타일 → Tailwind 클래스 (prefix 붙임)
    const pseudoClassesList: string[] = [];
    if (style.pseudo) {
      for (const [pseudo, styles] of Object.entries(style.pseudo)) {
        const prefix = PSEUDO_TO_PREFIX[pseudo as PseudoClass];
        if (!prefix) continue;

        // base와 다른 속성만 추출
        const diffStyles = this.getDiffStyles(style.base, styles);
        if (Object.keys(diffStyles).length === 0) continue;

        const classes = this.cssObjectToTailwind(diffStyles);
        for (const cls of classes) {
          pseudoClassesList.push(`${prefix}${cls}`);
        }
      }
    }
    const hasPseudoStyles = pseudoClassesList.length > 0;

    // mediaQueries 스타일 → breakpoint prefix 클래스 (예: max-md:hidden, xl:w-[1600px])
    const mediaClasses: string[] = [];
    if (style.mediaQueries) {
      for (const { query, style: mqStyle } of style.mediaQueries) {
        const prefix = this.getBreakpointPrefix(query);
        const classes = this.cssObjectToTailwind(mqStyle);
        for (const cls of classes) {
          mediaClasses.push(`${prefix}:${cls}`);
        }
      }
    }
    const hasMediaStyles = mediaClasses.length > 0;

    // dynamic 스타일 (조건부 스타일) → cva variants 블록
    const dynamicResult = this.generateDynamicStyleCode(variableName, style);
    const hasDynamicStyles = dynamicResult.hasContent;

    // 빈 스타일 체크
    if (!hasBaseStyles && !hasPseudoStyles && !hasMediaStyles && !hasDynamicStyles) {
      return { variableName, code: "", isEmpty: true };
    }

    const allClasses = [...baseClasses, ...pseudoClassesList, ...mediaClasses];
    const baseStr = allClasses.join(" ");

    let code: string;
    if (hasDynamicStyles) {
      // cva() 함수로 base + variants 통합
      code = `const ${variableName} = cva(${this.wrapClassString(baseStr)}, {\n  variants: {\n${dynamicResult.code}\n  },\n});`;
    } else {
      // dynamic 없으면 plain string
      code = `const ${variableName} = ${this.wrapClassString(baseStr)};`;
    }

    return { variableName, code, isEmpty: false };
  }

  /**
   * @media 쿼리 문자열 → Tailwind 반응형 prefix
   * 예: "(max-width: 767px)"  → "max-md"
   *     "(min-width: 1280px)" → "xl"
   *     기타                  → "[@media(...)]" arbitrary
   */
  private getBreakpointPrefix(query: string): string {
    if (/max-width\s*:\s*767px/i.test(query)) return "max-md";
    if (/max-width\s*:\s*639px/i.test(query)) return "max-sm";
    if (/min-width\s*:\s*640px/i.test(query)) return "sm";
    if (/min-width\s*:\s*768px/i.test(query)) return "md";
    if (/min-width\s*:\s*1024px/i.test(query)) return "lg";
    if (/min-width\s*:\s*1280px/i.test(query)) return "xl";
    if (/min-width\s*:\s*1536px/i.test(query)) return "2xl";

    // arbitrary media query
    const inner = query.replace(/^\(|\)$/g, "").trim().replace(/\s+/g, "");
    return `[@media(${inner})]`;
  }

  /**
   * dynamic 스타일을 cva variants 블록으로 변환
   */
  private generateDynamicStyleCode(
    _baseVarName: string,
    style: StyleObject
  ): { code: string; hasContent: boolean } {
    if (!style.dynamic || style.dynamic.length === 0) {
      return { code: "", hasContent: false };
    }

    const variantGroups = groupDynamicByProp(style.dynamic);

    if (variantGroups.size === 0) {
      return { code: "", hasContent: false };
    }

    // pseudo selector → Tailwind variant prefix 매핑
    const pseudoToTwPrefix: Record<string, string> = {
      ":hover": "hover",
      ":active": "active",
      ":focus": "focus",
      ":disabled": "disabled",
      ":focus-visible": "focus-visible",
      ":checked": "checked",
      ":visited": "visited",
    };

    // 각 variant prop → cva variants 블록 내부 코드
    const variantParts: string[] = [];

    for (const [propName, valueMap] of variantGroups) {
      const entries: string[] = [];

      for (const [value, { style: dynStyle, pseudo }] of valueMap) {
        const classes = this.cssObjectToTailwind(dynStyle);

        // per-group pseudo → Tailwind variant prefix 적용
        if (pseudo) {
          for (const [selector, pseudoStyle] of Object.entries(pseudo)) {
            const prefix = pseudoToTwPrefix[selector];
            if (!prefix) continue;
            const pseudoClasses = this.cssObjectToTailwind(pseudoStyle as Record<string, string | number>);
            for (const cls of pseudoClasses) {
              classes.push(`${prefix}:${cls}`);
            }
          }
        }

        if (classes.length > 0) {
          const key = this.needsQuoting(value) ? `"${value}"` : value;
          const classStr = classes.join(" ");
          entries.push(`        ${key}: ${this.wrapClassString(classStr)},`);
        }
      }

      if (entries.length === 0) continue;

      // compound prop ("style+tone")은 cva variants로 표현 불가 → 건너뜀
      if (propName.includes("+")) continue;
      // Figma prop 이름에서 제어 문자 제거 (backspace 등)
      const safePropName = propName.replace(/[\x00-\x1f\x7f]/g, "");
      const propKey = this.needsQuoting(safePropName) ? `"${safePropName}"` : safePropName;
      variantParts.push(`    ${propKey}: {\n${entries.join("\n")}\n    },`);
    }

    return {
      code: variantParts.join("\n"),
      hasContent: variantParts.length > 0,
    };
  }

  /**
   * ConditionNode에서 모든 variant prop 정보 추출
   * and 조건의 경우 각 eq 조건을 모두 반환
   */
  private extractAllVariantProps(
    condition: import("../../../../types/types").ConditionNode
  ): Array<{ propName: string; propValue: string }> {
    return extractAllPropInfos(condition);
  }

  /**
   * JavaScript 객체 키로 사용 시 따옴표가 필요한지 확인
   * (하이픈, 공백 등 특수문자 포함 시 필요)
   */
  private needsQuoting(key: string): boolean {
    return !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
  }

  /**
   * base와 다른 스타일만 추출
   */
  private getDiffStyles(
    base: Record<string, string | number>,
    target: Record<string, string | number>
  ): Record<string, string | number> {
    const diff: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(target)) {
      if (base[key] !== value) {
        diff[key] = value;
      }
    }
    return diff;
  }

  /**
   * JSX 스타일 속성 생성
   */
  getJsxStyleAttribute(
    styleVariableName: string,
    hasConditionalStyles: boolean
  ): JsxStyleAttribute {
    if (hasConditionalStyles) {
      return {
        attributeName: "className",
        valueCode: `{cn(${styleVariableName}, conditionalClasses)}`,
      };
    }

    return {
      attributeName: "className",
      valueCode: `{${styleVariableName}}`,
    };
  }

  /**
   * 조건부 스타일 코드 생성
   */
  generateConditionalStyle(
    baseStyle: string,
    conditions: Array<{ condition: string; style: string }>
  ): string {
    const conditionStrs = conditions
      .map(({ condition, style }) => `  ${condition} && "${style}",`)
      .join("\n");

    return `const conditionalClasses = cn(\n${conditionStrs}\n);`;
  }

  /**
   * pseudo-class 스타일 코드 생성
   */
  generatePseudoStyle(
    pseudoClass: PseudoClass,
    style: Record<string, string | number>
  ): string {
    const prefix = PSEUDO_TO_PREFIX[pseudoClass] || "";
    const classes = this.cssObjectToTailwind(style);
    return classes.map((cls) => `${prefix}${cls}`).join(" ");
  }

  /**
   * CSS 객체를 Tailwind 클래스 배열로 변환
   */
  private cssObjectToTailwind(style: Record<string, string | number>): string[] {
    const classes: string[] = [];

    for (const [key, value] of Object.entries(style)) {
      const tailwindClass = this.cssPropertyToTailwind(key, String(value));
      if (tailwindClass) {
        classes.push(tailwindClass);
      }
    }

    return classes;
  }

  /**
   * 단일 CSS 속성을 Tailwind 클래스로 변환
   */
  private cssPropertyToTailwind(property: string, value: string): string {
    const valueStr = value.trim();

    // kebab → camelCase
    const camelProperty = this.kebabToCamel(property);

    // 정확한 매핑 확인
    const exactMap = CSS_TO_TAILWIND[camelProperty];
    if (exactMap && exactMap[valueStr]) {
      return exactMap[valueStr];
    }

    // 100% → full
    if (valueStr === "100%") {
      if (camelProperty === "width") return "w-full";
      if (camelProperty === "height") return "h-full";
    }

    // 접두사 기반 변환
    const prefix = CSS_TO_PREFIX[camelProperty];
    if (prefix) {
      // text-[var(...)]은 Tailwind이 color로 해석하므로 length: 타입 힌트 필요
      if (camelProperty === "fontSize") {
        return `${prefix}-[length:${this.escapeArbitraryValue(valueStr)}]`;
      }
      return `${prefix}-[${this.escapeArbitraryValue(valueStr)}]`;
    }

    // 색상 관련
    if (camelProperty === "color" || camelProperty === "fill") {
      return `[${this.camelToKebab(camelProperty)}:${this.escapeArbitraryValue(valueStr)}]`;
    }
    if (camelProperty === "backgroundColor" || camelProperty === "background") {
      return `[background-color:${this.escapeArbitraryValue(valueStr)}]`;
    }

    // font-family
    if (camelProperty === "fontFamily") {
      return `[font-family:${this.escapeArbitraryValue(valueStr)}]`;
    }

    // 기타: arbitrary property
    const cssKey = this.camelToKebab(camelProperty);
    return `[${cssKey}:${this.escapeArbitraryValue(valueStr)}]`;
  }

  /**
   * 클래스 문자열을 JS 리터럴로 감싸기
   * \_가 포함된 경우 String.raw를 사용해 백슬래시 보존
   */
  private wrapClassString(str: string): string {
    if (str.includes("\\")) {
      return "String.raw`" + str + "`";
    }
    return `"${str}"`;
  }

  /**
   * Arbitrary value 이스케이프
   */
  private escapeArbitraryValue(value: string): string {
    return value
      .trim()
      .replace(/\/\*.*?\*\//g, "") // CSS 주석 제거
      .trim()
      .replace(/_/g, "\\_") // underscore 이스케이프
      .replace(/\s+/g, "_") // 공백 → underscore
      .replace(/['"]/g, ""); // 따옴표 제거
  }

  /**
   * kebab-case → camelCase
   */
  private kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  /**
   * camelCase → kebab-case
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * camelCase 변환
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word, i) =>
        i === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");
  }

  /**
   * Tailwind 클래스 변수명 생성 (기본 이름만 생성, 고유성은 StylesGenerator가 보장)
   */
  private createVariableName(
    nodeId: string,
    nodeName: string,
    parentPath?: string[]
  ): string {
    return parentPath && parentPath.length > 0
      ? this.createPathBasedName(parentPath)
      : this.createIdBasedName(nodeId, nodeName);
  }

  /**
   * 경로 기반 변수명 생성 (가독성 우선)
   * 예: ["SelectButton", "Label"] → "selectButtonLabelClasses"
   */
  private createPathBasedName(parentPath: string[]): string {
    const pathNames = parentPath.map((name) => this.toCamelCase(name)).filter(Boolean);
    if (pathNames.length === 0) return "unnamedClasses";
    const combinedName = pathNames
      .map((name, i) =>
        i === 0
          ? name.charAt(0).toLowerCase() + name.slice(1)
          : name.charAt(0).toUpperCase() + name.slice(1)
      )
      .join("");

    // Ensure it doesn't start with a digit
    const safeName = /^[0-9]/.test(combinedName) ? `_${combinedName}` : combinedName;
    return `${safeName}Classes`;
  }

  /**
   * 이름 기반 변수명 생성 (Fallback, 충돌은 StylesGenerator.ensureUniqueNames이 처리)
   * 예: nodeName="SwitchResourceSwitchWrapper" → "switchResourceSwitchWrapperClasses"
   */
  private createIdBasedName(_nodeId: string, nodeName: string): string {
    const safeName = this.toCamelCase(nodeName) || "unnamed";
    return /^[0-9]/.test(safeName) ? `_${safeName}Classes` : `${safeName}Classes`;
  }

}
