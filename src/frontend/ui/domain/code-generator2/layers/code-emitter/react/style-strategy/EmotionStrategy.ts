/**
 * EmotionStrategy
 *
 * Emotion CSS-in-JS 스타일 전략
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    generateStyle Pipeline                       │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │   StyleObject { base, pseudo, dynamic }                         │
 * │        │                                                        │
 * │        ├─► generateBaseCode()     → css`display: flex; ...`     │
 * │        │                                                        │
 * │        ├─► generatePseudoCode()   → &:hover { ... }             │
 * │        │                                                        │
 * │        └─► generateDynamicCode()  → sizeStyles = { L: css`...` }│
 * │                                                                 │
 * │        │                                                        │
 * │        ▼                                                        │
 * │   StyleResult { variableName, code }                            │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { StyleObject, PseudoClass, ConditionNode } from "../../../../types/types";
import type { IStyleStrategy, StyleResult, JsxStyleAttribute } from "./IStyleStrategy";

export class EmotionStrategy implements IStyleStrategy {
  readonly name = "emotion";

  /**
   * import 문 생성
   */
  getImports(): string[] {
    return ['import { css } from "@emotion/react";'];
  }

  /**
   * StyleObject → Emotion css 코드
   */
  generateStyle(
    nodeId: string,
    nodeName: string,
    style: StyleObject,
    parentPath?: string[]
  ): StyleResult {
    const variableName = this.createVariableName(nodeId, nodeName, parentPath);

    // Step 1: base 스타일 생성
    const baseCode = this.generateBaseCode(variableName, style.base);

    // Step 2: pseudo 스타일 생성 (:hover, :active 등)
    const pseudoCode = this.generatePseudoCode(style.base, style.pseudo);

    // Step 3: dynamic 스타일 생성 (variant별 조건부 스타일)
    const dynamicCode = this.generateDynamicCode(variableName, style.dynamic);

    // Step 4: 결과 조합
    return this.combineResults(variableName, baseCode, pseudoCode, dynamicCode);
  }

  private generateBaseCode(
    variableName: string,
    base: Record<string, string | number>
  ): { code: string; hasContent: boolean } {
    const styleStr = this.objectToStyleString(base);
    return {
      code: styleStr,
      hasContent: Object.keys(base).length > 0,
    };
  }

  private generatePseudoCode(
    base: Record<string, string | number>,
    pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>
  ): { code: string; hasContent: boolean } {
    if (!pseudo) return { code: "", hasContent: false };

    const parts: string[] = [];

    for (const [selector, styles] of Object.entries(pseudo)) {
      const diffStyles = this.getDiffStyles(base, styles);
      if (Object.keys(diffStyles).length === 0) continue;

      const styleStr = this.objectToStyleString(diffStyles);
      parts.push(`  &${selector} {\n${this.indent(styleStr, 4)}\n  }`);
    }

    return {
      code: parts.join("\n\n"),
      hasContent: parts.length > 0,
    };
  }

  private generateDynamicCode(
    baseVarName: string,
    dynamic?: Array<{ condition: ConditionNode; style: Record<string, string | number> }>
  ): { code: string; hasContent: boolean } {
    if (!dynamic || dynamic.length === 0) {
      return { code: "", hasContent: false };
    }

    // variant prop별로 그룹화
    const groups = this.groupByVariantProp(dynamic);
    if (groups.size === 0) return { code: "", hasContent: false };

    // 각 그룹을 코드로 변환
    const codeParts: string[] = [];

    for (const [propName, valueMap] of groups) {
      const entries = this.buildVariantEntries(valueMap);
      if (entries.length > 0) {
        const varName = `${baseVarName}_${propName}Styles`;
        codeParts.push(`const ${varName} = {\n${entries.join("\n")}\n};`);
      }
    }

    return {
      code: codeParts.join("\n\n"),
      hasContent: codeParts.length > 0,
    };
  }

  private combineResults(
    variableName: string,
    baseResult: { code: string; hasContent: boolean },
    pseudoResult: { code: string; hasContent: boolean },
    dynamicResult: { code: string; hasContent: boolean }
  ): StyleResult {
    // 빈 스타일 체크
    if (!baseResult.hasContent && !pseudoResult.hasContent && !dynamicResult.hasContent) {
      return { variableName, code: "", isEmpty: true };
    }

    const codeParts: string[] = [];

    // base + pseudo → css``
    if (baseResult.hasContent || pseudoResult.hasContent) {
      codeParts.push(`const ${variableName} = css\`
${this.indent(baseResult.code, 2)}
${pseudoResult.code ? "\n" + pseudoResult.code : ""}
\`;`);
    }

    // dynamic → { variant: css`` }
    if (dynamicResult.hasContent) {
      codeParts.push(dynamicResult.code);
    }

    return { variableName, code: codeParts.join("\n\n"), isEmpty: false };
  }

  private groupByVariantProp(
    dynamic: Array<{ condition: ConditionNode; style: Record<string, string | number> }>
  ): Map<string, Map<string, Record<string, string | number>>> {
    const groups = new Map<string, Map<string, Record<string, string | number>>>();

    for (const { condition, style } of dynamic) {
      const propInfos = this.extractAllVariantProps(condition);

      for (const { propName, propValue } of propInfos) {
        if (!groups.has(propName)) {
          groups.set(propName, new Map());
        }

        if (!groups.get(propName)!.has(propValue)) {
          groups.get(propName)!.set(propValue, style);
        }
      }
    }

    return groups;
  }

  private buildVariantEntries(
    valueMap: Map<string, Record<string, string | number>>
  ): string[] {
    const entries: string[] = [];

    for (const [value, style] of valueMap) {
      const styleStr = this.objectToStyleString(style);
      if (styleStr) {
        const keyStr = this.needsQuoting(value) ? `"${value}"` : value;
        entries.push(`  ${keyStr}: css\`\n${this.indent(styleStr, 4)}\n  \`,`);
      }
    }

    return entries;
  }

  private needsQuoting(key: string): boolean {
    return /[^a-zA-Z0-9_$]/.test(key) || /^\d/.test(key);
  }

  private extractAllVariantProps(
    condition: ConditionNode
  ): Array<{ propName: string; propValue: string }> {
    if (condition.type === "eq" && typeof condition.value === "string") {
      return [{ propName: condition.prop, propValue: condition.value }];
    }

    if (condition.type === "and") {
      const results: Array<{ propName: string; propValue: string }> = [];
      for (const cond of condition.conditions) {
        if (cond.type === "eq" && typeof cond.value === "string") {
          results.push({ propName: cond.prop, propValue: cond.value });
        }
      }
      return results;
    }

    return [];
  }

  private extractVariantProp(
    condition: ConditionNode
  ): { propName: string; propValue: string } | null {
    const results = this.extractAllVariantProps(condition);
    return results.length > 0 ? results[0] : null;
  }

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

  getJsxStyleAttribute(
    styleVariableName: string,
    hasConditionalStyles: boolean
  ): JsxStyleAttribute {
    return {
      attributeName: "css",
      valueCode: hasConditionalStyles
        ? `{[${styleVariableName}, conditionalStyles]}`
        : `{${styleVariableName}}`,
    };
  }

  generateConditionalStyle(
    baseStyle: string,
    conditions: Array<{ condition: string; style: string }>
  ): string {
    const conditionStrs = conditions
      .map(({ condition, style }) => `  ${condition} && css\`${style}\`,`)
      .join("\n");

    return `const conditionalStyles = [\n${conditionStrs}\n].filter(Boolean);`;
  }

  generatePseudoStyle(
    pseudoClass: PseudoClass,
    style: Record<string, string | number>
  ): string {
    const styleStr = this.objectToStyleString(style);
    return `"&${pseudoClass}": {\n${this.indent(styleStr, 2)}\n}`;
  }

  /**
   * CSS 변수명 생성 (기본 이름만 생성, 고유성은 StylesGenerator가 보장)
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
   * 예: ["SelectButton", "Label"] → "selectButtonLabelCss"
   */
  private createPathBasedName(parentPath: string[]): string {
    const pathNames = parentPath.map((name) => this.toSafeVariableName(name));
    let combinedName = this.combinePathToCamelCase(pathNames);

    // 숫자로 시작하면 앞에 _ 추가
    if (/^[0-9]/.test(combinedName)) {
      combinedName = "_" + combinedName;
    }

    return `${combinedName}Css`;
  }

  /**
   * ID 기반 변수명 생성 (Fallback, 안전성 우선)
   * 예: nodeId="133:603", nodeName="Label" → "label_133_603"
   */
  private createIdBasedName(nodeId: string, nodeName: string): string {
    const safeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
    let nameBase = this.toSafeVariableName(nodeName);

    if (/^[0-9]/.test(nameBase)) {
      nameBase = "_" + nameBase;
    }

    return `${nameBase}_${safeId}`;
  }

  /**
   * 노드 이름을 안전한 변수명으로 변환 (camelCase, 특수문자 제거)
   */
  private toSafeVariableName(str: string): string {
    // 영문/숫자만 추출하여 camelCase 변환
    const words = str
      .replace(/[^a-zA-Z0-9\s]/g, " ") // 특수문자를 공백으로
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return "unnamed";
    }

    return words
      .map((word, i) =>
        i === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");
  }

  /**
   * 경로 배열을 camelCase로 결합
   * ["SelectButton", "Container", "Label"] → "selectButtonContainerLabel"
   */
  private combinePathToCamelCase(pathNames: string[]): string {
    if (pathNames.length === 0) return "unnamed";

    return pathNames
      .map((name, i) =>
        i === 0
          ? name.charAt(0).toLowerCase() + name.slice(1)
          : name.charAt(0).toUpperCase() + name.slice(1)
      )
      .join("");
  }

  private objectToStyleString(obj: Record<string, string | number>): string {
    return Object.entries(obj)
      .map(([key, value]) => {
        const cssKey = this.camelToKebab(key);
        const cssValue = typeof value === "number" ? `${value}px` : value;
        return `${cssKey}: ${cssValue};`;
      })
      .join("\n");
  }

  private camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  private indent(str: string, spaces: number): string {
    const pad = " ".repeat(spaces);
    return str
      .split("\n")
      .map((line) => (line.trim() ? pad + line : line))
      .join("\n");
  }
}
