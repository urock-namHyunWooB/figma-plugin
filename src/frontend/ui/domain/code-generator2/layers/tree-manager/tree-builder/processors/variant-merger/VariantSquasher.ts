// Renamed from UpdateSquashByIou, see docs/superpowers/specs/2026-04-10-variant-merger-engine-consolidation-design.md
import { InternalNode, VariantOrigin } from "../../../../../types/types";
import DataManager from "../../../../data-manager/DataManager";
import { LayoutNormalizer } from "./LayoutNormalizer";

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
export class VariantSquasher {
  private static readonly INSTANCE_ID_PREFIX = "I";

  private readonly dataManager: DataManager;
  private readonly nodeToVariantRoot: Map<string, string>;
  private mergedTreeRoot: InternalNode | null = null;
  /** squash로 자식이 제거된 부모 노드 ID 추적 */
  private readonly affectedParentIds = new Set<string>();

  constructor(
    dataManager: DataManager,
    nodeToVariantRoot: Map<string, string>,
    private readonly layoutNormalizer: LayoutNormalizer
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

    // 개별 cross-depth squash
    for (;;) {
      const nodesByType = this.groupNodesByType(mergedTree);
      const squashGroups = this.findSquashGroups(nodesByType);
      const filtered = squashGroups.filter((g) => this.isValidSquashGroup(g));
      if (filtered.length === 0) break;
      const [nodeA, nodeB] = filtered[0];
      this.squashByTopoSort(mergedTree, nodeA, nodeB, siblingGraph);
    }

    // squash 후 빈 컨테이너 제거
    this.pruneEmptyContainers(mergedTree);

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
          // cross-depth만 squash 대상: 같은 depth의 노드는 variant 머지가 의도적으로 분리한 것
          const depthI = this.getNodeDepth(nodes[i]);
          const depthJ = this.getNodeDepth(nodes[j]);
          if (depthI === depthJ) continue;
          // 같은 variant에 동시 존재하면 같은 노드일 수 없음 → skip
          if (this.hasOverlappingVariants(nodes[i], nodes[j])) continue;
          // 크기가 크게 다르면 같은 노드가 아님 (컨테이너 vs 리프 오매칭 방지)
          if (!this.isSimilarSizeForSquash(nodes[i], nodes[j])) continue;
          // 위치 기반 매칭: 3-Way 비교 (같은 type은 groupNodesByType에서 보장, 이름 제약 없음)
          if (this.isSamePosition3Way(nodes[i], nodes[j])) {
            groups.push([nodes[i], nodes[j]]);
          }
        }
      }
    }

    return groups;
  }

  // ============================================================
  // 3. 3-Way Position Comparison (LayoutNormalizer 위임)
  // ============================================================

  /**
   * cross-depth squash용 위치 비교.
   * 각 노드를 자신의 variant root content box 기준으로 독립 정규화한 뒤,
   * LayoutNormalizer.compare()로 3-Way 최소 오차를 계산한다.
   *
   * NodeMatcher와의 차이: 직접 부모가 아닌 variant root를 reference로 사용.
   * cross-depth에서는 노드들의 직접 부모가 서로 다를 수 있으므로
   * 공통 기준인 variant root 기준으로 각자를 독립 정규화한다.
   */
  private isSamePosition3Way(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (!nodeA.mergedNodes?.[0] || !nodeB.mergedNodes?.[0]) return false;

    const variantRootIdA = this.nodeToVariantRoot.get(nodeA.mergedNodes[0].id);
    const variantRootIdB = this.nodeToVariantRoot.get(nodeB.mergedNodes[0].id);
    if (!variantRootIdA || !variantRootIdB) return false;

    const rootA = this.dataManager.getById(variantRootIdA)?.node;
    const rootB = this.dataManager.getById(variantRootIdB)?.node;
    const origA = this.dataManager.getById(nodeA.mergedNodes[0].id)?.node;
    const origB = this.dataManager.getById(nodeB.mergedNodes[0].id)?.node;

    if (!rootA || !rootB || !origA || !origB) return false;

    const posA = this.layoutNormalizer.normalize(rootA, origA);
    const posB = this.layoutNormalizer.normalize(rootB, origB);
    if (!posA || !posB) return false;

    return this.layoutNormalizer.compare(posA, posB) <= 0.1;
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
    const isA = nodeA.id.startsWith(VariantSquasher.INSTANCE_ID_PREFIX);
    const isB = nodeB.id.startsWith(VariantSquasher.INSTANCE_ID_PREFIX);
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
    // mergedNodes 수가 크게 차이나면 sibling 검증 스킵.
    // 소수파는 sibling 제약이 느슨해서 검증을 쉽게 통과하므로,
    // 다수파를 소수파로 합치는 잘못된 방향이 선택될 수 있다.
    const countA = nodeA.mergedNodes?.length ?? 0;
    const countB = nodeB.mergedNodes?.length ?? 0;
    const minCount = Math.min(countA, countB);
    const maxCount = Math.max(countA, countB);
    if (maxCount >= 3 * minCount) {
      this.squashByMergedNodeCount(nodeA, nodeB);
      return;
    }

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
        ...((node as any).componentId ? { componentId: (node as any).componentId } : {}),
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

  /**
   * 두 노드의 부모가 같은 자식 타입 시퀀스를 갖는지 확인.
   * 예: 부모A의 children이 [TEXT, FRAME]이고 부모B도 [TEXT, FRAME]이면 true.
   * TEXT처럼 이름이 다르지만 같은 구조적 위치에 있는 노드를 squash 허용하는 데 사용.
   */
  private hasSameParentStructure(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (!nodeA.parent || !nodeB.parent) return false;
    const typesA = nodeA.parent.children.map((c) => c.type);
    const typesB = nodeB.parent.children.map((c) => c.type);
    if (typesA.length !== typesB.length) return false;
    return typesA.every((t, i) => t === typesB[i]);
  }

  /**
   * squash용 크기 유사성 검사.
   * cross-depth squash에서 컨테이너와 리프 노드의 오매칭을 방지.
   * NodeMatcher보다 느슨한 threshold (2.0) 사용.
   *
   * relWidth/relHeight (variant root content box 기준 상대 크기)를 비교.
   * 두 노드의 root 크기가 다를 수 있으므로 ratio 비교로 normalize.
   */
  private isSimilarSizeForSquash(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (!nodeA.mergedNodes?.[0] || !nodeB.mergedNodes?.[0]) return true;

    const variantRootIdA = this.nodeToVariantRoot.get(nodeA.mergedNodes[0].id);
    const variantRootIdB = this.nodeToVariantRoot.get(nodeB.mergedNodes[0].id);
    if (!variantRootIdA || !variantRootIdB) return true;

    const rootA = this.dataManager.getById(variantRootIdA)?.node;
    const rootB = this.dataManager.getById(variantRootIdB)?.node;
    const origA = this.dataManager.getById(nodeA.mergedNodes[0].id)?.node;
    const origB = this.dataManager.getById(nodeB.mergedNodes[0].id)?.node;

    if (!rootA || !rootB || !origA || !origB) return true;

    const posA = this.layoutNormalizer.normalize(rootA, origA);
    const posB = this.layoutNormalizer.normalize(rootB, origB);
    if (!posA || !posB) return true;

    const minW = Math.min(posA.relWidth, posB.relWidth);
    const minH = Math.min(posA.relHeight, posB.relHeight);
    if (minW <= 0 || minH <= 0) return true;

    const wRatio = Math.max(posA.relWidth, posB.relWidth) / minW;
    const hRatio = Math.max(posA.relHeight, posB.relHeight) / minH;
    return wRatio <= 2.0 && hRatio <= 2.0;
  }

  /**
   * 두 노드가 같은 variant에 동시 존재하는지 확인.
   * 같은 variant에 있으면 "같은 노드"일 수 없으므로 squash 불가.
   */
  private hasOverlappingVariants(
    nodeA: InternalNode,
    nodeB: InternalNode
  ): boolean {
    if (!nodeA.mergedNodes || !nodeB.mergedNodes) return false;
    const variantsA = new Set(nodeA.mergedNodes.map((m) => m.variantName));
    for (const m of nodeB.mergedNodes) {
      if (variantsA.has(m.variantName)) return true;
    }
    return false;
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

    // source의 children을 target으로 병합 (내용물도 함께 옮기기)
    this.mergeChildrenInto(targetNode, sourceNode);

    this.removeNodeFromTree(this.mergedTreeRoot!, sourceNode.id);
  }

  /**
   * source의 children을 target으로 재귀 병합.
   * type+name이 일치하면 mergedNodes + children 재귀 병합,
   * 일치하는 게 없으면 새 자식으로 추가.
   */
  private mergeChildrenInto(
    target: InternalNode,
    source: InternalNode
  ): void {
    const usedIndices = new Set<number>();

    for (const srcChild of source.children) {
      // type + 위치 기반 매칭 (이름은 variant마다 다를 수 있음)
      const matchIdx = target.children.findIndex(
        (tgtChild, idx) =>
          !usedIndices.has(idx) &&
          tgtChild.type === srcChild.type &&
          this.isSamePosition3Way(tgtChild, srcChild)
      );

      if (matchIdx !== -1) {
        usedIndices.add(matchIdx);
        target.children[matchIdx].mergedNodes = [
          ...(srcChild.mergedNodes || []),
          ...(target.children[matchIdx].mergedNodes || []),
        ];
        this.mergeChildrenInto(target.children[matchIdx], srcChild);
      } else {
        srcChild.parent = target;
        target.children.push(srcChild);
      }
    }
  }

  /**
   * squash로 자식이 모두 빠져나간 빈 컨테이너만 재귀적으로 제거.
   * affectedParentIds에 있는 노드만 대상 — 원래 children이 없던 leaf FRAME은 보존.
   */
  private pruneEmptyContainers(node: InternalNode): void {
    // 자식부터 재귀 (bottom-up)
    for (const child of [...node.children]) {
      this.pruneEmptyContainers(child);
    }

    // squash로 자식이 제거된 부모 중 빈 컨테이너만 제거
    node.children = node.children.filter((child) => {
      if (child.children.length > 0) return true;
      // squash 영향을 받지 않은 노드는 무조건 유지
      if (!this.affectedParentIds.has(child.id)) return true;
      // 제거 전: wrapper의 레이아웃 속성을 부모에 기록
      this.recordLayoutOverride(node, child);
      // squash로 비워진 컨테이너 → 제거
      return false;
    });
  }

  /**
   * 제거되는 wrapper의 레이아웃 속성을 부모 노드에 기록.
   * wrapper가 prune되면 부모의 원본 레이아웃 속성이 stale하므로,
   * 스타일 프로세서가 해당 variant의 레이아웃을 교정할 수 있도록 함.
   */
  private recordLayoutOverride(
    parent: InternalNode,
    prunedChild: InternalNode
  ): void {
    if (!prunedChild.mergedNodes?.length) return;

    for (const merged of prunedChild.mergedNodes) {
      const { node: origNode } = this.dataManager.getById(merged.id);
      if (!origNode) continue;
      const raw = origNode as any;
      if (!raw.layoutMode) continue;

      const css: Record<string, string> = {};

      // flex-direction
      css["flex-direction"] = raw.layoutMode === "HORIZONTAL" ? "row" : "column";

      // gap
      if (raw.itemSpacing) {
        css["gap"] = `${raw.itemSpacing}px`;
      }

      // padding
      const pt = raw.paddingTop ?? 0;
      const pr = raw.paddingRight ?? 0;
      const pb = raw.paddingBottom ?? 0;
      const pl = raw.paddingLeft ?? 0;
      if (pt || pr || pb || pl) {
        css["padding"] = `${pt}px ${pr}px ${pb}px ${pl}px`;
      }

      // justify-content
      const justifyMap: Record<string, string> = {
        MIN: "flex-start",
        CENTER: "center",
        MAX: "flex-end",
        SPACE_BETWEEN: "space-between",
      };
      if (raw.primaryAxisAlignItems && justifyMap[raw.primaryAxisAlignItems]) {
        css["justify-content"] = justifyMap[raw.primaryAxisAlignItems];
      }

      // align-items
      const alignMap: Record<string, string> = {
        MIN: "flex-start",
        CENTER: "center",
        MAX: "flex-end",
        STRETCH: "stretch",
        BASELINE: "baseline",
      };
      if (raw.counterAxisAlignItems && alignMap[raw.counterAxisAlignItems]) {
        css["align-items"] = alignMap[raw.counterAxisAlignItems];
      }

      // flex-wrap
      if (raw.layoutWrap === "WRAP") {
        css["flex-wrap"] = "wrap";
      }

      if (!parent.metadata) parent.metadata = {};
      if (!parent.metadata.layoutOverrides)
        parent.metadata.layoutOverrides = {};
      if (merged.variantName) {
        parent.metadata.layoutOverrides[merged.variantName] = css;
      }
    }
  }

  /** merged tree 전체를 순회하며 특정 ID의 자식 노드를 제거 */
  private removeNodeFromTree(node: InternalNode, targetId: string): boolean {
    const idx = node.children.findIndex((child) => child.id === targetId);
    if (idx !== -1) {
      node.children.splice(idx, 1);
      this.affectedParentIds.add(node.id);
      return true;
    }
    for (const child of node.children) {
      if (this.removeNodeFromTree(child, targetId)) return true;
    }
    return false;
  }
}
