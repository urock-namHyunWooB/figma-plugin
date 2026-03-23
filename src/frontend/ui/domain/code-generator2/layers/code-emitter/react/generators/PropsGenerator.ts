/**
 * PropsGenerator
 *
 * UITree.props에서 TypeScript Props 인터페이스 생성
 */

import type { UITree, PropDefinition } from "../../../../types/types";

/**
 * 컴포넌트 타입 → 네이티브 HTML 속성 타입 매핑
 *
 * 루트 요소가 해당 HTML 태그로 직접 렌더링되는 경우만 포함.
 * input은 루트가 <div>(wrapper)이고 내부에 <input>이 있으므로 제외 —
 * restProps가 <div>에 spread되어 네이티브 input 속성이 무효화됨.
 */
const NATIVE_ATTRS_TYPE: Record<string, string> = {
  button: "React.ButtonHTMLAttributes<HTMLButtonElement>",
  link: "React.AnchorHTMLAttributes<HTMLAnchorElement>",
};

export class PropsGenerator {
  /**
   * Props 인터페이스 생성
   *
   * 네이티브 HTML 요소를 감싸는 컴포넌트는 OwnProps + extends 패턴:
   *   interface OwnProps { ... }
   *   interface ComponentProps extends Omit<NativeAttrs, keyof OwnProps>, OwnProps {}
   */
  static generate(uiTree: UITree, componentName: string): string {
    const props = uiTree.props;
    const rootType = (uiTree.root as any).type as string;
    const nativeAttrsType = NATIVE_ATTRS_TYPE[rootType];

    if (props.length === 0) {
      if (nativeAttrsType) {
        return `export interface ${componentName}Props extends ${nativeAttrsType} {}`;
      }
      return `export interface ${componentName}Props {}`;
    }

    // Array Slot 이름 집합 생성 (빠른 조회용)
    const arraySlotNames = new Set((uiTree.arraySlots || []).map((slot) => slot.slotName));

    const propLines = props.map((prop) => this.generatePropLine(prop, arraySlotNames, uiTree));

    if (nativeAttrsType) {
      const ownName = `${componentName}OwnProps`;
      return `interface ${ownName} {
${propLines.join("\n")}
}

export interface ${componentName}Props extends Omit<${nativeAttrsType}, keyof ${ownName}>, ${ownName} {}`;
    }

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

      case "boolean": {
        if (prop.extraValues && prop.extraValues.length > 0) {
          const extras = prop.extraValues.map((v) => `"${v}"`).join(" | ");
          return `boolean | ${extras}`;
        }
        return "boolean";
      }

      case "string":
        return "string";

      case "slot":
        return "React.ReactNode";

      case "function": {
        // 함수 타입 - functionSignature가 있으면 사용, 없으면 기본 함수 타입
        return prop.functionSignature || "(...args: any[]) => void";
      }

      case "array": {
        return prop.itemType || "any[]";
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

    let value;
    if (typeof prop.defaultValue === "string") {
      value = `"${prop.defaultValue}"`;
    } else if (Array.isArray(prop.defaultValue) || typeof prop.defaultValue === "object") {
      value = JSON.stringify(prop.defaultValue);
    } else {
      value = prop.defaultValue;
    }

    return ` // default: ${value}`;
  }
}
