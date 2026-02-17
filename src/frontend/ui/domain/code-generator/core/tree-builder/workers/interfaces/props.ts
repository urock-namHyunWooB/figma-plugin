/**
 * Props Interfaces
 *
 * PropsExtractor, PropsLinker 인터페이스
 */

import type { PropDefinition } from "@code-generator/types/architecture";

// ============================================================================
// PropsLinker Interface
// ============================================================================

/**
 * Prop 바인딩 정보
 * @property bindingType - 바인딩 타입 ("text", "visible", "component")
 * @property originalRef - 원본 참조 문자열
 */
export interface PropBinding {
  bindingType: "text" | "visible" | "component";
  originalRef: string;
}

/**
 * componentPropertyReferences를 propBindings로 변환하는 인터페이스
 */
export interface IPropsLinker {
  /**
   * componentPropertyReferences를 propBindings로 변환
   * @param refs - Figma componentPropertyReferences 객체
   * @param propsMap - PropDefinition 맵
   * @returns prop 이름과 바인딩 값의 Record
   */
  linkProps(
    refs: Record<string, string> | undefined,
    propsMap: Map<string, PropDefinition>
  ): Record<string, string>;

  /**
   * refs에서 PropBinding 배열 추출
   * @param refs - Figma componentPropertyReferences 객체
   * @returns PropBinding 배열
   */
  extractPropBindings(refs: Record<string, string> | undefined): PropBinding[];

  /**
   * 바인딩이 하나라도 있는지 확인
   * @param refs - Figma componentPropertyReferences 객체
   * @returns 바인딩 존재 여부
   */
  hasAnyBinding(refs: Record<string, string> | undefined): boolean;
}

// ============================================================================
// PropsExtractor Interface
// ============================================================================

/**
 * componentPropertyDefinitions에서 props를 추출하는 인터페이스
 */
export interface IPropsExtractor {
  /**
   * componentPropertyDefinitions에서 props 추출
   * @param props - Figma componentPropertyDefinitions 객체
   * @returns prop 이름과 PropDefinition의 맵
   */
  extractProps(props: unknown): Map<string, PropDefinition>;

  /**
   * prop 타입 매핑 (VARIANT → variant, BOOLEAN → boolean 등)
   * @param type - Figma prop 타입 문자열
   * @returns PropDefinition의 type 값
   */
  mapPropType(type?: string): PropDefinition["type"];
}
