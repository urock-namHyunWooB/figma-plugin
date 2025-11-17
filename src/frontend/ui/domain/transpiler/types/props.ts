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
export interface VariantStyleIR {
  /** Variant prop 이름 (예: "Size", "State") */
  propName: string;
  /** Base style (layoutTree 기준으로 생성된 기본 스타일) */
  baseStyle: Record<string, any>;
  /** 각 옵션 값별 스타일 델타 (baseStyle과의 차이만 저장) */
  variantStyles: Record<string, Record<string, any>>;
}

export interface PropIR {
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

  defaultValue?: string;

  required?: boolean;
}
