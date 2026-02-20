/**
 * EmotionStrategy
 *
 * Emotion CSS-in-JS 스타일 전략
 */

import type { StyleObject, PseudoClass } from "../../../types/types";
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
   * StyleObject를 Emotion css 코드로 변환
   */
  generateStyle(nodeId: string, nodeName: string, style: StyleObject): StyleResult {
    const variableName = this.toStyleVariableName(nodeName);

    // base 스타일
    const baseStyles = this.objectToStyleString(style.base);

    // pseudo 스타일
    const pseudoStyles = style.pseudo
      ? Object.entries(style.pseudo)
          .map(([pseudo, styles]) => {
            const pseudoStyleStr = this.objectToStyleString(styles);
            return `  "&${pseudo}": {\n${this.indent(pseudoStyleStr, 4)}\n  },`;
          })
          .join("\n")
      : "";

    // dynamic 스타일은 별도 처리 (조건부 렌더링)
    const code = `const ${variableName} = css\`
${this.indent(baseStyles, 2)}
${pseudoStyles ? "\n" + pseudoStyles : ""}
\`;`;

    return { variableName, code };
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
        attributeName: "css",
        valueCode: `{[${styleVariableName}, conditionalStyles]}`,
      };
    }

    return {
      attributeName: "css",
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
      .map(({ condition, style }) => `  ${condition} && css\`${style}\`,`)
      .join("\n");

    return `const conditionalStyles = [\n${conditionStrs}\n].filter(Boolean);`;
  }

  /**
   * pseudo-class 스타일 코드 생성
   */
  generatePseudoStyle(
    pseudoClass: PseudoClass,
    style: Record<string, string | number>
  ): string {
    const styleStr = this.objectToStyleString(style);
    return `"&${pseudoClass}": {\n${this.indent(styleStr, 2)}\n}`;
  }

  /**
   * 스타일 객체를 문자열로 변환
   */
  private objectToStyleString(obj: Record<string, string | number>): string {
    return Object.entries(obj)
      .map(([key, value]) => {
        const cssKey = this.camelToKebab(key);
        const cssValue = typeof value === "number" ? `${value}px` : value;
        return `${cssKey}: ${cssValue};`;
      })
      .join("\n");
  }

  /**
   * camelCase를 kebab-case로 변환
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * 스타일 변수명 생성
   */
  private toStyleVariableName(nodeName: string): string {
    const base = nodeName
      .split(/[\s_-]+/)
      .map((word, i) =>
        i === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");

    return `${base}Styles`;
  }

  /**
   * 들여쓰기
   */
  private indent(str: string, spaces: number): string {
    const indent = " ".repeat(spaces);
    return str
      .split("\n")
      .map((line) => (line.trim() ? indent + line : line))
      .join("\n");
  }
}
