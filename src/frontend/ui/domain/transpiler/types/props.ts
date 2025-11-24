/**
 * Props Intermediate Representation (IR)
 *
 * Props 변환 과정의 중간 표현 형식
 * spec → PropIR[] → prettify → PropIR[] → codegen → ts.InterfaceDeclaration
 */

export type PropType = "VARIANT" | "BOOLEAN" | "TEXT" | "ANY" | "COMPONENT";

/**
 * Variant 스타일 정보
 * 각 variant 옵션 값별로 baseStyle과의 차이(delta)를 저장
 */

export interface PropIR {
  id: string;
  /** 원본 이름 (Figma에서 정의된 이름) */
  originalName: string;
  /** 정규화된 이름 (TypeScript에서 사용할 이름) */
  normalizedName: string;
  /** Prop 타입 */
  type: PropType;
  /** Variant 옵션들 (type이 VARIANT인 경우) */
  variantOptions?: string[];
  /** 선택적 prop인지 여부 */
  optional: boolean;

  defaultValue?: string | number | boolean;

  required?: boolean;
}
