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
/** Auto Layout 부모 정보 캐시 */
interface AutoLayoutInfo {
  isAuto: boolean;
  axis: "x" | "y";
  spacing: number;
}

export class NodeMatcher {
  private readonly dataManager: DataManager;

  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private nodeToVariantRoot: Map<string, string>;

  /** Auto Layout 감지 캐시 (부모 ID → 정보) */
  private autoLayoutCache = new Map<string, AutoLayoutInfo>();

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

    // 5.5. Auto Layout 왼쪽 컨텍스트 보정 매칭
    // 부모가 Auto Layout이면, 왼쪽 형제의 type+size를 비교하여
    // extra 요소에 의한 위치 시프트를 보정한 뒤 매칭
    if (this.isSameAutoLayoutChild(nodeA, nodeB)) {
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
   *
   * 4가지 비교를 동시에 수행하여 최소 오차로 판단:
   *  1) 비례 배치: 각자 contentWidth로 정규화 (현행)
   *  2) 좌정렬 기준: 왼쪽 오프셋을 avgWidth로 정규화
   *  3) 가운데정렬 기준: 중앙 오프셋을 avgWidth로 정규화
   *  4) 우정렬 기준: 오른쪽 오프셋을 avgWidth로 정규화
   *
   * X축·Y축 각각 4가지 중 최소 오차를 취하여 둘 다 ≤ 0.1이면 매칭.
   *
   * Fallback: 위 매칭 실패 시 heightRatio ≥ 2이면 상대 좌표 ±10px 비교.
   */
  private isSamePosition(nodeA: InternalNode, nodeB: InternalNode): boolean {
    // 양쪽 노드의 contentBox 정보 조회
    const boxA = this.getContentBoxInfo(nodeA);
    const boxB = this.getContentBoxInfo(nodeB);

    if (boxA && boxB) {
      // --- X축: 4가지 비교 ---
      const offsetAx = boxA.nodeX - boxA.contentX;
      const offsetBx = boxB.nodeX - boxB.contentX;
      const nodeWidthA = boxA.nodeWidth;
      const nodeWidthB = boxB.nodeWidth;
      const avgW = (boxA.contentWidth + boxB.contentWidth) / 2;

      // 1) 비례 배치 (각자 contentWidth로 정규화)
      const propX = Math.abs(
        offsetAx / boxA.contentWidth - offsetBx / boxB.contentWidth
      );
      // 2) 좌정렬: 왼쪽 오프셋 비교
      const leftX = avgW > 0
        ? Math.abs(offsetAx - offsetBx) / avgW
        : Infinity;
      // 3) 가운데정렬: 중앙 오프셋 비교
      const centerAx = offsetAx + nodeWidthA / 2;
      const centerBx = offsetBx + nodeWidthB / 2;
      const centerX = avgW > 0
        ? Math.abs(centerAx - centerBx) / avgW
        : Infinity;
      // 4) 우정렬: 오른쪽 오프셋 비교
      const rightAx = boxA.contentWidth - (offsetAx + nodeWidthA);
      const rightBx = boxB.contentWidth - (offsetBx + nodeWidthB);
      const rightX = avgW > 0
        ? Math.abs(rightAx - rightBx) / avgW
        : Infinity;

      const minDiffX = Math.min(propX, leftX, centerX, rightX);

      // --- Y축: 4가지 비교 ---
      const offsetAy = boxA.nodeY - boxA.contentY;
      const offsetBy = boxB.nodeY - boxB.contentY;
      const nodeHeightA = boxA.nodeHeight;
      const nodeHeightB = boxB.nodeHeight;
      const avgH = (boxA.contentHeight + boxB.contentHeight) / 2;

      // 1) 비례 배치
      const propY = Math.abs(
        offsetAy / boxA.contentHeight - offsetBy / boxB.contentHeight
      );
      // 2) 상단정렬
      const topY = avgH > 0
        ? Math.abs(offsetAy - offsetBy) / avgH
        : Infinity;
      // 3) 가운데정렬
      const middleAy = offsetAy + nodeHeightA / 2;
      const middleBy = offsetBy + nodeHeightB / 2;
      const middleY = avgH > 0
        ? Math.abs(middleAy - middleBy) / avgH
        : Infinity;
      // 4) 하단정렬
      const bottomAy = boxA.contentHeight - (offsetAy + nodeHeightA);
      const bottomBy = boxB.contentHeight - (offsetBy + nodeHeightB);
      const bottomY = avgH > 0
        ? Math.abs(bottomAy - bottomBy) / avgH
        : Infinity;

      const minDiffY = Math.min(propY, topY, middleY, bottomY);

      if (minDiffX <= 0.1 && minDiffY <= 0.1) {
        return true;
      }
    }

    // Fallback: root 높이 비율이 극단적으로 다르면 root 기준 상대 좌표로 비교
    // (Figma 캔버스에서 variant는 나란히 배치되므로 절대좌표가 아닌 상대좌표 사용)
    if (nodeA.bounds && nodeB.bounds) {
      const rootBoundsA = this.getVariantRootBounds(nodeA);
      const rootBoundsB = this.getVariantRootBounds(nodeB);
      if (rootBoundsA && rootBoundsB) {
        const heightRatio = Math.max(rootBoundsA.height, rootBoundsB.height) /
          Math.min(rootBoundsA.height, rootBoundsB.height);
        if (heightRatio >= 2) {
          const relAx = nodeA.bounds.x - rootBoundsA.x;
          const relAy = nodeA.bounds.y - rootBoundsA.y;
          const relBx = nodeB.bounds.x - rootBoundsB.x;
          const relBy = nodeB.bounds.y - rootBoundsB.y;
          if (Math.abs(relAx - relBx) <= 10 && Math.abs(relAy - relBy) <= 10) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 노드가 속한 variant root의 bounds 조회
   */
  private getVariantRootBounds(
    node: InternalNode
  ): { x: number; y: number; width: number; height: number } | null {
    if (!node.mergedNodes || node.mergedNodes.length === 0) return null;
    const originalId = node.mergedNodes[0].id;
    const variantRoot = this.findOriginalVariantRoot(originalId);
    if (!variantRoot) return null;
    const bounds = (variantRoot as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    return bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null;
  }

  /**
   * 노드의 contentBox 정보 조회 (4가지 비교에 필요한 값들)
   * mergedNodes를 순회하여 유효한 contentBox를 찾는다.
   */
  private getContentBoxInfo(
    node: InternalNode
  ): {
    nodeX: number; nodeY: number; nodeWidth: number; nodeHeight: number;
    contentX: number; contentY: number; contentWidth: number; contentHeight: number;
  } | null {
    if (!node.mergedNodes || node.mergedNodes.length === 0) return null;

    for (const merged of node.mergedNodes) {
      const result = this.calcContentBoxForMergedNode(merged.id);
      if (result) return result;
    }
    return null;
  }

  /**
   * 특정 mergedNode ID로 contentBox 정보 계산
   */
  private calcContentBoxForMergedNode(
    nodeId: string
  ): {
    nodeX: number; nodeY: number; nodeWidth: number; nodeHeight: number;
    contentX: number; contentY: number; contentWidth: number; contentHeight: number;
  } | null {
    const variantRoot = this.findOriginalVariantRoot(nodeId);
    if (!variantRoot) return null;

    const { node: originalNode } = this.dataManager.getById(nodeId);
    if (!originalNode) return null;

    const nodeBounds = (originalNode as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!nodeBounds) return null;

    const rootBounds = (variantRoot as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!rootBounds || rootBounds.width === 0 || rootBounds.height === 0) {
      return null;
    }

    const paddingLeft: number = (variantRoot as any).paddingLeft ?? 0;
    const paddingRight: number = (variantRoot as any).paddingRight ?? 0;
    const paddingTop: number = (variantRoot as any).paddingTop ?? 0;
    const paddingBottom: number = (variantRoot as any).paddingBottom ?? 0;

    const contentWidth = rootBounds.width - paddingLeft - paddingRight;
    const contentHeight = rootBounds.height - paddingTop - paddingBottom;

    if (contentWidth <= 0 || contentHeight <= 0) return null;

    return {
      nodeX: nodeBounds.x,
      nodeY: nodeBounds.y,
      nodeWidth: nodeBounds.width ?? 0,
      nodeHeight: nodeBounds.height ?? 0,
      contentX: rootBounds.x + paddingLeft,
      contentY: rootBounds.y + paddingTop,
      contentWidth,
      contentHeight,
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
   *
   * 주의: 같은 componentId는 여기서 매칭하지 않음.
   * 같은 컴포넌트가 여러 위치에 사용될 수 있으므로 (예: leftIcon, rightIcon)
   * 위치 비교(Step 4)에 의존해야 함.
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

  // ─── Stage 5.5: Auto Layout 왼쪽 컨텍스트 보정 매칭 ───

  /**
   * Auto Layout 부모의 자식 노드를 왼쪽 컨텍스트 보정으로 매칭
   *
   * Auto Layout에서 요소 추가/제거 시 후속 노드가 밀려서 위치 매칭이 실패하는 문제를 해결.
   * 왼쪽(위쪽) 형제의 type+size를 비교하여 extra 요소에 의한 시프트를 보정한다.
   */
  private isSameAutoLayoutChild(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    // 1. 타입 일치 확인 (Stage 1에서 shape 호환성은 이미 통과)
    if (nodeA.type !== nodeB.type) return false;

    // 2. 부모가 Auto Layout인지 확인
    const layoutInfo = this.getParentAutoLayoutInfo(nodeA, nodeB);
    if (!layoutInfo) return false;

    // 3. 크기 유사성 확인
    if (!this.isSimilarSize(nodeA, nodeB)) return false;

    // 4. 왼쪽 컨텍스트 비교로 위치 보정 후 매칭
    return this.matchByAdjustedPosition(nodeA, nodeB, layoutInfo);
  }

  /**
   * 양쪽 부모 중 Auto Layout인 부모의 정보 반환
   */
  private getParentAutoLayoutInfo(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): AutoLayoutInfo | null {
    const parentA = nodeA.parent;
    const parentB = nodeB.parent;

    if (parentA) {
      const info = this.checkAutoLayout(parentA);
      if (info.isAuto) return info;
    }
    if (parentB) {
      const info = this.checkAutoLayout(parentB);
      if (info.isAuto) return info;
    }
    return null;
  }

  /**
   * InternalNode의 부모가 Auto Layout인지 확인 (캐싱)
   */
  private checkAutoLayout(parent: InternalNode): AutoLayoutInfo {
    const cached = this.autoLayoutCache.get(parent.id);
    if (cached) return cached;

    const originalId = parent.mergedNodes?.[0]?.id ?? parent.id;
    const { node: parentNode } = this.dataManager.getById(originalId);
    const layoutMode = (parentNode as any)?.layoutMode;
    const result: AutoLayoutInfo = {
      isAuto:
        layoutMode === "HORIZONTAL" || layoutMode === "VERTICAL",
      axis: layoutMode === "VERTICAL" ? "y" : "x",
      spacing: (parentNode as any)?.itemSpacing ?? 0,
    };
    this.autoLayoutCache.set(parent.id, result);
    return result;
  }

  /**
   * 두 노드의 크기가 유사한지 확인 (±5px tolerance)
   */
  private isSimilarSize(
    nodeA: InternalNode,
    nodeB: InternalNode,
    tolerance = 5
  ): boolean {
    if (!nodeA.bounds || !nodeB.bounds) return false;
    return (
      Math.abs(nodeA.bounds.width - nodeB.bounds.width) <= tolerance &&
      Math.abs(nodeA.bounds.height - nodeB.bounds.height) <= tolerance
    );
  }

  /**
   * 왼쪽 컨텍스트를 보정하여 위치 매칭
   *
   * 1. 원본 variant 데이터에서 양쪽 노드의 왼쪽 형제를 수집
   * 2. type+size로 왼쪽 형제를 매칭하여 공유/extra 요소 식별
   * 3. extra 요소의 크기 + gap을 보정량으로 계산
   * 4. 보정된 위치로 최종 비교
   */
  private matchByAdjustedPosition(
    nodeA: InternalNode,
    nodeB: InternalNode,
    layoutInfo: AutoLayoutInfo
  ): boolean {
    const { axis, spacing: gap } = layoutInfo;

    // 원본 variant 데이터에서 왼쪽 형제 조회
    const leftA = this.getOriginalLeftSiblings(nodeA, axis);
    const leftB = this.getOriginalLeftSiblings(nodeB, axis);
    if (!leftA || !leftB) return false;

    // 왼쪽 형제를 type+size로 매칭하여 extra 요소 식별
    const { extraA, extraB } = this.matchLeftContexts(leftA, leftB);

    // 공유 컨텍스트가 없으면: 부모 자식 수가 다를 때만 허용
    // 자식 수가 같으면 단순 재배치(LeftIcon↔RightIcon)일 가능성 → 거부
    // 자식 수가 다르면 요소 추가/제거로 인한 시프트 → 허용
    const sharedCount = leftA.length - extraA.length;
    if (sharedCount === 0) {
      const childrenA = this.getOriginalParentChildren(nodeA);
      const childrenB = this.getOriginalParentChildren(nodeB);
      if (!childrenA || !childrenB) return false;
      if (childrenA.length === childrenB.length) return false;
    }

    // extra 요소의 크기 + gap 합산 → 보정량
    const sizeKey = axis === "x" ? "width" : "height";
    const shiftA = extraA.reduce(
      (sum, n) =>
        sum + ((n as any).absoluteBoundingBox?.[sizeKey] ?? 0) + gap,
      0
    );
    const shiftB = extraB.reduce(
      (sum, n) =>
        sum + ((n as any).absoluteBoundingBox?.[sizeKey] ?? 0) + gap,
      0
    );

    // 원본 절대좌표에서 보정 후 비교
    const nodeAId = nodeA.mergedNodes?.[0]?.id ?? nodeA.id;
    const nodeBId = nodeB.mergedNodes?.[0]?.id ?? nodeB.id;
    const { node: origA } = this.dataManager.getById(nodeAId);
    const { node: origB } = this.dataManager.getById(nodeBId);
    if (!origA || !origB) return false;

    const posA =
      ((origA as any).absoluteBoundingBox?.[axis] ?? 0) - shiftA;
    const posB =
      ((origB as any).absoluteBoundingBox?.[axis] ?? 0) - shiftB;

    return Math.abs(posA - posB) <= 10;
  }

  /**
   * 원본 variant 데이터에서 노드의 왼쪽(위쪽) 형제를 수집
   *
   * InternalNode.parent.children은 merge 과정에서 stale해질 수 있으므로,
   * dataManager를 통해 원본 variant의 부모 children에서 조회한다.
   */
  private getOriginalLeftSiblings(
    node: InternalNode,
    axis: "x" | "y"
  ): SceneNode[] | null {
    const parent = node.parent;
    if (!parent) return null;

    // 원본 부모의 children 조회
    const parentOriginalId = parent.mergedNodes?.[0]?.id ?? parent.id;
    const { node: parentSceneNode } = this.dataManager.getById(parentOriginalId);
    if (!(parentSceneNode as any)?.children) return null;

    // 원본 노드의 위치 조회
    const nodeOriginalId = node.mergedNodes?.[0]?.id ?? node.id;
    const { node: originalNode } = this.dataManager.getById(nodeOriginalId);
    const nodePos = (originalNode as any)?.absoluteBoundingBox?.[axis];
    if (nodePos == null) return null;

    // 해당 노드보다 왼쪽(위쪽)에 있는 형제 필터링
    return ((parentSceneNode as any).children as SceneNode[]).filter(
      (sibling: SceneNode) => {
        if ((sibling as any).id === nodeOriginalId) return false;
        const siblingPos =
          (sibling as any).absoluteBoundingBox?.[axis] ?? 0;
        return siblingPos < nodePos;
      }
    );
  }

  /**
   * 원본 variant 부모의 전체 children 배열 조회
   */
  private getOriginalParentChildren(node: InternalNode): any[] | null {
    const parent = node.parent;
    if (!parent) return null;
    const parentOriginalId = parent.mergedNodes?.[0]?.id ?? parent.id;
    const { node: parentSceneNode } = this.dataManager.getById(parentOriginalId);
    return (parentSceneNode as any)?.children ?? null;
  }

  /**
   * 왼쪽 컨텍스트의 type+size 기반 greedy 매칭
   *
   * 공유 요소와 각 측의 extra 요소를 분리한다.
   */
  private matchLeftContexts(
    leftA: SceneNode[],
    leftB: SceneNode[]
  ): { extraA: SceneNode[]; extraB: SceneNode[] } {
    const usedB = new Set<number>();
    const extraA: SceneNode[] = [];

    for (const a of leftA) {
      const aBounds = (a as any).absoluteBoundingBox;
      const matchIdx = leftB.findIndex((b, idx) => {
        if (usedB.has(idx)) return false;
        const bBounds = (b as any).absoluteBoundingBox;
        return (
          (a as any).type === (b as any).type &&
          Math.abs((aBounds?.width ?? 0) - (bBounds?.width ?? 0)) <= 5 &&
          Math.abs((aBounds?.height ?? 0) - (bBounds?.height ?? 0)) <= 5
        );
      });
      if (matchIdx !== -1) {
        usedB.add(matchIdx);
      } else {
        extraA.push(a);
      }
    }

    const extraB = leftB.filter((_, idx) => !usedB.has(idx));
    return { extraA, extraB };
  }
}
