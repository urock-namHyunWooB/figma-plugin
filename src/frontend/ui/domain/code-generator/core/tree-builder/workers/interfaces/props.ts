/**
 * Props Interfaces
 *
 * PropsExtractor, PropsLinker 인터페이스
 */

import type { PropDefinition } from "@code-generator/types/architecture";

// ============================================================================
// PropsLinker Interface
// ============================================================================

export interface PropBinding {
  bindingType: "text" | "visible" | "component";
  originalRef: string;
}

export interface IPropsLinker {
  /** componentPropertyReferences를 propBindings로 변환 */
  linkProps(
    refs: Record<string, string> | undefined,
    propsMap: Map<string, PropDefinition>
  ): Record<string, string>;

  /** refs에서 PropBinding 배열 추출 */
  extractPropBindings(refs: Record<string, string> | undefined): PropBinding[];

  /** 바인딩이 하나라도 있는지 확인 */
  hasAnyBinding(refs: Record<string, string> | undefined): boolean;
}

// ============================================================================
// PropsExtractor Interface
// ============================================================================

export interface IPropsExtractor {
  /** componentPropertyDefinitions에서 props 추출 */
  extractProps(props: unknown): Map<string, PropDefinition>;

  /** prop 타입 매핑 (VARIANT → variant, BOOLEAN → boolean 등) */
  mapPropType(type?: string): PropDefinition["type"];
}
