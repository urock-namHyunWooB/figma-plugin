/**
 * Slot Interfaces
 *
 * SlotDetector, TextSlotDetector 인터페이스
 */

import type { SlotDefinition, ArraySlotInfo, PropDefinition, PreparedDesignData } from "@compiler/types/architecture";

// ============================================================================
// SlotDetector Interface
// ============================================================================

export interface SlotCandidate {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  propName?: string;
  propType: "boolean" | "instance_swap" | "array";
}

export interface ISlotDetector {
  /** INSTANCE 노드가 slot으로 변환될 조건 확인 */
  shouldConvertToSlot(nodeType: string, visibleRef?: string, propType?: string): boolean;

  /** 노드에서 slot 정보 추출 */
  extractSlotDefinition(nodeId: string, nodeName: string, propName: string): SlotDefinition;

  /** 배열 슬롯 감지 */
  detectArraySlot(
    children: Array<{ id: string; name: string; type: string; componentId?: string }>
  ): ArraySlotInfo | null;

  /** 모든 slot 후보 찾기 */
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

export interface TextSlotInput {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  mergedNodeIds: string[];
}

export interface TextSlotResult {
  shouldConvert: boolean;
  propName?: string;
  propDefinition?: PropDefinition;
}

export interface ITextSlotDetector {
  /** TEXT 노드가 text slot으로 변환되어야 하는지 확인 */
  shouldConvertToTextSlot(
    mergedNodeIds: string[],
    totalVariantCount: number,
    data: PreparedDesignData
  ): boolean;

  /** text slot prop 이름 생성 */
  generateTextPropName(nodeName: string): string;

  /** text slot의 기본값 추출 */
  getDefaultTextValue(mergedNodeIds: string[], data: PreparedDesignData): string;

  /** TEXT 노드를 text slot으로 변환 */
  detectTextSlot(
    input: TextSlotInput,
    totalVariantCount: number,
    data: PreparedDesignData
  ): TextSlotResult;
}
