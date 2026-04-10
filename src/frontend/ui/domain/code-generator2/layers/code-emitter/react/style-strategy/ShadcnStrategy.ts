/**
 * ShadcnStrategy
 *
 * shadcn/ui 스타일 전략
 * cva (class-variance-authority) + cn 패턴으로 코드 생성
 */

import type { StyleObject, PseudoClass } from "../../../../types/types";
import type { IStyleStrategy, StyleResult, JsxStyleAttribute } from "./IStyleStrategy";
import { groupDynamicByProp } from "./groupDynamicByProp";
import {
  PSEUDO_TO_PREFIX,
  cssObjectToTailwind,
  wrapClassString,
  needsQuoting,
  getDiffStyles,
} from "./tailwindUtils";

export interface ShadcnStrategyOptions {
  /** cn import 경로 (기본: "@/lib/utils") */
  cnImportPath?: string;
}

export class ShadcnStrategy implements IStyleStrategy {
  readonly name = "shadcn";
  private readonly cnImportPath: string;

  /** cva() 함수로 생성된 변수 이름 추적 */
  readonly cvaVariables = new Set<string>();
  /** variant prop별 전체 옵션 목록 (cva variants 완전성 보장) */
  private variantOptions = new Map<string, string[]>();
  /** default variant 값 (defaultVariants 블록 생성용) */
  private defaultVariantValues = new Map<string, string>();
  /** compound 조건부 클래스 (TailwindStrategy 호환) */
  readonly compoundConditions = new Map<string, Array<{ props: Record<string, string>; className: string }>>();
  /** 각 cva 변수에 선언된 variant prop 이름 */
  readonly declaredVariantProps = new Map<string, Set<string>>();

  constructor(options: ShadcnStrategyOptions = {}) {
    this.cnImportPath = options.cnImportPath ?? "@/lib/utils";
  }

  /** 현재 UITree의 variant prop 옵션을 설정 */
  setVariantOptions(options: Map<string, string[]>): void {
    this.variantOptions = options;
  }

  /** defaultVariants 설정 */
  setDefaultVariants(defaults: Map<string, string>): void {
    this.defaultVariantValues = defaults;
  }

  /**
   * import 문 생성
   */
  getImports(): string[] {
    return [
      'import { cva, type VariantProps } from "class-variance-authority";',
      `import { cn } from "${this.cnImportPath}";`,
    ];
  }

  /**
   * StyleObject를 shadcn/ui 스타일 cva 코드로 변환
   */
  generateStyle(
    nodeId: string,
    nodeName: string,
    style: StyleObject,
    parentPath?: string[]
  ): StyleResult {
    const variableName = this.createVariableName(nodeId, nodeName, parentPath);

    // dynamic에서 사용되는 CSS property 수집 → base 충돌 제거
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
      if (dynValues && dynValues.has(String(value))) continue;
      filteredBase[key] = value;
    }
    const baseClasses = cssObjectToTailwind(filteredBase);
    const hasBaseStyles = baseClasses.length > 0;

    // pseudo → Tailwind prefix 클래스
    const pseudoClassesList: string[] = [];
    if (style.pseudo) {
      for (const [pseudo, styles] of Object.entries(style.pseudo)) {
        const prefix = PSEUDO_TO_PREFIX[pseudo as PseudoClass];
        if (!prefix) continue;
        const diffStyles = getDiffStyles(style.base, styles);
        if (Object.keys(diffStyles).length === 0) continue;
        const classes = cssObjectToTailwind(diffStyles);
        for (const cls of classes) {
          pseudoClassesList.push(`${prefix}${cls}`);
        }
      }
    }
    const hasPseudoStyles = pseudoClassesList.length > 0;

    // dynamic → cva variants
    const dynamicResult = this.generateDynamicStyleCode(variableName, style);
    const hasDynamicStyles = dynamicResult.hasContent;

    if (!hasBaseStyles && !hasPseudoStyles && !hasDynamicStyles) {
      return { variableName, code: "", isEmpty: true };
    }

    const allClasses = [...baseClasses, ...pseudoClassesList];
    const baseStr = allClasses.join(" ");

    // shadcn 패턴: 항상 cva() 사용
    const cvaBlocks: string[] = [];
    if (dynamicResult.code) {
      cvaBlocks.push(`  variants: {\n${dynamicResult.code}\n  },`);
    }
    if (dynamicResult.compoundCode) {
      cvaBlocks.push(dynamicResult.compoundCode);
    }

    // defaultVariants 블록 생성
    const defaultVariantsBlock = this.buildDefaultVariantsBlock(dynamicResult.declaredVariants);
    if (defaultVariantsBlock) {
      cvaBlocks.push(defaultVariantsBlock);
    }

    let code: string;
    if (cvaBlocks.length > 0) {
      code = `const ${variableName} = cva(\n  ${wrapClassString(baseStr)},\n  {\n${cvaBlocks.join("\n")}\n  }\n);`;
    } else {
      code = `const ${variableName} = cva(${wrapClassString(baseStr)});`;
    }
    this.cvaVariables.add(variableName);

