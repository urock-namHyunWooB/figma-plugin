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
      return `export interface ${componentName}Props {}`;
    }

    // Array Slot 이름 집합 생성 (빠른 조회용)
    const arraySlotNames = new Set((uiTree.arraySlots || []).map((slot) => slot.slotName));

    const propLines = props.map((prop) => this.generatePropLine(prop, arraySlotNames, uiTree));

    return `export interface ${componentName}Props {
${propLines.join("\n")}
}`;
  }

  /**
   * 개별 prop 라인 생성
   */
  private static generatePropLine(
    prop: PropDefinition,
    arraySlotNames: Set<string>,
    uiTree: UITree
  ): string {
    const optional = prop.required ? "" : "?";
    const type = this.getTypeString(prop, arraySlotNames, uiTree);
    const comment = this.getDefaultValueComment(prop);

    return `  ${prop.name}${optional}: ${type};${comment}`;
  }

  /**
   * TypeScript 타입 문자열 생성
   */
  private static getTypeString(
    prop: PropDefinition,
    arraySlotNames: Set<string>,
    uiTree: UITree
  ): string {
    // Array Slot인 경우 Array 타입 생성
    if (prop.type === "slot" && arraySlotNames.has(prop.name)) {
      const arraySlot = uiTree.arraySlots.find((slot) => slot.slotName === prop.name);
      if (arraySlot && arraySlot.itemProps && arraySlot.itemProps.length > 0) {
        // itemProps가 있으면 구체적인 타입 생성
        const itemPropsStr = arraySlot.itemProps
          .map((p) => `${p.name}: ${p.type === "string" ? "string" : "any"}`)
          .join("; ");
        return `Array<{ ${itemPropsStr} }>`;
      } else {
        // itemProps가 없으면 React.ReactNode 배열
        return "Array<React.ReactNode>";
      }
    }

    switch (prop.type) {
      case "variant": {
        // union type 생성
        const options = prop.options.map((opt) => `"${opt}"`).join(" | ");
        return options || "string";
      }

      case "boolean":
        return "boolean";

      case "string":
        return "string";

      case "slot":
        return "React.ReactNode";

      case "function": {
        // 함수 타입 - functionSignature가 있으면 사용, 없으면 기본 함수 타입
        return prop.functionSignature || "(...args: any[]) => void";
      }

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
