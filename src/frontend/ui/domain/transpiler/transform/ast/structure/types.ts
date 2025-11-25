import { SceneNode } from "../../../types/figma-api";

// 노드의 종류: 고정된 구조(Fixed) 또는 변경되는 슬롯(Slot)
export type StructureNodeType = "FIXED" | "SLOT";

/**
 * 분석된 컴포넌트 구조의 기본 단위
 */
export interface BaseStructureNode {
  kind: StructureNodeType;
  id: string; // 대표 노드의 ID (주로 첫 번째 Variant의 노드 ID 사용)
  name: string;
  originalType: string; // FRAME, TEXT, INSTANCE etc.
  hash: string; // 구조적 해시값
}

/**
 * 모든 Variant에서 공통적으로 나타나는 고정된 구조
 */
export interface FixedStructureNode extends BaseStructureNode {
  kind: "FIXED";
  children: StructureNode[];

  // 모든 Variant의 해당 노드들을 참조 (스타일/속성 추출용)
  variants: SceneNode[];
}

/**
 * Variant마다 구조가 달라져서 교체 가능한 영역 (Slot)
 */
export interface SlotStructureNode extends BaseStructureNode {
  kind: "SLOT";

  // 각 Variant별로 이 슬롯에 무엇이 들어가는지 매핑
  // key: Variant의 속성 조합 (또는 ID), value: 해당 하위 트리 (분석된 StructureNode)
  variantMap: Record<string, StructureNode | null>;
}

export type StructureNode = FixedStructureNode | SlotStructureNode;

/**
 * 최종 분석 결과 트리
 */
export interface AnalyzedStructureTree {
  root: StructureNode;
  variantCount: number; // 분석에 사용된 총 Variant 개수
}