    return { variableName, code, isEmpty: false };
  }

  /**
   * JSX 스타일 속성 생성
   * shadcn 패턴: cn(xxxVariants({ ...props }), className)
   */
  getJsxStyleAttribute(
    styleVariableName: string,
    hasConditionalStyles: boolean
  ): JsxStyleAttribute {
    if (hasConditionalStyles) {
      return {
        attributeName: "className",
        valueCode: `{cn(${styleVariableName}(), conditionalClasses, className)}`,
      };
    }

    if (this.cvaVariables.has(styleVariableName)) {
      return {
        attributeName: "className",
        valueCode: `{cn(${styleVariableName}(), className)}`,
      };
    }

    return {
      attributeName: "className",
      valueCode: `{cn(${styleVariableName}, className)}`,
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
    const classes = cssObjectToTailwind(style);
    return classes.map((cls) => `${prefix}${cls}`).join(" ");
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * dynamic 스타일 → cva variants 블록
   */
  private generateDynamicStyleCode(
    _baseVarName: string,
    style: StyleObject
  ): { code: string; hasContent: boolean; compoundCode?: string; declaredVariants?: Set<string> } {
    if (!style.dynamic || style.dynamic.length === 0) {
      return { code: "", hasContent: false };
    }

    const variantGroups = groupDynamicByProp(style.dynamic);
    if (variantGroups.size === 0) {
      return { code: "", hasContent: false };
    }

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

    const variantParts: string[] = [];
    const compoundEntries: string[] = [];
    const compoundProps = new Set<string>();
    const declaredVariants = new Set<string>();

    for (const [propName, valueMap] of variantGroups) {
      const entries: string[] = [];

      for (const [value, { style: dynStyle, pseudo }] of valueMap) {
        const classes = cssObjectToTailwind(dynStyle);

        if (pseudo) {
          const baseClassSet = new Set(classes);
          for (const [selector, pseudoStyle] of Object.entries(pseudo)) {
            const prefix = pseudoToTwPrefix[selector];
            if (!prefix) continue;
            const pseudoClasses = cssObjectToTailwind(pseudoStyle as Record<string, string | number>);
            for (const cls of pseudoClasses) {
              if (!baseClassSet.has(cls)) {
                classes.push(`${prefix}:${cls}`);
              }
            }
          }
        }

        if (classes.length > 0) {
          const key = needsQuoting(value) ? `"${value}"` : value;
          const classStr = classes.join(" ");
          entries.push(`        ${key}: ${wrapClassString(classStr)},`);
        }
      }

      if (entries.length === 0) continue;

      // compound prop → compoundVariants
      if (propName.includes("+")) {
        const propNames = propName.split("+");
        for (const p of propNames) compoundProps.add(p);
        for (const [value, { style: dynStyle, pseudo }] of valueMap) {
          const classes = cssObjectToTailwind(dynStyle);
          if (pseudo) {
            const baseClassSet = new Set(classes);
            for (const [selector, pseudoStyle] of Object.entries(pseudo)) {
              const prefix = pseudoToTwPrefix[selector];
              if (!prefix) continue;
              const pseudoClasses = cssObjectToTailwind(pseudoStyle as Record<string, string | number>);
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
            const key = needsQuoting(p) ? `"${p}"` : p;
            const val = values[i];
            if (val === "true" || val === "false") return `${key}: ${val}`;
            return `${key}: "${val}"`;
          });
          compoundEntries.push(`    { ${conditions.join(", ")}, className: ${wrapClassString(classes.join(" "))} },`);
        }
        continue;
      }

      // variantOptions에서 빠진 값 → 빈 문자열로 채움
      const allOptions = this.variantOptions.get(propName);
      if (allOptions) {
        const existingValues = new Set([...valueMap.keys()]);
        for (const opt of allOptions) {
          if (!existingValues.has(opt)) {
            const key = needsQuoting(opt) ? `"${opt}"` : opt;
            entries.push(`        ${key}: "",`);
          }
        }
      }

      const safePropName = propName.replace(/[\x00-\x1f\x7f]/g, "");
      const propKey = needsQuoting(safePropName) ? `"${safePropName}"` : safePropName;
      variantParts.push(`    ${propKey}: {\n${entries.join("\n")}\n    },`);
      declaredVariants.add(propName);
    }

    // compoundVariants에서 참조하지만 variants에 없는 prop → 빈 variant 추가
    for (const p of compoundProps) {
      if (declaredVariants.has(p)) continue;
      const allOptions = this.variantOptions.get(p);
      if (allOptions) {
        const emptyEntries = [...allOptions].map((opt) => {
          const key = needsQuoting(opt) ? `"${opt}"` : opt;
          return `        ${key}: "",`;
        });
        const propKey = needsQuoting(p) ? `"${p}"` : p;
        variantParts.push(`    ${propKey}: {\n${emptyEntries.join("\n")}\n    },`);
      }
    }

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
   * defaultVariants 블록 생성
   * declaredVariants에 포함된 prop만 defaultVariants에 포함
   */
  private buildDefaultVariantsBlock(declaredVariants?: Set<string>): string | null {
    if (this.defaultVariantValues.size === 0) return null;

    const entries: string[] = [];
    for (const [prop, value] of this.defaultVariantValues) {
      // 선언된 variant에 포함된 prop만
      if (declaredVariants && !declaredVariants.has(prop)) continue;
      const propKey = needsQuoting(prop) ? `"${prop}"` : prop;
      entries.push(`    ${propKey}: "${value}",`);
    }

    if (entries.length === 0) return null;
    return `  defaultVariants: {\n${entries.join("\n")}\n  },`;
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
   * 변수명 생성 (Variants 접미사)
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
   * 경로 기반 변수명 (마지막 경로 노드 + Variants)
   * 예: ["Root", "Button"] → "buttonVariants"
   */
  private createPathBasedName(parentPath: string[]): string {
    const lastNode = parentPath[parentPath.length - 1];
    const name = this.toCamelCase(lastNode);
    if (!name) return "unnamedVariants";
    const safeName = /^[0-9]/.test(name) ? `_${name}` : name;
    return `${safeName}Variants`;
  }

  /**
   * 이름 기반 변수명 (Fallback)
   */
  private createIdBasedName(_nodeId: string, nodeName: string): string {
    const safeName = this.toCamelCase(nodeName) || "unnamed";
    return /^[0-9]/.test(safeName) ? `_${safeName}Variants` : `${safeName}Variants`;
  }
}
