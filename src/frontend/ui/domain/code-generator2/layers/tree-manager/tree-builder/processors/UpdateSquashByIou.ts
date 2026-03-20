import { InternalNode, VariantOrigin } from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

type Rect = { x1: number; y1: number; x2: number; y2: number };
type BoundingBox = { x: number; y: number; width: number; height: number };
type SiblingEntry = { next: InternalNode | null; prev: InternalNode | null };
type SiblingGraph = Map<string, SiblingEntry[]>;

/**
 * IoU 기반 post-merge squash
 *
 * v1 UpdateSquashByIou 충실 포팅.
 * 머지 후 같은 타입의 노드가 서로 다른 depth에 남아 있을 때,
 * variant root 기준 IoU ≥ 0.5이면 하나로 합침.
 *
 * 핵심 알고리즘 (v1 동일):
 * 1. groupNodesByType: BFS로 타입별 그룹핑
 * 2. findSquashGroups: IoU ≥ 0.5 + 같은 이름인 후보 찾기
 * 3. isValidSquashGroup: mask, instance children, ancestor-descendant 검증
 * 4. squashByTopoSort: deep clone으로 양방향 검증, 한쪽만 valid하면 실행
 * 5. performSquash: mergedNodes 합치기 + source 제거
 */
export class UpdateSquashByIou {
  private static readonly IOU_THRESHOLD = 0.5;
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
   * 진입점: merged tree에 대해 IoU 기반 squash 실행
   */
  public execute(
    mergedTree: InternalNode,
    variantTrees: InternalNode[]
  ): InternalNode {
    this.mergedTreeRoot = mergedTree;
    const nodesByType = this.groupNodesByType(mergedTree);
    const squashGroups = this.findSquashGroups(nodesByType);
    const filteredGroups = squashGroups.filter((group) =>
      this.isValidSquashGroup(group)
    );
    const siblingGraph = this.createSiblingGraph(variantTrees);
    for (const [nodeA, nodeB] of filteredGroups) {
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
          // 같은 이름인 경우만 squash 후보 (다른 역할의 노드 방지)
          if (nodes[i].name !== nodes[j].name) continue;
          // cross-depth만 squash 대상: 같은 depth의 노드는 variant 머지가 의도적으로 분리한 것
          const depthI = this.getNodeDepth(nodes[i]);
          const depthJ = this.getNodeDepth(nodes[j]);
          if (depthI === depthJ) continue;
          // variant 겹침 확인: 겹치는 variant가 없으면 다른 맥락의 노드 → squash 방지
          if (!this.hasVariantOverlap(nodes[i], nodes[j])) continue;
          const iou = this.getIou2(nodes[i], nodes[j]);
          if (iou !== null && iou >= UpdateSquashByIou.IOU_THRESHOLD) {
            groups.push([nodes[i], nodes[j]]);
          }
        }
      }
    }

    return groups;
  }

  /**
   * 두 노드의 mergedNodes에 겹치는 variant가 있는지 확인
   * 겹침이 없으면 서로 다른 variant 그룹에 속하므로 squash 부적합
   */
  private hasVariantOverlap(nodeA: InternalNode, nodeB: InternalNode): boolean {
    const variantsA = new Set(
      (nodeA.mergedNodes || []).map((m) => m.variantName || m.name)
    );
    for (const m of nodeB.mergedNodes || []) {
      if (variantsA.has(m.variantName || m.name)) return true;
    }
    return false;
  }

  // ============================================================
  // 3. IoU Calculation (각 노드를 자기 variant root 기준 정규화)
  // ============================================================

  /**
   * v1의 getIou2 포팅
   * 핵심: 각 노드를 자신의 원본 variant root 기준으로 정규화
   * (v1에서 parent 참조가 업데이트되지 않아 자연스럽게 이렇게 동작)
   */
  private getIou2(nodeA: InternalNode, nodeB: InternalNode): number | null {
    if (!nodeA.parent || !nodeB.parent) return null;

    const rootBoundsA = this.getVariantRootBounds(nodeA);
    const rootBoundsB = this.getVariantRootBounds(nodeB);
    if (!rootBoundsA || !rootBoundsB) return null;

    const boundsA = this.getOriginalBounds(nodeA);
    const boundsB = this.getOriginalBounds(nodeB);
    if (!boundsA || !boundsB) return null;

    if (rootBoundsA.width === 0 || rootBoundsA.height === 0) return null;
    if (rootBoundsB.width === 0 || rootBoundsB.height === 0) return null;

    const rectA: Rect = {
      x1: (boundsA.x - rootBoundsA.x) / rootBoundsA.width,
      y1: (boundsA.y - rootBoundsA.y) / rootBoundsA.height,
      x2:
        (boundsA.x + boundsA.width - rootBoundsA.x) / rootBoundsA.width,
      y2:
        (boundsA.y + boundsA.height - rootBoundsA.y) / rootBoundsA.height,
    };

    const rectB: Rect = {
      x1: (boundsB.x - rootBoundsB.x) / rootBoundsB.width,
      y1: (boundsB.y - rootBoundsB.y) / rootBoundsB.height,
      x2:
        (boundsB.x + boundsB.width - rootBoundsB.x) / rootBoundsB.width,
      y2:
        (boundsB.y + boundsB.height - rootBoundsB.y) / rootBoundsB.height,
    };

    return this.calculateIoU(rectA, rectB);
  }

  private getOriginalBounds(node: InternalNode): BoundingBox | null {
    if (!node.mergedNodes || node.mergedNodes.length === 0) return null;
    const { node: orig } = this.dataManager.getById(node.mergedNodes[0].id);
    return (orig?.absoluteBoundingBox as BoundingBox) ?? null;
  }

  private getVariantRootBounds(node: InternalNode): BoundingBox | null {
    if (!node.mergedNodes || node.mergedNodes.length === 0) return null;
    const variantRootId = this.nodeToVariantRoot.get(
      node.mergedNodes[0].id
    );
    if (!variantRootId) return null;
    const { node: rootNode } = this.dataManager.getById(variantRootId);
    return (rootNode?.absoluteBoundingBox as BoundingBox) ?? null;
  }

  private calculateIoU(a: Rect, b: Rect): number {
    const ix1 = Math.max(a.x1, b.x1);
    const iy1 = Math.max(a.y1, b.y1);
    const ix2 = Math.min(a.x2, b.x2);
    const iy2 = Math.min(a.y2, b.y2);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;

    const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
    const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
    const union = areaA + areaB - inter;
    return union <= 0 ? 0 : inter / union;
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

    if (!canAtoB_next && !canBtoA_next) return; // both-invalid

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
    }
    // 여전히 both-valid 또는 both-invalid → 스킵
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
