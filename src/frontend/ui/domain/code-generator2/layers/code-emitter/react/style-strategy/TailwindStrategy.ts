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
  boxSizing: {
    "border-box": "box-border",
    "content-box": "box-content",
  },
  flexWrap: {
    wrap: "flex-wrap",
    nowrap: "flex-nowrap",
    "wrap-reverse": "flex-wrap-reverse",
  },
  flexShrink: {
    "0": "shrink-0",
    "1": "shrink",
  },
  flexGrow: {
    "0": "grow-0",
    "1": "grow",
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
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  letterSpacing: "tracking",
};

/**
 * Pseudo-class → Tailwind prefix
 */
const PSEUDO_TO_PREFIX: Partial<Record<PseudoClass, string>> = {
  ":hover": "hover:",
  ":active": "active:",
  ":focus": "focus:",
  ":disabled": "disabled:",
  ":focus-visible": "focus-visible:",
  ":checked": "checked:",
  ":visited": "visited:",
  "::placeholder": "placeholder:",
};

export interface TailwindStrategyOptions {
  /** cn 함수를 인라인으로 생성할지 (기본: true) */
  inlineCn?: boolean;
  /** cn import 경로 (inlineCn: false일 때 사용) */
  cnImportPath?: string;
}

export interface CompoundCondition {
  props: Record<string, string>; // { state: "default", style: "filled", tone: "blue" }
  className: string;
}

export class TailwindStrategy implements IStyleStrategy {
  readonly name = "tailwind";
  private readonly options: TailwindStrategyOptions;
  /** cva() 함수로 생성된 변수 이름 추적 (className 사용 시 호출 필요) */
  readonly cvaVariables = new Set<string>();
  /** variant prop별 전체 옵션 목록 (cva variants 완전성 보장) */
  private variantOptions = new Map<string, string[]>();
  /** compound 조건부 클래스 (변수명 → 조건 배열). JsxGenerator가 cn()으로 출력 */
  readonly compoundConditions = new Map<string, CompoundCondition[]>();
  /** 각 cva 변수에 선언된 variant prop 이름 */
  readonly declaredVariantProps = new Map<string, Set<string>>();

  constructor(options: TailwindStrategyOptions = {}) {
    this.options = {
      inlineCn: options.inlineCn ?? true,
      cnImportPath: options.cnImportPath ?? "@/lib/cn",
    };
  }

  /** 현재 UITree의 variant prop 옵션을 설정 */
  setVariantOptions(options: Map<string, string[]>): void {
    this.variantOptions = options;
  }

  /**
   * import 문 생성
   */
  getImports(): string[] {
    return ['import { cva } from "class-variance-authority";'];
  }

