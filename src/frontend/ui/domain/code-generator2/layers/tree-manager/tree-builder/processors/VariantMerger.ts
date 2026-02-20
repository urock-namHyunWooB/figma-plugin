import {
  InternalTree,
  InternalNode,
  VariantGraph,
  VariantGraphNode,
  VariantGraphEdge,
  PropDiffInfo,
} from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * Step 1: 변형 병합 (Variant Merging)
 *
 * 여러 variant를 하나의 InternalTree로 병합하는 프로세서
 * v1 VariantProcessor 방식 기반
 *
 * 주요 기능:
 * - 1-prop 차이 기반 병합 순서 결정
 * - 정규화된 위치 기반 노드 매칭 (±0.1)
 * - TEXT 노드: 이름 + 부모 타입 매칭
 * - Children x 좌표 기준 정렬
 */
export class VariantMerger {
  private readonly dataManager: DataManager;

  /** 노드 ID → 원본 variant 루트 ID 매핑 (v1 방식) */
  private nodeToVariantRoot: Map<string, string> = new Map();

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 파이프라인 진입점
   * SceneNode → InternalTree 변환
   */
  public merge(document: SceneNode): InternalTree {
    if (document.type === "COMPONENT_SET") {
      const children = (document as any).children as SceneNode[] | undefined;

      if (!children || children.length === 0) {
        return this.convertToInternalTree(document);
      }

      return this.mergeVariants(document, children);
    } else {
      return this.convertToInternalTree(document);
    }
  }

  // ===========================================================================
  // Private: Variant 병합 파이프라인
  // ===========================================================================

  /**
   * COMPONENT_SET의 여러 variant를 병합
   */
  private mergeVariants(
    document: SceneNode,
    variants: SceneNode[]
  ): InternalTree {
    // 1. 노드 ID → variant 루트 매핑 구축
    this.buildNodeToVariantRootMap(variants);

    // 2. Variant 그래프 구축 (1-prop 차이 기반)
    const graph = this.buildVariantGraph(variants);

    // 3. 병합 순서 결정 (BFS)
    const mergeOrder = this.determineMergeOrder(graph);

    // 4. 순서대로 병합
    const merged = this.mergeTreesInOrder(graph, mergeOrder);

    // 5. Children x 좌표 기준 정렬
    this.sortChildrenByPosition(merged);

    // 6. 루트 이름 설정
    merged.name = document.name;

    return merged;
  }

  /**
   * 병합 순서에 따라 트리들을 순차적으로 병합
   */
  private mergeTreesInOrder(
    graph: VariantGraph,
    mergeOrder: number[]
  ): InternalTree {
    let merged = graph.nodes[mergeOrder[0]].tree;
    let prevProps = graph.nodes[mergeOrder[0]].props;

    for (let i = 1; i < mergeOrder.length; i++) {
      const currentProps = graph.nodes[mergeOrder[i]].props;
      const nextTree = graph.nodes[mergeOrder[i]].tree;

      const propDiff = this.calculatePropDiff(prevProps, currentProps);
      merged = this.mergeTwoTrees(merged, nextTree, propDiff);

      prevProps = currentProps;
    }

    return merged;
  }

  // ===========================================================================
  // Private: Variant 그래프 구축
  // ===========================================================================

  /**
   * 노드 ID → 원본 variant 루트 ID 매핑 구축
   */
  private buildNodeToVariantRootMap(variants: SceneNode[]): void {
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
  }

