import {
  InternalTree,
  VariantGraph,
  VariantGraphNode,
  VariantGraphEdge,
  PropDiffInfo,
} from "../../../../types/types";

/**
 * VariantGraphBuilder
 *
 * Variant 그래프 구축 및 병합 순서 결정
 *
 * 책임:
 * 1. Variant props 추출
 * 2. 1-prop 차이 기반 그래프 구축
 * 3. BFS 기반 병합 순서 결정
 */
export class VariantGraphBuilder {
  /**
   * Variant 그래프 구축 (1-prop 차이 우선)
   */
  public buildGraph(
    variants: SceneNode[],
    trees: InternalTree[]
  ): VariantGraph {
    const nodes = this.createNodes(variants, trees);
    const edges = this.createEdges(nodes);

    return { nodes, edges };
  }

  /**
   * BFS로 병합 순서 결정
   */
  public determineMergeOrder(graph: VariantGraph): number[] {
    const visited = new Set<number>([0]); // 0번부터 시작
    const order: number[] = [];
    const queue: number[] = [0];

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      // 인접 노드를 propDiffCount 오름차순으로 방문
      const neighbors = this.getNeighborsSortedByPropDiff(
        graph,
        current,
        visited
      );

      for (const neighbor of neighbors) {
        visited.add(neighbor);
        queue.push(neighbor);
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
  // Private: 그래프 노드 생성
  // ===========================================================================

  /**
   * 각 variant에서 그래프 노드 생성
   */
  private createNodes(
    variants: SceneNode[],
    trees: InternalTree[]
  ): VariantGraphNode[] {
    return variants.map((variant, index) => ({
      variantName: variant.name,
      props: this.extractVariantProps(variant),
      tree: trees[index],
    }));
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

  // ===========================================================================
  // Private: 그래프 엣지 생성
  // ===========================================================================

  /**
   * 1-prop 차이인 노드 쌍을 엣지로 연결
   */
  private createEdges(nodes: VariantGraphNode[]): VariantGraphEdge[] {
    const edges: VariantGraphEdge[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const propDiff = this.calculatePropDiff(nodes[i].props, nodes[j].props);

        // 1-prop 차이인 경우에만 엣지 생성
        if (propDiff.diffCount <= 1) {
          edges.push({
            from: i,
            to: j,
            propDiff: propDiff.diffCount,
          });
        }
      }
    }

    return edges;
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

  // ===========================================================================
  // Private: 병합 순서 결정 헬퍼
  // ===========================================================================

  /**
   * 인접 노드를 propDiffCount 오름차순으로 정렬하여 반환
   */
  private getNeighborsSortedByPropDiff(
    graph: VariantGraph,
    current: number,
    visited: Set<number>
  ): number[] {
    // 현재 노드의 인접 노드 찾기
    const neighbors = graph.edges
      .filter((e) => e.from === current || e.to === current)
      .map((e) => (e.from === current ? e.to : e.from))
      .filter((n) => !visited.has(n));

    // propDiff 오름차순으로 정렬
    return neighbors.sort((a, b) => {
      const edgeA = this.findEdge(graph, current, a);
      const edgeB = this.findEdge(graph, current, b);
      return (edgeA?.propDiff || 0) - (edgeB?.propDiff || 0);
    });
  }

  /**
   * 두 노드를 연결하는 엣지 찾기
   */
  private findEdge(
    graph: VariantGraph,
    nodeA: number,
    nodeB: number
  ): VariantGraphEdge | undefined {
    return graph.edges.find(
      (e) =>
        (e.from === nodeA && e.to === nodeB) ||
        (e.from === nodeB && e.to === nodeA)
    );
  }
}
