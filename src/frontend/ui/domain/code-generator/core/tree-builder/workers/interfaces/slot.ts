/**
 * Slot Interfaces
 *
 * SlotDetector, TextSlotDetector 인터페이스
 */

import type { SlotDefinition, ArraySlotInfo, PropDefinition, PreparedDesignData } from "@code-generator/types/architecture";

// ============================================================================
// SlotDetector Interface
// ============================================================================

/**
 * Slot 후보 정보
 * @property nodeId - 노드 ID
 * @property nodeName - 노드 이름
 * @property nodeType - 노드 타입
 * @property propName - prop 이름 (선택적)
 * @property propType - prop 타입 ("boolean", "instance_swap", "array")
 */
export interface SlotCandidate {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  propName?: string;
  propType: "boolean" | "instance_swap" | "array";
}

/**
 * Slot 감지 인터페이스
 */
export interface ISlotDetector {
  /**
   * INSTANCE 노드가 slot으로 변환될 조건 확인
   * @param nodeType - 노드 타입
   * @param visibleRef - visible 참조 문자열 (선택적)
   * @param propType - prop 타입 (선택적)
   * @returns slot 변환 여부
   */
  shouldConvertToSlot(nodeType: string, visibleRef?: string, propType?: string): boolean;

  /**
   * 노드에서 slot 정보 추출
   * @param nodeId - 노드 ID
   * @param nodeName - 노드 이름
   * @param propName - prop 이름
   * @returns SlotDefinition
   */
  extractSlotDefinition(nodeId: string, nodeName: string, propName: string): SlotDefinition;

  /**
   * 배열 슬롯 감지
   * @param children - 자식 노드 배열
   * @returns ArraySlotInfo 또는 null
   */
  detectArraySlot(
    children: Array<{ id: string; name: string; type: string; componentId?: string }>
  ): ArraySlotInfo | null;

  /**
   * 모든 slot 후보 찾기
   * @param nodes - 노드 배열
   * @param propsDefinitions - props 정의 객체
   * @returns SlotCandidate 배열
   */
  findSlotCandidates(
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      componentPropertyReferences?: Record<string, string>;
    }>,
    propsDefinitions: Record<string, { type: string }>
  ): SlotCandidate[];
}

// ============================================================================
// TextSlotDetector Interface
// ============================================================================

/**
 * Text Slot 입력 데이터
 * @property nodeId - 노드 ID
 * @property nodeName - 노드 이름
 * @property nodeType - 노드 타입
 * @property mergedNodeIds - 병합된 노드 ID 배열
 */
export interface TextSlotInput {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  mergedNodeIds: string[];
}

/**
 * Text Slot 감지 결과
 * @property shouldConvert - 변환 여부
 * @property propName - prop 이름 (선택적)
 * @property propDefinition - PropDefinition (선택적)
 */
export interface TextSlotResult {
  shouldConvert: boolean;
  propName?: string;
  propDefinition?: PropDefinition;
}

/**
 * Text Slot 감지 인터페이스
 */
export interface ITextSlotDetector {
  /**
   * TEXT 노드가 text slot으로 변환되어야 하는지 확인
   * @param mergedNodeIds - 병합된 노드 ID 배열
   * @param totalVariantCount - 전체 variant 수
   * @param data - 전처리된 디자인 데이터
   * @returns text slot 변환 여부
   */
  shouldConvertToTextSlot(
    mergedNodeIds: string[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): boolean;

  /**
   * text slot prop 이름 생성
   * @param nodeName - 노드 이름
   * @returns 생성된 prop 이름
   */
  generateTextPropName(nodeName: string): string;

  /**
   * text slot의 기본값 추출
   * @param mergedNodeIds - 병합된 노드 ID 배열
   * @param data - 전처리된 디자인 데이터
   * @returns 기본 텍스트 값
   */
  getDefaultTextValue(mergedNodeIds: string[], data: PreparedDesignData): string;

  /**
   * TEXT 노드를 text slot으로 변환
   * @param input - TextSlotInput
   * @param totalVariantCount - 전체 variant 수
   * @param data - 전처리된 디자인 데이터
   * @returns TextSlotResult
   */
  detectTextSlot(
    input: TextSlotInput,
    totalVariantCount: number,
    data: PreparedDesignData
  ): TextSlotResult;
}