  /**
   * Variant 그래프 구축 (1-prop 차이 우선)
   */
  private buildVariantGraph(variants: SceneNode[]): VariantGraph {
    const nodes: VariantGraphNode[] = variants.map((variant, index) => {
      const props = this.extractVariantProps(variant);
      const tree = this.convertToInternalTree(variant, variant.name);

      return {
        index,
        variantId: variant.id,
        props,
        tree,
      };
    });

    const edges: VariantGraphEdge[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const propDiff = this.calculatePropDiff(nodes[i].props, nodes[j].props);
        if (propDiff.count <= 1) {
          edges.push({ from: i, to: j, propDiffCount: propDiff.count });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Variant의 props 추출
   */
  private extractVariantProps(variant: SceneNode): Record<string, string> {
    const variantProperties = (variant as any).variantProperties as
      | Record<string, string>
      | undefined;
    return variantProperties || {};
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
      count: diffs.length,
      keys: diffs,
    };
  }

  /**
   * BFS로 병합 순서 결정
   */
  private determineMergeOrder(graph: VariantGraph): number[] {
    const visited = new Set<number>();
    const order: number[] = [];

    // 시작점 선택 (첫 번째 노드)
    const queue: number[] = [0];
    visited.add(0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      // 인접 노드를 propDiffCount 오름차순으로 정렬
      const neighbors = graph.edges
        .filter((e) => e.from === current || e.to === current)
        .map((e) => (e.from === current ? e.to : e.from))
        .filter((n) => !visited.has(n))
        .sort((a, b) => {
          const edgeA = graph.edges.find(
            (e) =>
              (e.from === current && e.to === a) ||
              (e.from === a && e.to === current)
          );
          const edgeB = graph.edges.find(
            (e) =>
              (e.from === current && e.to === b) ||
              (e.from === b && e.to === current)
          );
          return (edgeA?.propDiffCount || 0) - (edgeB?.propDiffCount || 0);
        });

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // 방문하지 않은 노드 추가 (연결되지 않은 컴포넌트)
    for (let i = 0; i < graph.nodes.length; i++) {
      if (!visited.has(i)) {
        order.push(i);
      }
    }

    return order;
  }

  // ===========================================================================
  // Private: 트리 변환 및 병합
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

    return {
      id: node.id,
      type: node.type,
      name: node.name,
      children: children
        ? children.map((child) => this.convertToInternalNode(child, variantName))
        : [],
      mergedNodes: [
        {
          id: node.id,
          name: node.name,
          variantName: variantName || node.name,
        },
      ],
      bounds,
    };
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
    };

    if (children) {
      internalNode.children = children.map((child) =>
        this.convertToInternalNode(child, variantName, internalNode)
      );
    }

    return internalNode;
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
   * children 배열 병합 (v1 방식)
   */
  private mergeChildren(
    childrenA: InternalNode[],
    childrenB: InternalNode[],
    propDiff: PropDiffInfo
  ): InternalNode[] {
    const merged: InternalNode[] = [...childrenA];
    const usedIndices = new Set<number>();

    for (const childB of childrenB) {
      const matchIdx = merged.findIndex(
        (childA, idx) =>
          !usedIndices.has(idx) && this.isSameNode(childA, childB)
      );

      if (matchIdx !== -1) {
        usedIndices.add(matchIdx);
        merged[matchIdx] = {
          ...merged[matchIdx],
          mergedNodes: [
            ...(merged[matchIdx].mergedNodes || []),
            ...(childB.mergedNodes || []),
          ],
          children: this.mergeChildren(
            merged[matchIdx].children,
            childB.children,
            propDiff
          ),
        };
      } else {
        merged.push(childB);
      }
    }

    return merged;
  }

  // ===========================================================================
  // Private: 노드 매칭
  // ===========================================================================

  /**
   * 두 InternalNode가 같은 노드인지 확인 (v1 방식)
   *
   * 1차: 정규화된 좌표 비교 (0.1 이내면 같은 노드)
   * 2차: TEXT 노드만 이름 기반 매칭
   */
  private isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    // 타입이 다르면 다른 노드
    if (nodeA.type !== nodeB.type) {
      return false;
    }

    // 같은 ID면 같은 노드
    if (nodeA.id === nodeB.id) {
      return true;
    }

    // 부모가 없으면 (루트) → 루트끼리는 같음
    if (!nodeA.parent && !nodeB.parent) {
      return true;
    }

    // 1차: 정규화된 좌표(시작점) 비교
    const posA = this.getNormalizedPosition(nodeA);
    const posB = this.getNormalizedPosition(nodeB);

    if (posA && posB) {
      const posMatch =
        Math.abs(posA.x - posB.x) <= 0.1 && Math.abs(posA.y - posB.y) <= 0.1;
      if (posMatch) {
        return true;
      }
    }

    // 2차: TEXT 노드만 이름 기반 매칭
    // size variant에서 같은 텍스트가 다른 위치에 있어도 병합되도록
    // 단, 부모 타입이 같아야 함 (다른 구조의 같은 이름 텍스트 구분)
    if (nodeA.type === "TEXT" && nodeA.name === nodeB.name) {
      const parentAType = nodeA.parent?.type;
      const parentBType = nodeB.parent?.type;
      // 부모 타입이 같으면 같은 역할의 텍스트로 간주
      if (parentAType && parentBType && parentAType === parentBType) {
        return true;
      }
    }

    return false;
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

  // ===========================================================================
  // Private: Children 정렬
  // ===========================================================================

  /**
   * Children을 정규화된 x 좌표로 정렬
   */
  private sortChildrenByPosition(node: InternalNode): void {
    // children을 정규화된 x 좌표로 정렬
    node.children.sort((a, b) => {
      const aX = this.getAverageX(a);
      const bX = this.getAverageX(b);
      return aX - bX;
    });

    // 재귀적으로 자식 노드들도 정렬
    for (const child of node.children) {
      this.sortChildrenByPosition(child);
    }
  }

  /**
   * 노드의 평균 정규화된 x 좌표 계산
   */
  private getAverageX(node: InternalNode): number {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return 0;
    }

    let totalNormalizedX = 0;
    let count = 0;

    for (const merged of node.mergedNodes) {
      const { node: originalNode } = this.dataManager.getById(merged.id);
      const nodeBounds = originalNode?.absoluteBoundingBox as
        | { x: number; y: number; width: number; height: number }
        | undefined;

      if (!nodeBounds) continue;

      // 원본 variant 루트 찾기
      const variantRootId = this.nodeToVariantRoot.get(merged.id);
      if (!variantRootId) continue;

      const { node: variantRoot } = this.dataManager.getById(variantRootId);
      const rootBounds = variantRoot?.absoluteBoundingBox as
        | { x: number; y: number; width: number; height: number }
        | undefined;

      if (!rootBounds || rootBounds.width === 0) continue;

      // 정규화된 x 계산 (0~1 범위)
      const normalizedX = (nodeBounds.x - rootBounds.x) / rootBounds.width;
      totalNormalizedX += normalizedX;
      count++;
    }

    return count > 0 ? totalNormalizedX / count : 0;
  }
}
