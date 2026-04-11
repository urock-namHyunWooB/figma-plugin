import {
  InternalTree,
  InternalNode,
  VariantGraph,
  PropDiffInfo,
} from "../../../../../types/types";
import type { DesignPattern } from "../../../../../types/types";
import DataManager from "../../../../data-manager/DataManager";
import { NodeMatcher } from "./NodeMatcher";
import { LayoutNormalizer } from "./LayoutNormalizer";
import { VariantGraphBuilder } from "./VariantGraphBuilder";
import { VariantSquasher } from "./VariantSquasher";
import { NodePresenceScanner } from "./NodePresenceScanner";
import type { MatchDecision } from "./match-engine/MatchSignal";

/**
 * VariantMerger
 *
 * 여러 variant를 하나의 InternalTree로 병합하는 오케스트레이터
 *
 * 고수준 파이프라인:
 * 1. 준비: nodeToVariantRoot 매핑
 * 2. 그래프: variant 그래프 구축 및 순서 결정
 * 3. 병합: 순서대로 트리 병합
 * 4. 정렬: children x 좌표 정렬
 * 5. 완료: 루트 이름 설정
 */
export class VariantMerger {
  private readonly dataManager: DataManager;
  private readonly graphBuilder: VariantGraphBuilder;

  /** 노드 ID → 원본 variant 루트 ID 매핑 */
  private _nodeToVariantRoot: Map<string, string> = new Map();

  /** nodeToVariantRoot 읽기 전용 접근 */
  get nodeToVariantRoot(): Map<string, string> {
    return this._nodeToVariantRoot;
  }

  /** 노드 매칭 로직 (병합 시점에 생성) */
  private nodeMatcher?: NodeMatcher;

