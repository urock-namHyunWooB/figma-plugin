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

/**
 * Variant 병합 인터페이스
 */
export interface IVariantMerger {
  /**
   * 여러 variant를 병합하여 InternalNode 트리 생성
   * @param variants - variant SceneNode 배열
   * @param data - 전처리된 디자인 데이터
   * @returns 병합된 InternalNode 트리 루트
   */
  mergeVariants(variants: SceneNode[], data: PreparedDesignData): InternalNode;

  /**
   * 단일 SceneNode를 InternalNode로 변환
   * @param node - 변환할 SceneNode
   * @param parent - 부모 InternalNode (nullable)
   * @param variantName - variant 이름
   * @param data - 전처리된 디자인 데이터
   * @returns 변환된 InternalNode
   */
  convertToInternalNode(
    node: SceneNode,
    parent: InternalNode | null,
    variantName: string,
    data: PreparedDesignData
  ): InternalNode;

  /**
   * 두 노드의 IoU 계산
   * @param box1 - 첫 번째 경계 상자
   * @param box2 - 두 번째 경계 상자
   * @returns IoU 값 (0 ~ 1)
   */
  calculateIoU(box1: DOMRect, box2: DOMRect): number;

  /**
   * 두 노드가 같은 노드인지 확인 (IoU 기반)
   * @param node1 - 첫 번째 SceneNode
   * @param node2 - 두 번째 SceneNode
   * @param threshold - IoU 임계값 (기본값: 0.8)
   * @returns 같은 노드 여부
   */
  isSameNode(node1: SceneNode, node2: SceneNode, threshold?: number): boolean;
}

// ============================================================================
// SquashByIou Interface
// ============================================================================

/**
 * IoU 기반 노드 스쿼시 인터페이스
 */
export interface ISquashByIou {
  /**
   * IoU 기반으로 노드 트리 스쿼시
   * @param trees - InternalNode 트리 배열
   * @param threshold - IoU 임계값 (기본값: 0.8)
   * @returns 스쿼시된 단일 InternalNode 트리
   */
  squashByIou(trees: InternalNode[], threshold?: number): InternalNode;
}
