import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { PropIR, PropType } from "../../types/props";

/**
 * Prop 이름 정규화 (camelCase로 변환)
 *
 * "Size" -> "size"
 * "left Icon" -> "leftIcon"
 * "left-Icon" -> "leftIcon" (하이픈도 처리)
 * "iconLeft#2074:0" -> "iconLeft" (# 이후 제거)
 */
export function normalizePropName(name: string): string {
  // #, @ 같은 특수 문자 이후 부분 제거
  const specialCharMatch = name.match(/[#@]/);
  let cleanedName = name;
  if (specialCharMatch && specialCharMatch.index !== undefined) {
    cleanedName = name.substring(0, specialCharMatch.index);
  }

  // 하이픈이나 공백으로 분리
  const words = cleanedName.split(/[\s-]+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return cleanedName;
  }

  if (words.length === 1) {
    // 단일 단어인 경우: 첫 글자만 소문자로
    const word = words[0];
    return word.charAt(0).toLowerCase() + word.slice(1);
  }

  // 여러 단어인 경우: camelCase로 변환
  const firstWord = words[0].toLowerCase();
  const restWords = words.slice(1).map((word) => {
    // 각 단어의 첫 글자를 대문자로, 나머지는 소문자로
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return firstWord + restWords.join("");
}

/**
 * Figma PropDefinition의 type을 PropIR의 PropType으로 변환
 * figmaType과 variantOptions도 확인
 */
function mapFigmaTypeToPropType(
  type: string | undefined,
  figmaType?: string,
  variantOptions?: string[],
): PropType {
  // variantOptions가 있거나 figmaType이 VARIANT이면 VARIANT 타입
  if (variantOptions && variantOptions.length > 0) {
    return "VARIANT";
  }
  if (figmaType === "VARIANT") {
    return "VARIANT";
  }

  // INSTANCE_SWAP은 컴포넌트 교체를 의미하므로 COMPONENT 타입
  if (figmaType === "INSTANCE_SWAP") {
    return "COMPONENT";
  }

  // 기본 타입 매핑
  if (type === "component") return "COMPONENT";
  if (type === "string") return "TEXT";
  if (type === "VARIANT") return "VARIANT";
  if (type === "boolean") return "BOOLEAN";
  if (figmaType === "BOOLEAN") return "BOOLEAN";
  if (type === "BOOLEAN") return "BOOLEAN";
  if (type === "TEXT" || figmaType === "TEXT") return "TEXT";
  return "ANY";
}

/**
 * ComponentSetNodeSpec을 PropIR[]로 변환
 *
 * spec.propsDefinition → PropIR[]
 * props만 변환하며, variant style은 포함하지 않음
 */
export function buildPropsIR(spec: ComponentSetNodeSpec): PropIR[] {
  const props = spec.propsDefinition ?? [];

  return props.map((def) => {
    const normalizedName = normalizePropName(def.name);
    const propType = mapFigmaTypeToPropType(
      def.type,
      def.figmaType,
      def.variantOptions,
    );

    const propIR: PropIR = {
      id: def.id,
      originalName: def.name,
      normalizedName,
      type: propType,
      optional: !def.required,
      defaultValue: def.defaultValue,
      required: def.required,
    };

    // VARIANT 타입이거나 variantOptions가 있는 경우 variantOptions 추가
    if (propType === "VARIANT" && def.variantOptions) {
      propIR.variantOptions = def.variantOptions;
    }

    return propIR;
  });
}
