// types.ts

export type SupportedType =
  | "FRAME"
  | "GROUP"
  | "TEXT"
  | "VECTOR"
  | "INSTANCE"
  | "COMPONENT"
  | "RECTANGLE";

// [Module 1] 정제된 노드 속성
export interface NodeAttributes {
  id: string;
  name: string;

  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;

  style: Record<string, string | number | object>;

  // Identity & Meta
  imageHash?: string;
  mainComponentId?: string; // 인스턴스 원본 ID
  isMask?: boolean;
  vectorVertexCount?: number; // [Matcher용] 정점 개수
}

// [Module 1] 가상 노드 (Raw Data)
export interface VirtualNode {
  id: string; // Internal UUID
  figmaId: string;
  name: string;
  type: SupportedType;
  attributes: NodeAttributes;
  children: VirtualNode[];
  isLeaf: boolean;
}

// [Module 3] 통합 노드 (Super Set)
export interface UnifiedNode {
  id: string;
  type: SupportedType;
  name: string;

  props: NodeAttributes;

  // 핵심: 이 노드가 보이는 Variant 목록
  // 예: Set(["Default", "Hover"]) -> "Active"에는 없음
  visibleInVariants: Set<string>;

  children: UnifiedNode[];
}

export type VariantValueMap<T> = Record<string, T>;
