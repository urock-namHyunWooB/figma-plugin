import { InternalNode, VariantOrigin } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

type BoundingBox = { x: number; y: number; width: number; height: number };
type SiblingEntry = { next: InternalNode | null; prev: InternalNode | null };
type SiblingGraph = Map<string, SiblingEntry[]>;

/**
 * IoU 기반 cross-depth squash
 *
 * 머지 후 같은 타입의 노드가 서로 다른 depth에 남아 있을 때,
 * variant root 기준 정규화 좌표로 IoU ≥ 0.5이면 하나로 합침.
 *
 * 알고리즘:
 * 1. groupNodesByType: BFS로 타입별 그룹핑
 * 2. findSquashGroups: IoU ≥ 0.5 + 같은 이름인 후보 찾기
 * 3. isValidSquashGroup: mask, instance children, ancestor-descendant 검증
 * 4. squashByTopoSort: deep clone으로 양방향 검증, 한쪽만 valid하면 실행
 * 5. performSquash: mergedNodes 합치기 + source 제거
 */
export class UpdateSquashByIou {
  private static readonly INSTANCE_ID_PREFIX = "I";

  private readonly dataManager: DataManager;
  private readonly nodeToVariantRoot: Map<string, string>;
  private mergedTreeRoot: InternalNode | null = null;

  constructor(
    dataManager: DataManager,
    nodeToVariantRoot: Map<string, string>
  ) {
    this.dataManager = dataManager;
    this.nodeToVariantRoot = nodeToVariantRoot;
  }

  /**
   * 진입점: merged tree에 대해 IoU 기반 cross-depth squash 실행
   *
   * variant root 기준 정규화 후 IoU ≥ 0.5인 같은 타입/이름 노드를 합침
   */
  public execute(
    mergedTree: InternalNode,
    variantTrees: InternalNode[]
  ): InternalNode {
    this.mergedTreeRoot = mergedTree;
    const siblingGraph = this.createSiblingGraph(variantTrees);

    // Pass 1: IoU 기반 squash
    const nodesByType1 = this.groupNodesByType(mergedTree);
    const squashGroups1 = this.findSquashGroups(nodesByType1);
    const filteredGroups1 = squashGroups1.filter((group) =>
      this.isValidSquashGroup(group)
    );
    for (const [nodeA, nodeB] of filteredGroups1) {
      this.squashByTopoSort(mergedTree, nodeA, nodeB, siblingGraph);
    }

    return mergedTree;
  }

  // ============================================================
  // 1. Node Grouping (BFS → type별 그룹)
  // ============================================================

  private groupNodesByType(tree: InternalNode): Map<string, InternalNode[]> {
    const map = new Map<string, InternalNode[]>();

    const traverse = (node: InternalNode) => {
      if (!map.has(node.type)) map.set(node.type, []);
      map.get(node.type)!.push(node);
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree);
    return map;
  }

  // ============================================================
  // 2. Find Squash Candidates (IoU ≥ 0.5)
  // ============================================================

