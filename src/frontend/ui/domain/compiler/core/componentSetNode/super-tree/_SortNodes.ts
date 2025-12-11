import { SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";

/**
 * SuperTree의 children을 위상 정렬 기반으로 정렬하는 클래스
 *
 * 핵심 아이디어:
 * - 각 variant의 children 순서에서 "A가 B보다 앞" 관계를 추출
 * - 방향 그래프로 만든 뒤 위상 정렬
 * - 충돌(사이클) 발생 시 더 많은 variant에서 지지받는 순서 선택
 */
class _SortNodes {
  private specDataManager: SpecDataManager;

  // variant name → children ids 순서 캐시
  private variantChildrenCache: Map<string, string[]> = new Map();

  constructor(specDataManager: SpecDataManager) {
    this.specDataManager = specDataManager;
    this.buildVariantChildrenCache();
  }

  /**
   * 각 variant의 children id 순서를 캐시
   */
  private buildVariantChildrenCache() {
    const renderTree = this.specDataManager.getRenderTree();
    if (!renderTree.children) return;

    for (const variant of renderTree.children) {
      if (!variant.name || !variant.children) continue;

      const childrenIds = variant.children.map((child) => child.id);
      this.variantChildrenCache.set(variant.name, childrenIds);
    }
  }

  /**
   * parentNode의 자식요소를 위상 정렬 기반으로 정렬
   */
  public sortChildrenNodes(parentNode: SuperTreeNode): SuperTreeNode {
    const children = parentNode.children.filter(
      (child): child is SuperTreeNode => !!child
    );

    if (children.length <= 1) return parentNode;

    // 1. 순서 관계 그래프 구축
    const orderGraph = this.buildOrderGraph(children);

    // 2. 위상 정렬
    const sortedChildren = this.topologicalSort(children, orderGraph);

    // 3. in-place 반영
    parentNode.children = sortedChildren;

    return parentNode;
  }

  /**
   * children 간의 순서 관계 그래프 구축
   *
   * 각 variant에서 두 노드가 함께 존재할 때,
   * 앞에 있는 노드 → 뒤에 있는 노드 관계를 추출
   */
  private buildOrderGraph(
    children: SuperTreeNode[]
  ): Map<string, Map<string, number>> {
    // graph[fromId][toId] = weight (이 관계를 지지하는 variant 수)
    const graph = new Map<string, Map<string, number>>();

    // 모든 노드 쌍에 대해
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const nodeA = children[i];
        const nodeB = children[j];

        // 두 노드가 공통으로 존재하는 variant들 찾기
        const commonVariants = this.findCommonVariants(nodeA, nodeB);

        for (const variantName of commonVariants) {
          const order = this.getOrderInVariant(nodeA, nodeB, variantName);

          if (order !== 0) {
            const [first, second] =
              order < 0 ? [nodeA.id, nodeB.id] : [nodeB.id, nodeA.id];

            // 간선 추가 또는 가중치 증가
            if (!graph.has(first)) {
              graph.set(first, new Map());
            }
            const edges = graph.get(first)!;
            edges.set(second, (edges.get(second) || 0) + 1);
          }
        }
      }
    }

    return graph;
  }

  /**
   * 두 노드가 공통으로 존재하는 variant 이름들 반환
   */
  private findCommonVariants(
    nodeA: SuperTreeNode,
    nodeB: SuperTreeNode
  ): string[] {
    const variantsA = new Set(
      nodeA.mergedNode.map((m) => m.variantName).filter((v): v is string => !!v)
    );

    return nodeB.mergedNode
      .map((m) => m.variantName)
      .filter((v): v is string => !!v && variantsA.has(v));
  }

  /**
   * 특정 variant에서 두 노드의 순서 비교
   * @returns 음수: A가 앞, 양수: B가 앞, 0: 알 수 없음
   */
  private getOrderInVariant(
    nodeA: SuperTreeNode,
    nodeB: SuperTreeNode,
    variantName: string
  ): number {
    // variant의 children 순서 가져오기
    const childrenOrder = this.variantChildrenCache.get(variantName);
    if (!childrenOrder) return 0;

    // 각 노드의 해당 variant에서의 id 찾기
    const mergedA = nodeA.mergedNode.find((m) => m.variantName === variantName);
    const mergedB = nodeB.mergedNode.find((m) => m.variantName === variantName);

    if (!mergedA || !mergedB) return 0;

    const indexA = childrenOrder.indexOf(mergedA.id);
    const indexB = childrenOrder.indexOf(mergedB.id);

    if (indexA === -1 || indexB === -1) return 0;

    return indexA - indexB;
  }

  /**
   * Kahn's algorithm 기반 위상 정렬
   * 충돌(사이클) 발생 시 가중치가 높은 간선 우선
   */
  private topologicalSort(
    children: SuperTreeNode[],
    graph: Map<string, Map<string, number>>
  ): SuperTreeNode[] {
    const nodeMap = new Map(children.map((c) => [c.id, c]));
    const result: SuperTreeNode[] = [];

    // indegree 계산
    const indegree = new Map<string, number>();
    for (const child of children) {
      indegree.set(child.id, 0);
    }

    for (const [from, edges] of graph) {
      for (const [to, weight] of edges) {
        // 역방향 간선이 있는지 확인 (충돌)
        const reverseWeight = graph.get(to)?.get(from) || 0;

        // 가중치가 더 높은 방향만 유효한 간선으로 처리
        if (weight > reverseWeight) {
          indegree.set(to, (indegree.get(to) || 0) + 1);
        }
      }
    }

    // indegree가 0인 노드들로 시작
    const queue: string[] = [];
    for (const [nodeId, degree] of indegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // 동일 indegree일 때 정렬 기준: 원래 children 배열 순서 (stable)
    const originalOrder = new Map(children.map((c, i) => [c.id, i]));
    queue.sort(
      (a, b) => (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0)
    );

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = nodeMap.get(currentId);
      if (currentNode) {
        result.push(currentNode);
      }

      // 현재 노드에서 나가는 간선들 처리
      const edges = graph.get(currentId);
      if (edges) {
        for (const [toId, weight] of edges) {
          const reverseWeight = graph.get(toId)?.get(currentId) || 0;

          // 가중치가 더 높은 방향만 유효
          if (weight > reverseWeight) {
            const newDegree = (indegree.get(toId) || 1) - 1;
            indegree.set(toId, newDegree);

            if (newDegree === 0) {
              // 삽입 위치 찾기 (stable sort 유지)
              const insertOrder = originalOrder.get(toId) || 0;
              let insertIdx = queue.length;
              for (let i = 0; i < queue.length; i++) {
                if ((originalOrder.get(queue[i]) || 0) > insertOrder) {
                  insertIdx = i;
                  break;
                }
              }
              queue.splice(insertIdx, 0, toId);
            }
          }
        }
      }
    }

    // 사이클로 인해 처리되지 않은 노드들 추가 (폴백)
    const resultIds = new Set(result.map((r) => r.id));
    for (const child of children) {
      if (!resultIds.has(child.id)) {
        result.push(child);
      }
    }

    return result;
  }
}

export default _SortNodes;