  /** 레이아웃 정규화 (Task 4에서 VariantSquasher에도 전달) */
  private layoutNormalizer?: LayoutNormalizer;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.graphBuilder = new VariantGraphBuilder();
  }

  /**
   * 파이프라인 진입점
   */
  public merge(document: SceneNode, patterns?: DesignPattern[]): InternalTree {
    let tree: InternalTree;

    if (document.type === "COMPONENT_SET") {
      const children = (document as any).children as SceneNode[] | undefined;

      if (!children || children.length === 0) {
        tree = this.convertToInternalTree(document);
      } else {
        tree = this.mergeVariants(document, children);
      }
    } else {
      tree = this.convertToInternalTree(document);
    }

    if (patterns && patterns.length > 0) {
      this.applyPatternAnnotations(tree, patterns);
    }

    return tree;
  }

  /**
   * COMPONENT_SET의 여러 variant 병합 (고수준 흐름)
   */
  private mergeVariants(
    document: SceneNode,
    variants: SceneNode[]
  ): InternalTree {
    // 1. 준비: nodeToVariantRoot 매핑 + 노드 presence 스캔
    this.prepareVariantMapping(variants);
    const presence = new NodePresenceScanner().scan(variants as any);
    this.nodeMatcher!.setNodePresence(presence);

    // 2. 그래프: variant 그래프 구축 및 순서 결정
    const { graph, mergeOrder } = this.buildGraphAndOrder(variants);

    // 3. 병합: 순서대로 트리 병합
    const merged = this.mergeTreesInOrder(graph, mergeOrder);

    // 3.5. IoU 기반 cross-depth squash (v1 VariantSquasher 포팅)
    const squasher = new VariantSquasher(
      this.dataManager,
      this.nodeToVariantRoot,
      this.layoutNormalizer!
    );
    const variantTrees = graph.nodes.map((n) => n.tree);
    squasher.execute(merged, variantTrees);

    // 4. 정렬: children x 좌표 정렬
    this.sortChildrenByPosition(merged);

    // 5. 완료: 루트 이름 설정
    merged.name = document.name;

    return merged;
  }

  // ===========================================================================
  // Private: 1단계 - 준비
  // ===========================================================================

  /**
   * 노드 ID → variant 루트 매핑 구축
   */
  private prepareVariantMapping(variants: SceneNode[]): void {
    this.nodeToVariantRoot.clear();

    const traverse = (node: SceneNode, variantRootId: string) => {
      this.nodeToVariantRoot.set(node.id, variantRootId);
      const children = (node as any).children as SceneNode[] | undefined;
      if (children) {
        for (const child of children) {
          traverse(child, variantRootId);
        }
      }
    };

    for (const variant of variants) {
      traverse(variant, variant.id);
    }

    // NodeMatcher 생성
    this.layoutNormalizer = new LayoutNormalizer(this.dataManager);
    this.nodeMatcher = new NodeMatcher(
      this.dataManager,
      this.nodeToVariantRoot,
      this.layoutNormalizer
    );
  }

  // ===========================================================================
  // Private: 2단계 - 그래프
  // ===========================================================================

  /**
   * Variant 그래프 구축 및 병합 순서 결정
   */
  private buildGraphAndOrder(variants: SceneNode[]): {
    graph: VariantGraph;
    mergeOrder: number[];
  } {
    // 각 variant를 InternalTree로 변환
    const trees = variants.map((variant) =>
      this.convertToInternalTree(variant, variant.name)
    );

    // 그래프 구축
    const graph = this.graphBuilder.buildGraph(variants, trees);

    // 병합 순서 결정
    const mergeOrder = this.graphBuilder.determineMergeOrder(graph);

    return { graph, mergeOrder };
  }

  // ===========================================================================
  // Private: 3단계 - 병합
  // ===========================================================================

  /**
   * 병합 순서에 따라 트리들을 순차적으로 병합
   */
  private mergeTreesInOrder(
    graph: VariantGraph,
    mergeOrder: number[]
  ): InternalTree {
    let merged = graph.nodes[mergeOrder[0]].tree;
    let prevProps = graph.nodes[mergeOrder[0]].props;

    // Observer: merge 순서 기록
    const obs = this.observer;
    if (obs) {
      for (const idx of mergeOrder) {
        obs.mergeOrder.push(graph.nodes[idx].variantName);
      }
    }

    for (let i = 1; i < mergeOrder.length; i++) {
      // Observer: 현재 merge의 variant pair 설정 (root-level mergeChildren이 읽음)
      if (obs) {
        obs._variantA = i === 1
          ? graph.nodes[mergeOrder[0]].variantName
          : "(merged)";
        obs._variantB = graph.nodes[mergeOrder[i]].variantName;
      }
      const currentProps = graph.nodes[mergeOrder[i]].props;
      const nextTree = graph.nodes[mergeOrder[i]].tree;

      const propDiff = this.calculatePropDiff(prevProps, currentProps);
      merged = this.mergeTwoTrees(merged, nextTree, propDiff);

      prevProps = currentProps;
    }

    return merged;
  }

  /**
   * 두 props의 차이 계산
   */
  private calculatePropDiff(
    propsA: Record<string, string>,
    propsB: Record<string, string>
  ): PropDiffInfo {
    const keysA = Object.keys(propsA);
    const keysB = Object.keys(propsB);
    const allKeys = new Set([...keysA, ...keysB]);
    const diffs: string[] = [];

    for (const key of allKeys) {
      if (propsA[key] !== propsB[key]) {
        diffs.push(key);
      }
    }

    return {
      diffCount: diffs.length,
      diffPropName: diffs.length === 1 ? diffs[0] : undefined,
    };
  }

  /**
   * 두 InternalTree 병합
   */
  private mergeTwoTrees(
    treeA: InternalTree,
    treeB: InternalTree,
    propDiff: PropDiffInfo
  ): InternalTree {
    return {
      ...treeA,
      mergedNodes: [...(treeA.mergedNodes || []), ...(treeB.mergedNodes || [])],
      children: this.mergeChildren(treeA.children, treeB.children, propDiff),
    };
  }

  /**
   * children 배열 병합 (2-Pass + Hungarian)
   *
   * Pass 1: 확정 매칭 (같은 ID, 같은 이름+타입 유일 쌍)
   * Pass 2: 나머지를 Hungarian algorithm으로 최적 매칭
   */
  private mergeChildren(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo,
    _obsParentName?: string,   // observer용: 부모 노드 이름
    _obsDepth?: number,        // observer용: 재귀 깊이
  ): InternalNode[] {
    const obs = this.observer;
    const depth = _obsDepth ?? 0;
    const parentName = _obsParentName ?? "ROOT";

    // Observer: merge 시작
    if (obs) {
      obs.pushMerge({
        path: parentName,
        depth,
        childrenACount: childrenA.length,
        childrenBCount: childrenB.length,
        variantA: depth === 0 ? obs._variantA : undefined,
        variantB: depth === 0 ? obs._variantB : undefined,
      });
    }

    const merged: InternalNode[] = [...childrenA];
    const usedA = new Set<number>();
    const usedB = new Set<number>();

    // === Pass 1: 확정 매칭 ===
    for (let bi = 0; bi < childrenB.length; bi++) {
      if (usedB.has(bi)) continue;
      for (let ai = 0; ai < merged.length; ai++) {
        if (usedA.has(ai)) continue;
        if (this.nodeMatcher!.isDefiniteMatch(merged[ai], childrenB[bi])) {
          usedA.add(ai);
          usedB.add(bi);

          // Observer: Pass 1 매칭 기록
          if (obs) {
            obs.addPass1Match({
              aNode: this.nodeInfo(merged[ai]),
              bNode: this.nodeInfo(childrenB[bi]),
              reason: "same id",
            });
          }

          merged[ai] = this.mergeMatchedNodes(
            merged[ai], childrenB[bi], propDiff, depth,
          );
          break;
        }
      }
    }

    // === Pass 2: Hungarian algorithm으로 최적 매칭 ===
    const freeA = merged.map((_, i) => i).filter(i => !usedA.has(i));
    const freeB = childrenB.map((_, i) => i).filter(i => !usedB.has(i));

    if (freeA.length > 0 && freeB.length > 0) {
      const costMatrix: number[][] = [];
      // Observer: cell-level signal 분해를 위한 decision 캐시
      const decisions: MatchDecision[][] | undefined = obs ? [] : undefined;

      for (const bi of freeB) {
        const row: number[] = [];
        const decRow: MatchDecision[] | undefined = obs ? [] : undefined;
        for (const ai of freeA) {
          if (obs) {
            const dec = this.nodeMatcher!.getDecision(merged[ai], childrenB[bi]);
            row.push(dec.totalCost);
            decRow!.push(dec);
          } else {
            row.push(this.nodeMatcher!.getPositionCost(merged[ai], childrenB[bi]));
          }
        }
        costMatrix.push(row);
        if (decisions) decisions.push(decRow!);
      }

      // Hungarian algorithm 실행
      const assignment = this.hungarian(costMatrix);

      // Observer: Pass 2 데이터 수집
      if (obs && decisions) {
        const freeANodes = freeA.map(ai => this.nodeInfo(merged[ai]));
        const freeBNodes = freeB.map(bi => this.nodeInfo(childrenB[bi]));

        const matrixData = decisions.map((decRow, ri) =>
          decRow.map((dec, ci) => ({
            aIndex: ci,
            bIndex: ri,
            aNode: freeANodes[ci],
            bNode: freeBNodes[ri],
            cost: dec.totalCost,
            decision: dec.decision,
            signals: dec.signalResults.map(sr => ({
              signalName: sr.signalName,
              kind: sr.result.kind,
              cost: "cost" in sr.result ? (sr.result as any).cost : undefined,
              score: "score" in sr.result ? (sr.result as any).score : undefined,
              reason: sr.result.reason,
              weight: sr.weight,
            })),
          })),
        );

        const assignmentEntries = assignment
          .map((ci, ri) => {
            if (ci === -1) return null;
            const cost = costMatrix[ri][ci];
            return {
              aNode: freeANodes[ci],
              bNode: freeBNodes[ri],
              cost,
              accepted: cost <= 0.1,
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        const unmatchedBIndices = new Set(
          freeB.map((_, i) => i),
        );
        for (let ri = 0; ri < assignment.length; ri++) {
          const ci = assignment[ri];
          if (ci !== -1 && costMatrix[ri][ci] <= 0.1) {
            unmatchedBIndices.delete(ri);
          }
        }

        obs.setPass2({
          freeA: freeANodes,
          freeB: freeBNodes,
          matrix: matrixData,
          assignment: assignmentEntries,
          unmatched: [...unmatchedBIndices].map(ri => freeBNodes[ri]),
        });
      }

      // 기존 assignment 적용 로직 (변경 없음)
      for (let ri = 0; ri < assignment.length; ri++) {
        const ci = assignment[ri];
        if (ci === -1) continue;
        const cost = costMatrix[ri][ci];
        if (cost > 0.1) continue;

        const ai = freeA[ci];
        const bi = freeB[ri];
        usedA.add(ai);
        usedB.add(bi);
        merged[ai] = this.mergeMatchedNodes(
          merged[ai], childrenB[bi], propDiff, depth,
        );
      }
    }

    // 매칭되지 않은 B 노드를 끝에 추가
    for (let bi = 0; bi < childrenB.length; bi++) {
      if (!usedB.has(bi)) {
        merged.push(childrenB[bi]);
      }
    }

    // Observer: merge 종료
    if (obs) {
      obs.popMerge();
    }

    return merged;
  }

  /**
   * 매칭된 두 노드를 병합 (mergedNodes 합침 + children 재귀)
   */
  private mergeMatchedNodes(
    nodeA: InternalNode,
    nodeB: InternalNode,
    propDiff: PropDiffInfo,
    parentDepth?: number,
  ): InternalNode {
    return {
      ...nodeA,
      mergedNodes: [
        ...(nodeA.mergedNodes || []),
        ...(nodeB.mergedNodes || []),
      ],
      children: this.mergeChildren(
        nodeA.children,
        nodeB.children,
        propDiff,
        nodeA.name,                       // observer: 부모 이름
        (parentDepth ?? 0) + 1,           // observer: depth 증가
      ),
    };
  }

  /**
   * Hungarian algorithm (Munkres assignment)
   * 비용 행렬(rows × cols)에서 총 비용 최소인 행→열 매핑 반환
   * 반환: assignment[row] = col (매칭 없으면 -1)
   */
  private hungarian(costMatrix: number[][]): number[] {
    const rows = costMatrix.length;
    const cols = costMatrix[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return [];

    // 정방 행렬로 패딩 (Infinity로 채움)
    const n = Math.max(rows, cols);
    const C: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        i < rows && j < cols ? costMatrix[i][j] : 0
      )
    );

    // Infinity를 큰 유한값으로 대체
    const BIG = 1e9;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!isFinite(C[i][j])) C[i][j] = BIG;
      }
    }

    // u[i], v[j]: 잠재력(potential)
    const u = new Float64Array(n + 1);
    const v = new Float64Array(n + 1);
    // p[j]: 열 j에 할당된 행 (0-indexed, -1이면 미할당)
    const p = new Int32Array(n + 1).fill(-1);
    // way[j]: 최단 경로에서 열 j의 이전 열
    const way = new Int32Array(n + 1);

    for (let i = 0; i < n; i++) {
      // 새 행 i를 할당
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(n + 1).fill(Infinity);
      const used = new Uint8Array(n + 1);

      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity;
        let j1 = -1;

        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = C[i0][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }

        for (let j = 0; j <= n; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }

        j0 = j1;
      } while (p[j0] !== -1);

      // 경로 역추적으로 할당 갱신
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    // 결과: 원래 행(rows) × 원래 열(cols) 범위만 반환
    const result = new Array<number>(rows).fill(-1);
    for (let j = 1; j <= n; j++) {
      if (p[j] < rows && j - 1 < cols) {
        result[p[j]] = j - 1;
      }
    }
    return result;
  }

  // ===========================================================================
  // Private: 4단계 - 정렬
  // ===========================================================================

  /**
   * Children을 정규화된 x 좌표로 정렬 (재귀)
   */
  private sortChildrenByPosition(node: InternalNode): void {
    node.children.sort((a, b) => {
      const aX = this.getAverageNormalizedX(a);
      const bX = this.getAverageNormalizedX(b);
      return aX - bX;
    });

    for (const child of node.children) {
      this.sortChildrenByPosition(child);
    }
  }

  /**
   * 노드의 평균 정규화된 x 좌표 계산
   */
  private getAverageNormalizedX(node: InternalNode): number {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return 0;
    }

    let totalNormalizedX = 0;
    let count = 0;

    for (const merged of node.mergedNodes) {
      const normalizedX = this.getNormalizedX(merged.id);
      if (normalizedX !== null) {
        totalNormalizedX += normalizedX;
        count++;
      }
    }

    return count > 0 ? totalNormalizedX / count : 0;
  }

  /**
   * 노드 ID의 정규화된 x 좌표 계산
   */
  private getNormalizedX(nodeId: string): number | null {
    const { node: originalNode } = this.dataManager.getById(nodeId);
    const nodeBounds = originalNode?.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!nodeBounds) return null;

    // 원본 variant 루트 찾기
    const variantRootId = this.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;

    const { node: variantRoot } = this.dataManager.getById(variantRootId);
    const rootBounds = variantRoot?.absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!rootBounds || rootBounds.width === 0) return null;

    return (nodeBounds.x - rootBounds.x) / rootBounds.width;
  }

  // ===========================================================================
  // Private: SceneNode → InternalTree 변환
  // ===========================================================================

  /**
   * SceneNode → InternalTree 변환
   */
  private convertToInternalTree(
    node: SceneNode,
    variantName?: string
  ): InternalTree {
    const children = (node as any).children as SceneNode[] | undefined;
    const bounds = (node as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    const componentPropertyReferences = (node as any)
      .componentPropertyReferences as Record<string, string> | undefined;

    // 루트 노드 생성 (children은 나중에 설정)
    const rootNode: InternalTree = {
      id: node.id,
      type: node.type,
      name: node.name,
      parent: null,
      children: [],
      mergedNodes: [
        {
          id: node.id,
          name: node.name,
          variantName: variantName || node.name,
        },
      ],
      bounds,
      ...(componentPropertyReferences ? { componentPropertyReferences } : {}),
    };

    // children 생성 시 rootNode를 parent로 전달
    if (children) {
      rootNode.children = children.map((child) =>
        this.convertToInternalNode(child, variantName, rootNode)
      );
    }

    return rootNode;
  }

  /**
   * SceneNode → InternalNode 변환 (재귀)
   */
  private convertToInternalNode(
    node: SceneNode,
    variantName?: string,
    parent?: InternalNode
  ): InternalNode {
    const children = (node as any).children as SceneNode[] | undefined;
    const bounds = (node as any).absoluteBoundingBox as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    const componentPropertyReferences = (node as any)
      .componentPropertyReferences as Record<string, string> | undefined;

    const internalNode: InternalNode = {
      id: node.id,
      type: node.type,
      name: node.name,
      parent,
      children: [],
      mergedNodes: [
        {
          id: node.id,
          name: node.name,
          variantName: variantName || node.name,
        },
      ],
      bounds,
      ...(componentPropertyReferences ? { componentPropertyReferences } : {}),
      // INSTANCE 노드의 componentId 보존 (NodeMatcher에서 다른 컴포넌트 병합 방지에 사용)
      ...((node.type === "INSTANCE" && (node as any).componentId)
        ? { componentId: (node as any).componentId }
        : {}),
    };

    if (children) {
      internalNode.children = children
        .filter((child) => {
          if ((child as any).visible !== false) return true;
          // prop으로 visible을 제어하는 노드는 기본값이 false여도 유지
          const refs = (child as any).componentPropertyReferences;
          if (refs?.visible) return true;
          return false;
        })
        .map((child) =>
          this.convertToInternalNode(child, variantName, internalNode)
        );
    }

    return internalNode;
  }

  // ===========================================================================
  // Private: Pattern annotation transfer
  // ===========================================================================

  /**
   * DesignPatternDetector가 반환한 패턴을 InternalNode에 복사.
   * - nodeId가 있는 패턴: 해당 InternalNode의 metadata.designPatterns에 추가
   * - nodeId가 없는 패턴 (컴포넌트 레벨): root에 추가
   */
  private applyPatternAnnotations(root: InternalTree, patterns: DesignPattern[]): void {
    const nodePatterns: Array<DesignPattern & { nodeId: string }> = [];
    const componentPatterns: DesignPattern[] = [];

    for (const p of patterns) {
      if ("nodeId" in p && typeof (p as any).nodeId === "string") {
        nodePatterns.push(p as any);
      } else {
        componentPatterns.push(p);
      }
    }

    // Component-level patterns → root
    if (componentPatterns.length > 0) {
      if (!root.metadata) root.metadata = {};
      if (!root.metadata.designPatterns) root.metadata.designPatterns = [];
      root.metadata.designPatterns.push(...componentPatterns);
    }

    // Node-level patterns → match by nodeId
    if (nodePatterns.length > 0) {
      const patternsByNodeId = new Map<string, DesignPattern[]>();
      for (const p of nodePatterns) {
        const id = p.nodeId;
        if (!patternsByNodeId.has(id)) patternsByNodeId.set(id, []);
        patternsByNodeId.get(id)!.push(p);
      }
      this.walkAndAnnotate(root, patternsByNodeId);
    }
  }

  private walkAndAnnotate(
    node: InternalNode,
    patternsByNodeId: Map<string, DesignPattern[]>,
  ): void {
    // Match by node.id
    const directMatch = patternsByNodeId.get(node.id);
    if (directMatch) {
      if (!node.metadata) node.metadata = {};
      if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
      for (const p of directMatch) {
        if (!node.metadata.designPatterns.some(e => JSON.stringify(e) === JSON.stringify(p))) {
          node.metadata.designPatterns.push(p);
        }
      }
    }

    // Also match by mergedNodes[].id (variant nodes may have different IDs)
    for (const merged of node.mergedNodes ?? []) {
      if (merged.id === node.id) continue;
      const mergedMatch = patternsByNodeId.get(merged.id);
      if (mergedMatch) {
        if (!node.metadata) node.metadata = {};
        if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
        for (const p of mergedMatch) {
          if (!node.metadata.designPatterns.some(e => JSON.stringify(e) === JSON.stringify(p))) {
            node.metadata.designPatterns.push(p);
          }
        }
      }
    }

    for (const child of node.children) {
      this.walkAndAnnotate(child, patternsByNodeId);
    }
  }

  // ===========================================================================
  // Private: Observer hook helpers
  // ===========================================================================

  private get observer(): any {
    return (globalThis as any).__HUNGARIAN_OBSERVER__;
  }

  private nodeInfo(node: InternalNode) {
    return { id: node.id, name: node.name, type: node.type };
  }
}
