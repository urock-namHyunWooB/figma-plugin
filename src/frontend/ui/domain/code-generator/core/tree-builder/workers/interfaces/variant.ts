/**
 * Variant Interfaces
 *
 * VariantMerger, SquashByIou 인터페이스
 */

import type { PreparedDesignData } from "@code-generator/types/architecture";
import type { InternalNode } from "./core";

// ============================================================================
// VariantMerger Interface
// ============================================================================

export interface IVariantMerger {
  /** 여러 variant를 병합하여 InternalNode 트리 생성 */
  mergeVariants(variants: SceneNode[], data: PreparedDesignData): InternalNode;

  /** 단일 SceneNode를 InternalNode로 변환 */
  convertToInternalNode(
    node: SceneNode,
    parent: InternalNode | null,
    variantName: string,
    data: PreparedDesignData
  ): InternalNode;

  /** 두 노드의 IoU 계산 */
  calculateIoU(box1: DOMRect, box2: DOMRect): number;

  /** 두 노드가 같은 노드인지 확인 (IoU 기반) */
  isSameNode(node1: SceneNode, node2: SceneNode, threshold?: number): boolean;
}

// ============================================================================
// SquashByIou Interface
// ============================================================================

export interface ISquashByIou {
  /** IoU 기반으로 노드 트리 스쿼시 */
  squashByIou(trees: InternalNode[], threshold?: number): InternalNode;
}