  private findSquashGroups(
    nodesByType: Map<string, InternalNode[]>
  ): [InternalNode, InternalNode][] {
    const groups: [InternalNode, InternalNode][] = [];

    for (const [, nodes] of nodesByType) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          // 같은 이름인 경우만 squash 후보
          if (nodes[i].name !== nodes[j].name) continue;
          // cross-depth만 squash 대상: 같은 depth의 노드는 variant 머지가 의도적으로 분리한 것
          const depthI = this.getNodeDepth(nodes[i]);
          const depthJ = this.getNodeDepth(nodes[j]);
          if (depthI === depthJ) continue;
          // 위치 기반 매칭: 3-Way 비교 (같은 type은 groupNodesByType에서 보장)
          if (this.isSamePosition3Way(nodes[i], nodes[j])) {
            groups.push([nodes[i], nodes[j]]);
          }
        }
      }
    }

    return groups;
  }

  // ============================================================
  // 3. 3-Way Position Comparison (NodeMatcher와 동일한 정규화)
  // ============================================================

  /**
   * NodeMatcher의 3-Way 비교를 cross-depth용으로 적용.
   * 각 노드를 자신의 variant root content box 기준으로 독립 정규화(0~1)한 뒤,
   * 좌/중/우(상/중/하) 3가지 기준점 중 최소 오차가 ≤ 0.1이면 같은 위치.
   *
   * NodeMatcher와의 차이: NodeMatcher는 절대 오프셋 차이를 avgSize로 나누지만,
   * cross-depth는 variant root 크기가 크게 다를 수 있으므로
   * 각자의 content box 기준으로 독립 정규화한다.
   */
  private isSamePosition3Way(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (!nodeA.parent || !nodeB.parent) return false;

    const boxA = this.getContentBoxInfo(nodeA);
    const boxB = this.getContentBoxInfo(nodeB);
    if (!boxA || !boxB) return false;
    if (boxA.contentWidth <= 0 || boxB.contentWidth <= 0) return false;
    if (boxA.contentHeight <= 0 || boxB.contentHeight <= 0) return false;

    // --- X축: 각자 content box 기준 독립 정규화 후 3-Way 비교 ---
    const offAx = boxA.nodeX - boxA.contentX;
    const offBx = boxB.nodeX - boxB.contentX;

    // 1) 좌정렬: 왼쪽 오프셋 비율
    const leftX = Math.abs(offAx / boxA.contentWidth - offBx / boxB.contentWidth);
    // 2) 가운데정렬: 중심 오프셋 비율
    const cenAx = (offAx + boxA.nodeWidth / 2) / boxA.contentWidth;
    const cenBx = (offBx + boxB.nodeWidth / 2) / boxB.contentWidth;
    const centerX = Math.abs(cenAx - cenBx);
    // 3) 우정렬: 오른쪽 여백 비율
    const rightAx = (boxA.contentWidth - offAx - boxA.nodeWidth) / boxA.contentWidth;
    const rightBx = (boxB.contentWidth - offBx - boxB.nodeWidth) / boxB.contentWidth;
    const rightX = Math.abs(rightAx - rightBx);

    const minDiffX = Math.min(leftX, centerX, rightX);

    // --- Y축: 각자 content box 기준 독립 정규화 후 3-Way 비교 ---
    const offAy = boxA.nodeY - boxA.contentY;
    const offBy = boxB.nodeY - boxB.contentY;

    // 1) 상단정렬
    const topY = Math.abs(offAy / boxA.contentHeight - offBy / boxB.contentHeight);
    // 2) 가운데정렬
    const midAy = (offAy + boxA.nodeHeight / 2) / boxA.contentHeight;
    const midBy = (offBy + boxB.nodeHeight / 2) / boxB.contentHeight;
    const middleY = Math.abs(midAy - midBy);
    // 3) 하단정렬
    const botAy = (boxA.contentHeight - offAy - boxA.nodeHeight) / boxA.contentHeight;
    const botBy = (boxB.contentHeight - offBy - boxB.nodeHeight) / boxB.contentHeight;
    const bottomY = Math.abs(botAy - botBy);

    const minDiffY = Math.min(topY, middleY, bottomY);

    return minDiffX <= 0.1 && minDiffY <= 0.1;
  }

  /**
   * 노드의 content box 정보 조회.
   * NodeMatcher.calcContentBoxForMergedNode과 동일한 로직.
   */
  private getContentBoxInfo(node: InternalNode): {
    nodeX: number;
    nodeY: number;
    nodeWidth: number;
    nodeHeight: number;
    contentX: number;
    contentY: number;
    contentWidth: number;
    contentHeight: number;
  } | null {
    if (!node.mergedNodes || node.mergedNodes.length === 0) return null;

    for (const merged of node.mergedNodes) {
      const result = this.calcContentBoxForMergedNode(merged.id);
      if (result) return result;
    }
    return null;
  }

  private calcContentBoxForMergedNode(nodeId: string): {
    nodeX: number;
    nodeY: number;
    nodeWidth: number;
    nodeHeight: number;
    contentX: number;
    contentY: number;
    contentWidth: number;
    contentHeight: number;
  } | null {
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;
    const { node: variantRoot } = this.dataManager.getById(variantRootId);
    if (!variantRoot) return null;

    const { node: originalNode } = this.dataManager.getById(nodeId);
    if (!originalNode) return null;

    const nodeBounds = (originalNode as any).absoluteBoundingBox as
      | BoundingBox
      | undefined;
    if (!nodeBounds) return null;

    const rootBounds = (variantRoot as any).absoluteBoundingBox as
      | BoundingBox
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

  // ============================================================
  // 4. Validation
  // ============================================================

  private isValidSquashGroup(
    group: [InternalNode, InternalNode]
  ): boolean {
    const [nodeA, nodeB] = group;

    if (this.isMasked(nodeA) || this.isMasked(nodeB)) return false;

    if (!this.isInstanceChildrenCompatible(nodeA, nodeB)) return false;

    if (this.hasParentWithMask(nodeA) || this.hasParentWithMask(nodeB))
      return false;

    if (this.isAncestorDescendant(nodeA, nodeB)) return false;

    return true;
  }

  private isMasked(node: InternalNode): boolean {
    const { node: orig } = this.dataManager.getById(node.id);
    return (orig as any)?.isMask === true;
  }

  /** 둘 다 INSTANCE 자식이거나 둘 다 아니어야 함 */
  private isInstanceChildrenCompatible(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    const isA = nodeA.id.startsWith(UpdateSquashByIou.INSTANCE_ID_PREFIX);
    const isB = nodeB.id.startsWith(UpdateSquashByIou.INSTANCE_ID_PREFIX);
    if (!isA && !isB) return true;
    return isA && isB;
  }

  /** 부모 체인에 mask가 있는지 (COMPONENT까지) */
  private hasParentWithMask(node: InternalNode): boolean {
    let parent = node.parent;
    while (parent) {
      const { node: orig } = this.dataManager.getById(parent.id);
      if ((orig as any)?.isMask === true) return true;
      if (parent.type === "COMPONENT") break;
      parent = parent.parent ?? null;
    }
    return false;
  }

  /** 조상-자손 관계 불가 */
  private isAncestorDescendant(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    let current: InternalNode | null | undefined = nodeB.parent;
    while (current) {
      if (current.id === nodeA.id) return true;
      current = current.parent;
    }
    current = nodeA.parent;
    while (current) {
      if (current.id === nodeB.id) return true;
      current = current.parent;
    }
    return false;
  }

  // ============================================================
  // 5. Sibling Graph (원본 variant tree에서 구축)
  // ============================================================

  private createSiblingGraph(variantTrees: InternalNode[]): SiblingGraph {
    const graph: SiblingGraph = new Map();

    for (const tree of variantTrees) {
      this.traverseWithMeta(tree, (node, _depth, index, parent) => {
        const key = `${node.type}|${node.id}`;
        if (!graph.has(key)) graph.set(key, []);

        const next = parent?.children[index + 1] ?? null;
        const prev = index > 0 ? (parent?.children[index - 1] ?? null) : null;
        if (next || prev) {
          graph.get(key)!.push({ next, prev });
        }
      });
    }

    return graph;
  }

  private traverseWithMeta(
    node: InternalNode,
    callback: (
      node: InternalNode,
      depth: number,
      index: number,
      parent: InternalNode | null
    ) => void,
    depth = 0,
    index = 0,
    parent: InternalNode | null = null
  ): void {
    callback(node, depth, index, parent);
    node.children.forEach((child, i) => {
      this.traverseWithMeta(child, callback, depth + 1, i, node);
    });
  }

  // ============================================================
  // 6. Topological Sort-based Squash (v1 충실 포팅)
  // ============================================================

  /**
   * 2단계 sibling 검증:
   * 1단계 next-only로 방향 결정. one-valid이면 바로 실행, both-invalid이면 스킵.
   * both-valid일 때만 2단계 next+prev 검증으로 tiebreak 시도.
   * 2단계에서도 결정 불가 시, mergedNodes 수 기반 폴백 (많은 쪽으로 합침).
   */
  private squashByTopoSort(
    mergedTree: InternalNode,
    nodeA: InternalNode,
    nodeB: InternalNode,
    siblingGraph: SiblingGraph
  ): void {
    // 1단계: next-only (기존 v1 로직)
    const canAtoB_next = this.validateSquashDirection(
      mergedTree,
      nodeB,
      nodeA,
      siblingGraph,
      false
    );
    const canBtoA_next = this.validateSquashDirection(
      mergedTree,
      nodeA,
      nodeB,
      siblingGraph,
      false
    );

    if (!canAtoB_next && !canBtoA_next) {
      // both-invalid stage1 → mergedNodes 수 기반 폴백
      this.squashByMergedNodeCount(nodeA, nodeB);
      return;
    }

    if (canAtoB_next !== canBtoA_next) {
      // one-valid → 바로 실행
      if (canAtoB_next) {
        this.performSquash(nodeB, nodeA);
      } else {
        this.performSquash(nodeA, nodeB);
      }
      return;
    }

    // 2단계: both-valid → next+prev로 tiebreak
    const canAtoB_full = this.validateSquashDirection(
      mergedTree,
      nodeB,
      nodeA,
      siblingGraph,
      true
    );
    const canBtoA_full = this.validateSquashDirection(
      mergedTree,
      nodeA,
      nodeB,
      siblingGraph,
      true
    );

    if (canAtoB_full && !canBtoA_full) {
      this.performSquash(nodeB, nodeA);
    } else if (!canAtoB_full && canBtoA_full) {
      this.performSquash(nodeA, nodeB);
    } else {
      // both-valid 또는 both-invalid stage2 → mergedNodes 수 기반 폴백
      // 양쪽 다 stage1에서 valid했으므로, mergedNodes가 많은 노드(주요 노드)로 합침
      this.squashByMergedNodeCount(nodeA, nodeB);
    }
  }

  /**
   * mergedNodes 수 기반 폴백 방향 결정.
   * mergedNodes가 많은 노드 = 더 많은 variant에서 참조 = 주요 노드.
   * 적은 쪽을 많은 쪽으로 합침. 동일하면 depth가 얕은 쪽을 target으로.
   */
  private squashByMergedNodeCount(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): void {
    const countA = nodeA.mergedNodes?.length ?? 0;
    const countB = nodeB.mergedNodes?.length ?? 0;

    if (countA > countB) {
      this.performSquash(nodeA, nodeB); // B를 A에 합침
    } else if (countB > countA) {
      this.performSquash(nodeB, nodeA); // A를 B에 합침
    } else {
      // mergedNodes 수도 같으면 depth가 얕은 쪽으로
      const depthA = this.getNodeDepth(nodeA);
      const depthB = this.getNodeDepth(nodeB);
      if (depthA <= depthB) {
        this.performSquash(nodeA, nodeB);
      } else {
        this.performSquash(nodeB, nodeA);
      }
    }
  }

  /**
   * deep clone해서 가상 squash 후 sibling 순서 검증.
   * checkPrev=false면 next만 검사 (1단계), true면 prev도 검사 (2단계).
   */
  private validateSquashDirection(
    mergedTree: InternalNode,
    targetNode: InternalNode,
    sourceNode: InternalNode,
    siblingGraph: SiblingGraph,
    checkPrev: boolean
  ): boolean {
    const clonedTree = this.deepCloneTree(mergedTree);
    const clonedTarget = this.findNodeById(clonedTree, targetNode.id);

    if (!clonedTarget) return false;

    clonedTarget.mergedNodes = [
      ...(targetNode.mergedNodes || []),
      ...(sourceNode.mergedNodes || []),
    ];

    return this.validateTopologicalOrder(clonedTarget, siblingGraph, checkPrev);
  }

  /**
   * target 노드부터 순회하며 모든 mergedNode의 sibling 순서 위반을 검사.
   * checkPrev가 validateTopologicalOrder → checkSiblingViolation으로 전달됨.
   */
  private validateTopologicalOrder(
    tree: InternalNode,
    siblingGraph: SiblingGraph,
    checkPrev: boolean
  ): boolean {
    let valid = true;

    const traverse = (node: InternalNode) => {
      if (!valid) return;
      for (const merged of node.mergedNodes || []) {
        if (this.checkSiblingViolation(node, merged, siblingGraph, checkPrev)) {
          valid = false;
          return;
        }
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree);
    return valid;
  }

  /**
   * 원본 sibling graph의 next/prev와 실제 sibling 비교.
   * checkPrev=false면 next만 검사 (1단계), true면 prev도 검사 (2단계 tiebreaker).
   */
  private checkSiblingViolation(
    node: InternalNode,
    merged: VariantOrigin,
    siblingGraph: SiblingGraph,
    checkPrev: boolean
  ): boolean {
    const key = this.buildNodeKeyById(merged.id);
    const entries = siblingGraph.get(key);
    if (!entries?.length) return false;

    const actualNext = this.getNextSibling(node);
    const actualPrev = checkPrev ? this.getPrevSibling(node) : null;

    for (const entry of entries) {
      // next는 항상 검사
      if (entry.next) {
        if (!actualNext) return true;
        if (this.getNodeType(entry.next.id) !== actualNext.type) return true;
      }
      // prev는 checkPrev=true일 때만 검사
      if (checkPrev && entry.prev) {
        if (!actualPrev) return true;
        if (this.getNodeType(entry.prev.id) !== actualPrev.type) return true;
      }
    }

    return false;
  }

  // ============================================================
  // 7. Helper: Deep Clone / Find / Sibling
  // ============================================================

  /**
   * v1 helper.deepCloneTree 충실 포팅:
   * parent 순환 참조 제외하고 전체 clone, parent 관계 복원
   */
  private deepCloneTree(tree: InternalNode): InternalNode {
    const clone = (
      node: InternalNode,
      parentNode: InternalNode | null = null
    ): InternalNode => {
      const clonedNode: InternalNode = {
        id: node.id,
        type: node.type,
        name: node.name,
        parent: parentNode,
        children: [],
        mergedNodes: node.mergedNodes
          ? node.mergedNodes.map((m) => ({ ...m }))
          : undefined,
        bounds: node.bounds ? { ...node.bounds } : undefined,
        ...(node.componentPropertyReferences
          ? { componentPropertyReferences: { ...node.componentPropertyReferences } }
          : {}),
        ...(node.componentId ? { componentId: node.componentId } : {}),
      };

      clonedNode.children = node.children.map((child) =>
        clone(child, clonedNode)
      );
      return clonedNode;
    };

    return clone(tree);
  }

  /** v1 helper.findNodeById 충실 포팅: BFS로 ID 검색 */
  private findNodeById(
    tree: InternalNode,
    id: string
  ): InternalNode | null {
    const queue: InternalNode[] = [tree];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.id === id) return node;
      queue.push(...node.children);
    }
    return null;
  }

  /** v1 helper.getNextSiblingNode 충실 포팅 */
  private getNextSibling(node: InternalNode): InternalNode | null {
    if (!node.parent) return null;
    const siblings = node.parent.children;
    const idx = siblings.indexOf(node);
    if (idx === -1 || idx >= siblings.length - 1) return null;
    return siblings[idx + 1];
  }

  private getPrevSibling(node: InternalNode): InternalNode | null {
    if (!node.parent) return null;
    const siblings = node.parent.children;
    const idx = siblings.indexOf(node);
    if (idx <= 0) return null;
    return siblings[idx - 1];
  }

  private getNodeDepth(node: InternalNode): number {
    let depth = 0;
    let current = node.parent;
    while (current) {
      depth++;
      current = current.parent ?? null;
    }
    return depth;
  }

  private buildNodeKeyById(id: string): string {
    const { node } = this.dataManager.getById(id);
    const type = (node as any)?.type || "UNKNOWN";
    return `${type}|${id}`;
  }

  private getNodeType(id: string): string {
    const { node } = this.dataManager.getById(id);
    return (node as any)?.type || "UNKNOWN";
  }

  // ============================================================
  // 8. Perform Squash
  // ============================================================

  /**
   * v1 performSquash 포팅:
   * - mergedNodes 합치기 (source 먼저, target 뒤)
   * - source를 merged tree에서 제거
   *
   * v2에서는 parent 참조가 깨져있으므로 (fixParentReferences를 적용하면
   * downstream에 부작용 발생), tree traversal로 ID 기반 제거.
   */
  private performSquash(
    targetNode: InternalNode,
    sourceNode: InternalNode
  ): void {
    targetNode.mergedNodes = [
      ...(sourceNode.mergedNodes || []),
      ...(targetNode.mergedNodes || []),
    ];

    this.removeNodeFromTree(this.mergedTreeRoot!, sourceNode.id);
  }

  /** merged tree 전체를 순회하며 특정 ID의 자식 노드를 제거 */
  private removeNodeFromTree(node: InternalNode, targetId: string): boolean {
    const idx = node.children.findIndex((child) => child.id === targetId);
    if (idx !== -1) {
      node.children.splice(idx, 1);
      return true;
    }
    for (const child of node.children) {
      if (this.removeNodeFromTree(child, targetId)) return true;
    }
    return false;
  }
}
