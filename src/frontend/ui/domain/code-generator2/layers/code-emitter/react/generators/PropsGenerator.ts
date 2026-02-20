/**
 * PropsGenerator
 *
 * UITree.props에서 TypeScript Props 인터페이스 생성
 */

import type { UITree, PropDefinition } from "../../../../types/types";

export class PropsGenerator {
  /**
   * Props 인터페이스 생성
   */
  static generate(uiTree: UITree, componentName: string): string {
    const props = uiTree.props;

    if (props.length === 0) {
      return `interface ${componentName}Props {}`;
    }

    const propLines = props.map((prop) => this.generatePropLine(prop));

    return `interface ${componentName}Props {
${propLines.join("\n")}
}`;
  }

  /**
   * 개별 prop 라인 생성
   */
  private static generatePropLine(prop: PropDefinition): string {
    const optional = prop.required ? "" : "?";
    const type = this.getTypeString(prop);
    const comment = this.getDefaultValueComment(prop);

    return `  ${prop.name}${optional}: ${type};${comment}`;
  }

  /**
   * TypeScript 타입 문자열 생성
   */
  private static getTypeString(prop: PropDefinition): string {
    switch (prop.type) {
      case "variant":
        // union type 생성
        const options = prop.options.map((opt) => `"${opt}"`).join(" | ");
        return options || "string";

      case "boolean":
        return "boolean";

      case "string":
        return "string";

      case "slot":
        return "React.ReactNode";

      default:
        return "unknown";
    }
  }

  /**
   * 기본값 주석 생성
   */
  private static getDefaultValueComment(prop: PropDefinition): string {
    if (prop.defaultValue === undefined) return "";

    const value =
      typeof prop.defaultValue === "string"
        ? `"${prop.defaultValue}"`
        : prop.defaultValue;

    return ` // default: ${value}`;
  }
}
