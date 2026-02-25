import { InternalNode } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * NodeMatcher
 *
 * 두 InternalNode가 같은 역할을 하는지 판단하는 매칭 로직
 *
 * 매칭 기준:
 * 1. 타입 체크
 * 2. ID 체크
 * 3. 정규화된 위치 비교 (±0.1)
 * 4. TEXT 노드: 이름 + 부모 타입
 */
export class NodeMatcher {
  private readonly dataManager: DataManager;

  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private nodeToVariantRoot: Map<string, string>;

  constructor(
    dataManager: DataManager,
    nodeToVariantRoot: Map<string, string>
  ) {
    this.dataManager = dataManager;
    this.nodeToVariantRoot = nodeToVariantRoot;
  }

  /**
   * 두 노드가 같은 역할을 하는지 판단
   */
  public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    // 1. 타입이 다르면 다른 노드
    if (nodeA.type !== nodeB.type) {
      return false;
    }

    // 2. 같은 ID면 같은 노드
    if (nodeA.id === nodeB.id) {
      return true;
    }

    // 3. 부모가 없으면 (루트) → 루트끼리는 같음
    if (!nodeA.parent && !nodeB.parent) {
      return true;
    }

    // 4. 정규화된 위치 비교
    if (this.isSamePosition(nodeA, nodeB)) {
      return true;
    }

    // 5. TEXT 노드 특별 매칭
    if (this.isSameTextNode(nodeA, nodeB)) {
      return true;
    }

    return false;
  }

  /**
   * 정규화된 위치가 같은지 확인 (±0.1 오차 허용)
   */
  private isSamePosition(nodeA: InternalNode, nodeB: InternalNode): boolean {
    const posA = this.getNormalizedPosition(nodeA);
    const posB = this.getNormalizedPosition(nodeB);

    if (!posA || !posB) {
      return false;
    }

    const dx = Math.abs(posA.x - posB.x);
    const dy = Math.abs(posA.y - posB.y);

    return dx <= 0.1 && dy <= 0.1;
  }

  /**
   * 노드의 정규화된 위치 계산 (원본 variant 루트 기준)
   */
  private getNormalizedPosition(
    node: InternalNode
  ): { x: number; y: number } | null {
    if (!node.bounds || !node.mergedNodes || node.mergedNodes.length === 0) {
      return null;
    }

    const originalId = node.mergedNodes[0].id;
    const variantRoot = this.findOriginalVariantRoot(originalId);

    if (!variantRoot) return null;

    const rootBounds = (variantRoot as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!rootBounds || rootBounds.width === 0 || rootBounds.height === 0) {
      return null;
    }

    return {
      x: (node.bounds.x - rootBounds.x) / rootBounds.width,
      y: (node.bounds.y - rootBounds.y) / rootBounds.height,
    };
  }

  /**
   * 원본 variant 루트 찾기
   */
  private findOriginalVariantRoot(nodeId: string): SceneNode | null {
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;

    const { node } = this.dataManager.getById(variantRootId);
    return node || null;
  }

  /**
   * TEXT 노드 특별 매칭: 같은 부모 타입 + 유일한 TEXT 자식이면 이름 무관 매칭
   * 부모 아래 TEXT가 여러 개면 이름으로 구분
   */
  private isSameTextNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    if (nodeA.type !== "TEXT" || nodeB.type !== "TEXT") {
      return false;
    }

    const parentA = nodeA.parent;
    const parentB = nodeB.parent;

    if (!parentA || !parentB || parentA.type !== parentB.type) {
      return false;
    }

    // 각 부모 아래 TEXT 자식 수 확인
    const textCountA = parentA.children.filter(c => c.type === "TEXT").length;
    const textCountB = parentB.children.filter(c => c.type === "TEXT").length;

    // 부모 아래 TEXT가 1개씩이면 이름 무관 매칭 (variant에 따라 이름이 바뀔 수 있음)
    if (textCountA === 1 && textCountB === 1) {
      return true;
    }

    // TEXT가 여러 개면 이름으로 구분
    return nodeA.name === nodeB.name;
  }
}
