/**
 * PropsGenerator
 *
 * SemanticComponent.props에서 TypeScript Props 인터페이스 생성
 */

import type { PropDefinition } from "../../../../types/types";
import type { SemanticComponent } from "../../SemanticIR";

/**
 * 컴포넌트 타입 → 네이티브 HTML 속성 타입 매핑
 *
 * restProps가 해당 네이티브 요소로 전달되는 컴포넌트만 포함.
 * - button/link: 루트가 네이티브 태그 → restProps 직접 전달
 * - input: 루트는 <div> wrapper이지만 restProps는 내부 <input>에 전달
 */
const NATIVE_ATTRS_TYPE: Record<string, string> = {
  button: "React.ButtonHTMLAttributes<HTMLButtonElement>",
  input: "React.InputHTMLAttributes<HTMLInputElement>",
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
  static generate(ir: SemanticComponent, componentName: string, strategyName?: string): string {
    const props = ir.props;
    const rootKind = ir.structure.kind;
    const nativeAttrsType = NATIVE_ATTRS_TYPE[rootKind];
    const isShadcn = strategyName === "shadcn";

    // shadcn: VariantProps 타입 생성
    const variantsVarName = isShadcn
      ? `${componentName.charAt(0).toLowerCase() + componentName.slice(1)}Variants`
      : "";
    const variantPropsExtend = isShadcn
      ? `VariantProps<typeof ${variantsVarName}>`
      : "";

    // shadcn: className prop 추가
    const extraPropLines: string[] = [];
    if (isShadcn) {
      const hasClassName = props.some((p) => p.name === "className");
      if (!hasClassName) {
        extraPropLines.push("  className?: string;");
      }
    }

    // Array Slot 이름 집합 생성 (빠른 조회용)
    const arraySlotNames = new Set((ir.arraySlots || []).map((slot) => slot.slotName));
    const propLines = props.map((prop) => this.generatePropLine(prop, arraySlotNames, ir));
    const allPropLines = [...propLines, ...extraPropLines];

    if (allPropLines.length === 0 && !isShadcn) {
      if (nativeAttrsType) {
        return `export interface ${componentName}Props extends ${nativeAttrsType} {}`;
      }
      return `export interface ${componentName}Props {}`;
    }

    if (allPropLines.length === 0 && isShadcn) {
      if (nativeAttrsType) {
        // shadcn + native: extend both VariantProps and NativeAttrs
        return `export interface ${componentName}Props extends ${nativeAttrsType}, ${variantPropsExtend} {
  className?: string;
}`;
      }
      return `export interface ${componentName}Props extends ${variantPropsExtend} {
  className?: string;
}`;
    }

    if (nativeAttrsType) {
      const ownName = `${componentName}OwnProps`;
      const extendsClause = isShadcn
        ? ` extends ${variantPropsExtend}`
        : "";
      return `interface ${ownName}${extendsClause} {
${allPropLines.join("\n")}
}

export interface ${componentName}Props extends Omit<${nativeAttrsType}, keyof ${ownName}>, ${ownName} {}`;
    }

    if (isShadcn) {
      return `export interface ${componentName}Props extends ${variantPropsExtend} {
${allPropLines.join("\n")}
}`;
    }

    return `export interface ${componentName}Props {
${allPropLines.join("\n")}
}`;
  }

  /**
   * 개별 prop 라인 생성
   */
  private static generatePropLine(
    prop: PropDefinition,
    arraySlotNames: Set<string>,
    ir: SemanticComponent
  ): string {
    const optional = prop.required ? "" : "?";
    const type = this.getTypeString(prop, arraySlotNames, ir);
    const comment = this.getDefaultValueComment(prop);

    return `  ${prop.name}${optional}: ${type};${comment}`;
  }

  /**
   * TypeScript 타입 문자열 생성
   */
  private static getTypeString(
    prop: PropDefinition,
    arraySlotNames: Set<string>,
    ir: SemanticComponent
  ): string {
    // Array Slot인 경우 Array 타입 생성
    if (prop.type === "slot" && arraySlotNames.has(prop.name)) {
      const arraySlot = (ir.arraySlots ?? []).find((slot) => slot.slotName === prop.name);
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