  /**
   * cn 함수 생성
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

    // dynamic에서 사용되는 CSS property 수집 (variant별 값 포함)
    // base와 동일한 값이 variant에 있으면 base에서 제거 (Tailwind class 충돌 방지)
    const dynamicCssValues = new Map<string, Set<string>>();
    if (style.dynamic) {
      for (const entry of style.dynamic) {
        for (const [key, val] of Object.entries(entry.style)) {
          if (!dynamicCssValues.has(key)) dynamicCssValues.set(key, new Set());
          dynamicCssValues.get(key)!.add(String(val));
        }
      }
    }

    const filteredBase: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(style.base)) {
      const dynValues = dynamicCssValues.get(key);
      if (dynValues && dynValues.has(String(value))) {
        // base 값이 variant 중 하나와 동일 → Tailwind에서 class 충돌하므로 base에서 제거
        continue;
      }
      filteredBase[key] = value;
    }
    const baseClasses = this.cssObjectToTailwind(filteredBase);
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
      // cva() 함수로 base + variants + compoundVariants 통합
      const variantsBlock = dynamicResult.code ? `  variants: {\n${dynamicResult.code}\n  },` : "";
      const compoundBlock = dynamicResult.compoundCode || "";
      const cvaBody = [variantsBlock, compoundBlock].filter(Boolean).join("\n");
      if (cvaBody) {
        code = `const ${variableName} = cva(${this.wrapClassString(baseStr)}, {\n${cvaBody}\n});`;
        this.cvaVariables.add(variableName);
      } else {
        code = `const ${variableName} = ${this.wrapClassString(baseStr)};`;
      }
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
      ":hover:not(:disabled)": "hover",
      ":active": "active",
      ":active:not(:disabled)": "active",
      ":focus": "focus",
      ":focus:not(:disabled)": "focus",
      ":disabled": "disabled",
      ":focus-visible": "focus-visible",
      ":checked": "checked",
      ":visited": "visited",
      "::placeholder": "placeholder",
    };

    // 각 variant prop → cva variants 블록 내부 코드
    const variantParts: string[] = [];
    const compoundEntries: string[] = [];
    const compoundProps = new Set<string>();
    const declaredVariants = new Set<string>();

    for (const [propName, valueMap] of variantGroups) {
      const entries: string[] = [];

      for (const [value, { style: dynStyle, pseudo }] of valueMap) {
        const classes = this.cssObjectToTailwind(dynStyle);

        // per-group pseudo → Tailwind variant prefix 적용 (base와 동일한 pseudo는 제거)
        if (pseudo) {
          const baseClassSet = new Set(classes);
          for (const [selector, pseudoStyle] of Object.entries(pseudo)) {
            const prefix = pseudoToTwPrefix[selector];
            if (!prefix) continue;
            const pseudoClasses = this.cssObjectToTailwind(pseudoStyle as Record<string, string | number>);
            for (const cls of pseudoClasses) {
              if (!baseClassSet.has(cls)) {
                classes.push(`${prefix}:${cls}`);
              }
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

      // compound prop → compoundVariants로 수집
      if (propName.includes("+")) {
        const propNames = propName.split("+");
        for (const p of propNames) compoundProps.add(p);
        for (const [value, { style: dynStyle, pseudo }] of valueMap) {
          const classes = this.cssObjectToTailwind(dynStyle);
          if (pseudo) {
            const baseClassSet = new Set(classes);
            for (const [selector, pseudoStyle] of Object.entries(pseudo)) {
              const prefix = pseudoToTwPrefix[selector];
              if (!prefix) continue;
              const pseudoClasses = this.cssObjectToTailwind(pseudoStyle as Record<string, string | number>);
              for (const cls of pseudoClasses) {
                if (!baseClassSet.has(cls)) {
                  classes.push(`${prefix}:${cls}`);
                }
              }
            }
          }
          if (classes.length === 0) continue;
          const values = value.split("+");
          if (values.length !== propNames.length) continue;
          const conditions = propNames.map((p, i) => {
            const key = this.needsQuoting(p) ? `"${p}"` : p;
            const val = values[i];
            if (val === "true" || val === "false") return `${key}: ${val}`;
            return `${key}: "${val}"`;
          });
          compoundEntries.push(`    { ${conditions.join(", ")}, className: ${this.wrapClassString(classes.join(" "))} },`);
        }
        continue;
      }

      // variantOptions에서 빠진 값을 빈 문자열로 채움 (cva 타입 완전성 보장)
      const allOptions = this.variantOptions.get(propName);
      if (allOptions) {
        const existingValues = new Set([...valueMap.keys()]);
        for (const opt of allOptions) {
          if (!existingValues.has(opt)) {
            const key = this.needsQuoting(opt) ? `"${opt}"` : opt;
            entries.push(`        ${key}: "",`);
          }
        }
      }

      // Figma prop 이름에서 제어 문자 제거 (backspace 등)
      const safePropName = propName.replace(/[\x00-\x1f\x7f]/g, "");
      const propKey = this.needsQuoting(safePropName) ? `"${safePropName}"` : safePropName;
      variantParts.push(`    ${propKey}: {\n${entries.join("\n")}\n    },`);
      declaredVariants.add(propName);
    }

    // compoundVariants에서 참조하지만 variants에 없는 prop → 빈 variant 추가
    for (const p of compoundProps) {
      if (declaredVariants.has(p)) continue;
      const allOptions = this.variantOptions.get(p);
      if (allOptions) {
        const emptyEntries = [...allOptions].map((opt) => {
          const key = this.needsQuoting(opt) ? `"${opt}"` : opt;
          return `        ${key}: "",`;
        });
        const propKey = this.needsQuoting(p) ? `"${p}"` : p;
        variantParts.push(`    ${propKey}: {\n${emptyEntries.join("\n")}\n    },`);
      }
    }

    // compoundVariants 코드
    let compoundCode = "";
    if (compoundEntries.length > 0) {
      compoundCode = `  compoundVariants: [\n${compoundEntries.join("\n")}\n  ],`;
    }

    return {
      code: variantParts.join("\n"),
      compoundCode,
      declaredVariants,
      hasContent: variantParts.length > 0 || compoundEntries.length > 0,
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

    // cva() 함수 변수는 호출이 필요
    if (this.cvaVariables.has(styleVariableName)) {
      return {
        attributeName: "className",
        valueCode: `{${styleVariableName}()}`,
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
      // __nested: 중첩 셀렉터 → arbitrary variant 클래스 변환
      if (key === "__nested" && typeof value === "object" && value !== null) {
        const nested = value as Record<string, Record<string, string | number>>;
        for (const [selector, nestedStyle] of Object.entries(nested)) {
          const variant = this.selectorToArbitraryVariant(selector);
          for (const [prop, val] of Object.entries(nestedStyle)) {
            const twClass = this.cssPropertyToTailwind(prop, String(val));
            if (twClass) {
              classes.push(`${variant}:${twClass}`);
            }
          }
        }
        continue;
      }

      const tailwindClass = this.cssPropertyToTailwind(key, String(value));
      if (tailwindClass) {
        classes.push(tailwindClass);
      }
    }

    return classes;
  }

  /**
   * CSS 셀렉터를 Tailwind arbitrary variant로 변환
   * e.g., "svg path" → "[&_svg_path]", "& > div svg path" → "[&>div_svg_path]"
   */
  private selectorToArbitraryVariant(selector: string): string {
    let s = selector.trim();
    // &로 시작하지 않으면 자손 셀렉터로 & 추가
    if (!s.startsWith("&")) {
      s = "& " + s;
    }
    // 공백 → _ (Tailwind arbitrary variant 문법)
    s = s.replace(/\s+/g, "_");
    return `[${s}]`;
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

    // backdrop-filter: blur(Npx) → backdrop-blur-[Npx]
    if (camelProperty === "backdropFilter") {
      const blurMatch = valueStr.match(/^blur\((.+)\)$/);
      if (blurMatch) return `backdrop-blur-[${this.escapeArbitraryValue(blurMatch[1])}]`;
      return `backdrop-blur-[${this.escapeArbitraryValue(valueStr)}]`;
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

    // 색상: arbitrary property 사용
    // bg-[var(...)]는 Tailwind가 background-image로 해석할 수 있으므로 [background-color:...] 사용
    if (camelProperty === "backgroundColor" || camelProperty === "background") {
      return `[background-color:${this.escapeArbitraryValue(valueStr)}]`;
    }
    if (camelProperty === "color") {
      return `text-[${this.escapeArbitraryValue(valueStr)}]`;
    }
    if (camelProperty === "fill") {
      return `fill-[${this.escapeArbitraryValue(valueStr)}]`;
    }

    // border: arbitrary property (shorthand는 border- prefix가 지원 안 함)
    if (camelProperty === "border") {
      return `[border:${this.escapeArbitraryValue(valueStr)}]`;
    }
    if (camelProperty === "borderColor") {
      return `border-[${this.escapeArbitraryValue(valueStr)}]`;
    }

    // font-family / font-weight: 같은 font- prefix 충돌 방지
    if (camelProperty === "fontFamily") {
      return `[font-family:${this.escapeArbitraryValue(valueStr)}]`;
    }
    if (camelProperty === "fontWeight") {
      return `[font-weight:${this.escapeArbitraryValue(valueStr)}]`;
    }

    // box-shadow → shadow-[...]
    if (camelProperty === "boxShadow") {
      return `shadow-[${this.escapeArbitraryValue(valueStr)}]`;
    }

    // 기타: arbitrary property fallback
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
  /**
   * 같은 className을 가진 compound 조건을 합침.
   * 공통 prop만 남기고, 차이 나는 prop은 제거.
   */
  private mergeCompoundConditions(conditions: CompoundCondition[]): CompoundCondition[] {
    // className → 조건 그룹
    const groups = new Map<string, CompoundCondition[]>();
    for (const c of conditions) {
      if (!groups.has(c.className)) groups.set(c.className, []);
      groups.get(c.className)!.push(c);
    }

    // 1단계: 같은 className끼리 공통 prop으로 합침
    const merged: CompoundCondition[] = [];
    for (const [className, group] of groups) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }
      const commonProps: Record<string, string> = { ...group[0].props };
      for (let i = 1; i < group.length; i++) {
        for (const key of Object.keys(commonProps)) {
          if (group[i].props[key] !== commonProps[key]) {
            delete commonProps[key];
          }
        }
      }
      if (Object.keys(commonProps).length > 0) {
        merged.push({ props: commonProps, className });
      } else {
        merged.push(...group);
      }
    }

    // 2단계: 합친 조건이 다른 조건의 부분집합이면 충돌 → 합침 취소
    // A의 props가 B의 props의 부분집합이면, A와 B가 동시에 매칭되어 className 충돌
    const result: CompoundCondition[] = [];
    for (const cond of merged) {
      const hasConflict = merged.some((other) => {
        if (other === cond) return false;
        if (other.className === cond.className) return false;
        // cond의 props가 other의 props의 부분집합인지 확인
        return Object.entries(cond.props).every(
          ([k, v]) => other.props[k] === v
        );
      });
      if (hasConflict) {
        // 충돌 → 원본 조건으로 복원
        const original = groups.get(cond.className);
        if (original && original.length > 1) {
          result.push(...original);
        } else {
          result.push(cond);
        }
      } else {
        result.push(cond);
      }
    }
    return result;
  }

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
