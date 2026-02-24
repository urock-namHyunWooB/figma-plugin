/**
 * TailwindStrategy
 *
 * Tailwind CSS 스타일 전략
 * CSS 속성을 Tailwind 유틸리티 클래스로 변환
 */

import type { StyleObject, PseudoClass } from "../../../../types/types";
import type { IStyleStrategy, StyleResult, JsxStyleAttribute } from "./IStyleStrategy";

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
    if (!this.options.inlineCn) {
      return [`import { cn } from "${this.options.cnImportPath}"`];
    }
    return [];
  }

  /**
   * cn 함수 생성 (스타일 선언부에 포함)
   */
  getCnFunction(): string {
    if (!this.options.inlineCn) {
      return "";
    }
    return `const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");`;
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

    // dynamic 스타일 (조건부 스타일)
    const dynamicCode = this.generateDynamicStyleCode(variableName, style);
    const hasDynamicStyles = dynamicCode.length > 0;

    // 빈 스타일 체크
    if (!hasBaseStyles && !hasPseudoStyles && !hasDynamicStyles) {
      return { variableName, code: "", isEmpty: true };
    }

    const codeParts: string[] = [];

    // base + pseudo 스타일
    if (hasBaseStyles || hasPseudoStyles) {
      const allClasses = [...baseClasses, ...pseudoClassesList];
      codeParts.push(`const ${variableName} = "${allClasses.join(" ")}";`);
    }

    // dynamic 스타일 객체
    if (hasDynamicStyles) {
      codeParts.push(dynamicCode);
    }

    return { variableName, code: codeParts.join("\n\n"), isEmpty: false };
  }

  /**
   * dynamic 스타일을 variant별 클래스 객체로 변환
   */
  private generateDynamicStyleCode(baseVarName: string, style: StyleObject): string {
    if (!style.dynamic || style.dynamic.length === 0) {
      return "";
    }

    // variant prop별로 그룹화 (첫 번째 eq 조건 기준)
    const variantGroups = new Map<string, Map<string, Record<string, string | number>>>();

    for (const { condition, style: dynStyle } of style.dynamic) {
      const propInfo = this.extractVariantProp(condition);
      if (!propInfo) continue;

      const { propName, propValue } = propInfo;

      if (!variantGroups.has(propName)) {
        variantGroups.set(propName, new Map());
      }

      const existing = variantGroups.get(propName)!.get(propValue);
      if (!existing) {
        variantGroups.get(propName)!.set(propValue, dynStyle);
      }
    }

    if (variantGroups.size === 0) {
      return "";
    }

    // 각 variant prop에 대해 클래스 객체 생성
    const codeParts: string[] = [];

    for (const [propName, valueMap] of variantGroups) {
      const entries: string[] = [];

      for (const [value, dynStyle] of valueMap) {
        const classes = this.cssObjectToTailwind(dynStyle);
        if (classes.length > 0) {
          entries.push(`  ${value}: "${classes.join(" ")}",`);
        }
      }

      if (entries.length > 0) {
        const varName = `${baseVarName}_${propName}Styles`;
        codeParts.push(`const ${varName} = {\n${entries.join("\n")}\n};`);
      }
    }

    return codeParts.join("\n\n");
  }

  /**
   * ConditionNode에서 variant prop 정보 추출
   */
  private extractVariantProp(
    condition: import("../../../../types/types").ConditionNode
  ): { propName: string; propValue: string } | null {
    // eq 타입인 경우
    if (condition.type === "eq" && typeof condition.value === "string") {
      return { propName: condition.prop, propValue: condition.value };
    }

    // and 타입인 경우 첫 번째 eq 조건 찾기
    if (condition.type === "and") {
      for (const cond of condition.conditions) {
        if (cond.type === "eq" && typeof cond.value === "string") {
          return { propName: cond.prop, propValue: cond.value };
        }
      }
    }

    return null;
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
      if (camelProperty === "borderRadius") {
        return `${prefix}-[${this.escapeArbitraryValue(valueStr)}]`;
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
   * ID 기반 변수명 생성 (Fallback, 안전성 우선)
   * 예: nodeId="133:603", nodeName="Label" → "label_133_603"
   */
  private createIdBasedName(nodeId: string, nodeName: string): string {
    const safeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
    const safeName = this.toCamelCase(nodeName) || "unnamed";
    const result = `${safeName}_${safeId}`;
    // Ensure it doesn't start with a digit
    return /^[0-9]/.test(result) ? `_${result}` : result;
  }

}
