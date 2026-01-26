/**
 * DependencyAnalyzer
 *
 * 컴포넌트 간 의존성을 분석하고 컴파일 순서를 결정합니다.
 *
 * 책임:
 * - 전체 의존성 그래프 구축
 * - 순환 의존성 감지
 * - 토폴로지 정렬로 컴파일 순서 결정
 * - 각 컴포넌트가 한 번만 컴파일되도록 보장
 *
 * @see docs/ARCHITECTURE.md
 */

import type { FigmaNodeData } from "@compiler/types/baseType";
import type {
  IDependencyAnalyzer,
  DependencyGraph,
  ComponentId,
  ComponentInfo,
  Cycle,
} from "@compiler/types/architecture";
import { CircularDependencyError } from "@compiler/types/architecture";

/**
 * DependencyAnalyzer 구현체
 */
class DependencyAnalyzer implements IDependencyAnalyzer {
  /**
   * 의존성 그래프 구축
   *
   * 루트 컴포넌트에서 시작하여 모든 의존성을 DFS로 탐색합니다.
   * 각 컴포넌트는 ComponentSet ID로 식별됩니다.
   *
   * @param rootData 루트 컴포넌트 데이터
   * @returns 의존성 그래프
   */
  public buildGraph(rootData: FigmaNodeData): DependencyGraph {
    const nodes = new Map<ComponentId, ComponentInfo>();
    const edges = new Map<ComponentId, Set<ComponentId>>();

    // 루트 컴포넌트 ID 결정
    const rootId = this._getComponentSetId(rootData);
    if (!rootId) {
      return { nodes, edges };
    }

    // 루트 노드 추가
    nodes.set(rootId, {
      id: rootId,
      name: this._getComponentName(rootData),
      data: rootData,
    });
    edges.set(rootId, new Set());

    // BFS로 모든 의존성 탐색
    const queue: FigmaNodeData[] = [rootData];
    const visited = new Set<ComponentId>([rootId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentId = this._getComponentSetId(current);
      if (!currentId) continue;

      // 현재 컴포넌트의 직접 의존성 수집
      const dependencies = this._extractDirectDependencies(current);

      for (const dep of dependencies) {
        const depId = this._getComponentSetId(dep.data);
        if (!depId) continue;

        // 노드 추가 (아직 없으면)
        if (!nodes.has(depId)) {
          nodes.set(depId, {
            id: depId,
            name: dep.name,
            data: dep.data,
          });
          edges.set(depId, new Set());
        }

        // 엣지 추가: currentId → depId (currentId가 depId를 의존)
        edges.get(currentId)!.add(depId);

        // 아직 방문하지 않은 노드면 큐에 추가
        if (!visited.has(depId)) {
          visited.add(depId);
          queue.push(dep.data);
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 토폴로지 정렬 (컴파일 순서 결정)
   *
   * Kahn's algorithm을 사용하여 의존되는 컴포넌트부터 정렬합니다.
   * 결과: [의존되는 것들, ..., 루트]
   *
   * @param graph 의존성 그래프
   * @returns 컴파일 순서 (의존되는 것부터)
   * @throws CircularDependencyError 순환 의존성 발견 시
   */
  public topologicalSort(graph: DependencyGraph): ComponentId[] {
    // 순환 의존성 먼저 체크
    const cycles = this.detectCycles(graph);
    if (cycles && cycles.length > 0) {
      throw new CircularDependencyError(cycles);
    }

    const { nodes, edges } = graph;
    const result: ComponentId[] = [];

    // in-degree 계산 (각 노드가 몇 번 의존되는지)
    const inDegree = new Map<ComponentId, number>();
    for (const nodeId of nodes.keys()) {
      inDegree.set(nodeId, 0);
    }

    for (const [_from, deps] of edges) {
      for (const to of deps) {
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
      }
    }

    // in-degree가 0인 노드들로 시작 (아무도 의존하지 않는 노드)
    const queue: ComponentId[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // current가 의존하는 노드들의 in-degree 감소
      const deps = edges.get(current) || new Set();
      for (const dep of deps) {
        const newDegree = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, newDegree);

        if (newDegree === 0) {
          queue.push(dep);
        }
      }
    }

    // 결과를 뒤집어서 반환 (의존되는 것이 먼저 오도록)
    // Kahn's algorithm 결과: 의존하는 순서 → 반대로 하면 의존되는 순서
    return result.reverse();
  }

  /**
   * 순환 의존성 감지
   *
   * DFS를 사용하여 그래프에서 순환을 찾습니다.
   *
   * @param graph 의존성 그래프
   * @returns 순환 경로 배열, 없으면 null
   */
  public detectCycles(graph: DependencyGraph): Cycle[] | null {
    const { nodes, edges } = graph;
    const cycles: Cycle[] = [];

    // DFS 상태: 0 = 미방문, 1 = 방문 중, 2 = 방문 완료
    const state = new Map<ComponentId, number>();
    for (const nodeId of nodes.keys()) {
      state.set(nodeId, 0);
    }

    // 현재 DFS 경로 추적
    const path: ComponentId[] = [];

    const dfs = (nodeId: ComponentId): boolean => {
      state.set(nodeId, 1); // 방문 중
      path.push(nodeId);

      const deps = edges.get(nodeId) || new Set();
      for (const dep of deps) {
        const depState = state.get(dep);

        if (depState === 1) {
          // 방문 중인 노드를 다시 만남 = 순환 발견
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart);
          cycle.push(dep); // 순환 완성 (시작점으로 돌아옴)
          cycles.push(cycle);
          return true;
        }

        if (depState === 0) {
          dfs(dep);
        }
      }

      state.set(nodeId, 2); // 방문 완료
      path.pop();
      return false;
    };

    // 모든 노드에서 DFS 시작
    for (const nodeId of nodes.keys()) {
      if (state.get(nodeId) === 0) {
        dfs(nodeId);
      }
    }

    return cycles.length > 0 ? cycles : null;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * FigmaNodeData에서 ComponentSet ID 추출
   */
  private _getComponentSetId(data: FigmaNodeData): ComponentId | null {
    const document = data.info?.document;
    if (!document) return null;

    // COMPONENT_SET인 경우 자신의 ID 반환
    if (document.type === "COMPONENT_SET") {
      return document.id;
    }

    // COMPONENT인 경우 componentSetId 찾기
    if (document.type === "COMPONENT") {
      const componentId = document.id;
      const componentInfo = data.info?.components?.[componentId] as any;
      return componentInfo?.componentSetId || componentId;
    }

    // 그 외의 경우 document ID 사용
    return document.id;
  }

  /**
   * FigmaNodeData에서 컴포넌트 이름 추출
   */
  private _getComponentName(data: FigmaNodeData): string {
    const document = data.info?.document;
    if (!document) return "Unknown";

    // COMPONENT_SET인 경우 이름 반환
    if (document.type === "COMPONENT_SET") {
      return document.name;
    }

    // COMPONENT인 경우 componentSets에서 이름 찾기
    if (document.type === "COMPONENT") {
      const componentId = document.id;
      const componentInfo = data.info?.components?.[componentId] as any;
      const componentSetId = componentInfo?.componentSetId;

      if (componentSetId) {
        const componentSetInfo = data.info?.componentSets?.[
          componentSetId
        ] as any;
        return componentSetInfo?.name || document.name;
      }
    }

    return document.name;
  }

  /**
   * 컴포넌트의 직접 의존성 추출
   *
   * dependencies 필드에서 직접 참조하는 컴포넌트들을 추출합니다.
   */
  private _extractDirectDependencies(
    data: FigmaNodeData
  ): Array<{ name: string; data: FigmaNodeData }> {
    const dependencies = data.dependencies;
    if (!dependencies) return [];

    const result: Array<{ name: string; data: FigmaNodeData }> = [];

    for (const [componentId, depData] of Object.entries(dependencies)) {
      // ComponentSet 이름 결정
      const componentInfo = depData.info?.components?.[componentId] as any;
      const componentSetId = componentInfo?.componentSetId;

      let name: string;
      if (componentSetId) {
        const componentSetInfo = depData.info?.componentSets?.[
          componentSetId
        ] as any;
        name = componentSetInfo?.name || depData.info?.document?.name || componentId;
      } else {
        name = depData.info?.document?.name || componentId;
      }

      result.push({ name, data: depData });
    }

    return result;
  }
}

export default DependencyAnalyzer;
