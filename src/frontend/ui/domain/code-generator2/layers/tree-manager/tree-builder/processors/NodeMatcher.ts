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
 * 4. TEXT 노드: 부모 타입 + TEXT 수
 * 5. INSTANCE 노드: componentPropertyReferences.visible
 */
export class NodeMatcher {
  private readonly dataManager: DataManager;

  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private nodeToVariantRoot: Map<string, string>;

  /** Shape 계열 타입 — Figma가 같은 도형을 다른 타입으로 표현할 수 있으므로 상호 호환 */
  private static readonly SHAPE_TYPES = new Set([
    "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
  ]);

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
    // 1. 타입 호환성 체크 (shape 계열은 상호 호환)
    if (nodeA.type !== nodeB.type) {
      const bothShapes =
        NodeMatcher.SHAPE_TYPES.has(nodeA.type) &&
        NodeMatcher.SHAPE_TYPES.has(nodeB.type);
      if (!bothShapes) return false;
    }

    // 2. 같은 ID면 같은 노드
    if (nodeA.id === nodeB.id) {
      return true;
    }

    // 2.5. INSTANCE 노드는 componentId가 다르면 같은 componentSetId에 속하는지 확인
    // (같은 componentSetId이면 variant 차이이므로 병합 가능)
    if (nodeA.type === "INSTANCE" && nodeB.type === "INSTANCE") {
      const compIdA = (nodeA as any).componentId;
      const compIdB = (nodeB as any).componentId;
      if (compIdA && compIdB && compIdA !== compIdB) {
        // componentId가 다르면: 같은 componentSetId에 속하는지 확인
        const setIdA = this.getComponentSetId(compIdA);
        const setIdB = this.getComponentSetId(compIdB);
        if (!(setIdA && setIdB && setIdA === setIdB)) {
          // 다른 componentSetId이면 다른 노드
          return false;
        }
        // 같은 componentSetId이면 계속 진행 (위치나 visible ref로 비교)
      }
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

    // 6. INSTANCE 노드 특별 매칭
    if (this.isSameInstanceNode(nodeA, nodeB)) {
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
   * 노드의 정규화된 위치 계산 (원본 variant 루트의 content box 기준)
   *
   * root의 padding을 제거한 content box 크기로 정규화한다.
   * padding이 다른 variant(예: Tight=True/False)에서도 동일한 정규화 값이 나온다.
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

    // padding을 제거한 content box 기준으로 정규화
    const paddingLeft: number = (variantRoot as any).paddingLeft ?? 0;
    const paddingRight: number = (variantRoot as any).paddingRight ?? 0;
    const paddingTop: number = (variantRoot as any).paddingTop ?? 0;
    const paddingBottom: number = (variantRoot as any).paddingBottom ?? 0;

    const contentX = rootBounds.x + paddingLeft;
    const contentY = rootBounds.y + paddingTop;
    const contentWidth = rootBounds.width - paddingLeft - paddingRight;
    const contentHeight = rootBounds.height - paddingTop - paddingBottom;

    // content 크기가 0 이하이면 root 자체로 fallback
    const baseX = contentWidth > 0 ? contentX : rootBounds.x;
    const baseY = contentHeight > 0 ? contentY : rootBounds.y;
    const normWidth = contentWidth > 0 ? contentWidth : rootBounds.width;
    const normHeight = contentHeight > 0 ? contentHeight : rootBounds.height;

    return {
      x: (node.bounds.x - baseX) / normWidth,
      y: (node.bounds.y - baseY) / normHeight,
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
   * TEXT 노드 특별 매칭: 같은 이름 + 같은 부모 타입
   */
  private isSameTextNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    if (nodeA.type !== "TEXT" || nodeB.type !== "TEXT") {
      return false;
    }

    if (nodeA.name !== nodeB.name) {
      return false;
    }

    const parentAType = nodeA.parent?.type;
    const parentBType = nodeB.parent?.type;

    // 부모 타입이 같으면 같은 역할의 텍스트로 간주
    return !!(parentAType && parentBType && parentAType === parentBType);
  }

  /**
   * INSTANCE 노드 특별 매칭:
   * 1. componentId가 다르면:
   *    - 같은 componentSetId에 속하면 → 같은 노드 (variant 병합)
   *    - 다른 componentSetId이면 → 다른 노드
   * 2. componentPropertyReferences.visible이 같으면 같은 노드로 판단
   * (visible ref가 없는 INSTANCE는 위치 매칭에 의존)
   */
  private isSameInstanceNode(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (nodeA.type !== "INSTANCE" || nodeB.type !== "INSTANCE") {
      return false;
    }

    // componentId 비교
    const compIdA = (nodeA as any).componentId;
    const compIdB = (nodeB as any).componentId;
    if (compIdA && compIdB && compIdA !== compIdB) {
      // componentId가 다르면: 같은 componentSetId에 속하는지 확인
      const setIdA = this.getComponentSetId(compIdA);
      const setIdB = this.getComponentSetId(compIdB);

      // 같은 componentSetId이면 같은 노드로 판단 (variant 차이)
      if (setIdA && setIdB && setIdA === setIdB) {
        return true;
      }

      // 다른 componentSetId이면 다른 노드
      return false;
    }

    const visRefA = nodeA.componentPropertyReferences?.visible;
    const visRefB = nodeB.componentPropertyReferences?.visible;

    // 둘 다 visible ref가 있으면 ref로 비교
    if (visRefA && visRefB) {
      return visRefA === visRefB;
    }

    return false;
  }

  /**
   * componentId가 속한 componentSetId 조회
   */
  private getComponentSetId(componentId: string): string | undefined {
    const depData = this.dataManager.getAllDependencies().get(componentId);
    if (!depData) return undefined;

    // componentId가 속한 componentSetId 찾기
    const componentInfo = (depData.info as any).components?.[componentId];
    return componentInfo?.componentSetId;
  }
}
