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

import type { FigmaNodeData } from "@code-generator/types/baseType";
import type {
  IDependencyAnalyzer,
  DependencyGraph,
  ComponentId,
  ComponentInfo,
  Cycle,
} from "@code-generator/types/architecture";
import { CircularDependencyError } from "@code-generator/types/architecture";

/**
 * DependencyAnalyzer 구현체
 */
class DependencyAnalyzer implements IDependencyAnalyzer {
  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 의존성 그래프 구축
   *
   * 루트 컴포넌트에서 시작하여 모든 의존성을 탐색합니다.
   * 각 컴포넌트는 ComponentSet ID로 식별됩니다.
   * @param rootData - 루트 Figma 노드 데이터
   * @returns 의존성 그래프
   */
  public buildGraph(rootData: FigmaNodeData): DependencyGraph {
    const nodes = new Map<ComponentId, ComponentInfo>();
    const edges = new Map<ComponentId, Set<ComponentId>>();

    const rootId = this._getComponentSetId(rootData);
    if (!rootId) {
      return { nodes, edges };
    }

    // 루트의 모든 dependencies (flatten된 상태)
    const allDependencies = rootData.dependencies || {};

    // 1차 패스: dependencies 필드에서 노드와 엣지 구축
    this._buildNodesFromDependencies(rootData, rootId, nodes, edges);

    // 2차 패스: children의 INSTANCE에서 누락된 엣지 추가
    this._addEdgesFromInstanceChildren(rootId, nodes, edges, allDependencies);

    return { nodes, edges };
  }

  /**
   * 토폴로지 정렬 (컴파일 순서 결정)
   *
   * Kahn's algorithm을 사용하여 의존되는 컴포넌트부터 정렬합니다.
   * 결과: [의존되는 것들, ..., 루트]
   * @param graph - 의존성 그래프
   * @returns 토폴로지 정렬된 컴포넌트 ID 배열
   * @throws CircularDependencyError 순환 의존성 발견 시
   */
  public topologicalSort(graph: DependencyGraph): ComponentId[] {
    const cycles = this.detectCycles(graph);
    if (cycles && cycles.length > 0) {
      throw new CircularDependencyError(cycles);
    }

    const { nodes, edges } = graph;

    // in-degree 계산
    const inDegree = this._calculateInDegree(nodes, edges);

    // Kahn's algorithm
    const result = this._kahnSort(nodes, edges, inDegree);

    // 의존되는 것이 먼저 오도록 뒤집기
    return result.reverse();
  }

  /**
   * 순환 의존성 감지
   *
   * DFS를 사용하여 그래프에서 순환을 찾습니다.
   * @param graph - 의존성 그래프
   * @returns 발견된 순환 배열 또는 순환이 없으면 null
   */
  public detectCycles(graph: DependencyGraph): Cycle[] | null {
    const { nodes, edges } = graph;
    const cycles: Cycle[] = [];

    // DFS 상태: 0 = 미방문, 1 = 방문 중, 2 = 방문 완료
    const state = new Map<ComponentId, number>();
    for (const nodeId of nodes.keys()) {
      state.set(nodeId, 0);
    }

    const path: ComponentId[] = [];

    const dfs = (nodeId: ComponentId): void => {
      state.set(nodeId, 1);
      path.push(nodeId);

      const deps = edges.get(nodeId) || new Set();
      for (const dep of deps) {
        const depState = state.get(dep);

        if (depState === 1) {
          // 순환 발견
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep];
          cycles.push(cycle);
        } else if (depState === 0) {
          dfs(dep);
        }
      }

      state.set(nodeId, 2);
      path.pop();
    };

    for (const nodeId of nodes.keys()) {
      if (state.get(nodeId) === 0) {
        dfs(nodeId);
      }
    }

    return cycles.length > 0 ? cycles : null;
  }

  // ===========================================================================
  // Graph Building - 1차 패스: dependencies 필드 탐색
  // ===========================================================================

  /**
   * dependencies 필드를 BFS로 탐색하여 노드와 엣지 구축
   * @param rootData - 루트 Figma 노드 데이터
   * @param rootId - 루트 컴포넌트 ID
   * @param nodes - 노드 맵 (출력)
   * @param edges - 엣지 맵 (출력)
   */
  private _buildNodesFromDependencies(
    rootData: FigmaNodeData,
    rootId: ComponentId,
    nodes: Map<ComponentId, ComponentInfo>,
    edges: Map<ComponentId, Set<ComponentId>>
  ): void {
    // 루트 노드 추가
    nodes.set(rootId, {
      id: rootId,
      name: this._getComponentName(rootData),
      data: rootData,
    });
    edges.set(rootId, new Set());

    // BFS
    const queue: FigmaNodeData[] = [rootData];
    const visited = new Set<ComponentId>([rootId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentId = this._getComponentSetId(current);
      if (!currentId) continue;

      const dependencies = this._extractDirectDependencies(current);

      for (const dep of dependencies) {
        const depId = this._getComponentSetId(dep.data);
        if (!depId) continue;

        if (!nodes.has(depId)) {
          nodes.set(depId, { id: depId, name: dep.name, data: dep.data });
          edges.set(depId, new Set());
        }

        edges.get(currentId)!.add(depId);

        if (!visited.has(depId)) {
          visited.add(depId);
          queue.push(dep.data);
        }
      }
    }
  }

  /**
   * 컴포넌트의 직접 의존성 추출 (dependencies 필드에서)
   * @param data - Figma 노드 데이터
   * @returns 의존성 이름과 데이터 배열
   */
  private _extractDirectDependencies(
    data: FigmaNodeData
  ): Array<{ name: string; data: FigmaNodeData }> {
    const dependencies = data.dependencies;
    if (!dependencies) return [];

    return Object.entries(dependencies).map(([componentId, depData]) => ({
      name: this._resolveComponentName(componentId, depData),
      data: depData,
    }));
  }

  // ===========================================================================
  // Graph Building - 2차 패스: INSTANCE children 탐색
  // ===========================================================================

  /**
   * 각 노드의 children에서 INSTANCE를 찾아 누락된 엣지 추가
   *
   * dependencies 필드가 flatten되어 있어 중첩 관계가 손실된 경우를 보완합니다.
   * 같은 ComponentSet의 여러 variant가 서로 다른 INSTANCE를 가질 수 있으므로
   * 모든 variant를 탐색합니다.
   * @param rootId - 루트 컴포넌트 ID
   * @param nodes - 노드 맵
   * @param edges - 엣지 맵 (출력)
   * @param allDependencies - 모든 의존성 데이터
   */
  private _addEdgesFromInstanceChildren(
    rootId: ComponentId,
    nodes: Map<ComponentId, ComponentInfo>,
    edges: Map<ComponentId, Set<ComponentId>>,
    allDependencies: Record<string, FigmaNodeData>
  ): void {
    const processedComponentSets = new Set<ComponentId>();

    for (const [nodeId] of nodes) {
      if (nodeId === rootId) continue;
      if (processedComponentSets.has(nodeId)) continue;
      processedComponentSets.add(nodeId);

      // 같은 ComponentSet의 모든 variant 탐색
      const variants = this._getAllVariantsForComponentSet(
        nodeId,
        allDependencies
      );

      for (const variantData of variants) {
        this._addEdgesFromSingleVariant(
          variantData,
          nodeId,
          edges,
          allDependencies
        );
      }
    }
  }

  /**
   * 단일 variant의 children에서 INSTANCE를 찾아 엣지 추가
   * @param data - variant Figma 노드 데이터
   * @param currentId - 현재 컴포넌트 ID
   * @param edges - 엣지 맵 (출력)
   * @param allDependencies - 모든 의존성 데이터
   */
  private _addEdgesFromSingleVariant(
    data: FigmaNodeData,
    currentId: ComponentId,
    edges: Map<ComponentId, Set<ComponentId>>,
    allDependencies: Record<string, FigmaNodeData>
  ): void {
    const document = data.info?.document;
    if (!document) return;

    const instanceComponentIds = this._findInstanceComponentIds(document);

    for (const componentId of instanceComponentIds) {
      const depData = allDependencies[componentId];
      if (!depData) continue;

      const depId = this._getComponentSetId(depData);
      if (!depId || depId === currentId) continue;

      edges.get(currentId)?.add(depId);
    }
  }

  /**
   * 같은 ComponentSet에 속한 모든 variant 반환
   * @param componentSetId - ComponentSet ID
   * @param allDependencies - 모든 의존성 데이터
   * @returns 해당 ComponentSet의 variant 데이터 배열
   */
  private _getAllVariantsForComponentSet(
    componentSetId: ComponentId,
    allDependencies: Record<string, FigmaNodeData>
  ): FigmaNodeData[] {
    return Object.values(allDependencies).filter(
      (depData) => this._getComponentSetId(depData) === componentSetId
    );
  }

  /**
   * 노드의 children을 재귀 순회하여 INSTANCE의 componentId 수집
   * @param node - 탐색할 노드
   * @returns INSTANCE의 componentId 배열
   */
  private _findInstanceComponentIds(node: any): string[] {
    const result: string[] = [];

    if (node.type === "INSTANCE" && node.componentId) {
      result.push(node.componentId);
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        result.push(...this._findInstanceComponentIds(child));
      }
    }

    return result;
  }

  // ===========================================================================
  // Topological Sort Helpers
  // ===========================================================================

  /**
   * in-degree 계산 (각 노드가 몇 번 의존되는지)
   * @param nodes - 노드 맵
   * @param edges - 엣지 맵
   * @returns 각 노드의 in-degree 맵
   */
  private _calculateInDegree(
    nodes: Map<ComponentId, ComponentInfo>,
    edges: Map<ComponentId, Set<ComponentId>>
  ): Map<ComponentId, number> {
    const inDegree = new Map<ComponentId, number>();

    for (const nodeId of nodes.keys()) {
      inDegree.set(nodeId, 0);
    }

    for (const [, deps] of edges) {
      for (const to of deps) {
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
      }
    }

    return inDegree;
  }

  /**
   * Kahn's algorithm 실행
   * @param nodes - 노드 맵
   * @param edges - 엣지 맵
   * @param inDegree - 각 노드의 in-degree 맵
   * @returns 토폴로지 정렬된 컴포넌트 ID 배열
   */
  private _kahnSort(
    nodes: Map<ComponentId, ComponentInfo>,
    edges: Map<ComponentId, Set<ComponentId>>,
    inDegree: Map<ComponentId, number>
  ): ComponentId[] {
    const result: ComponentId[] = [];
    const queue: ComponentId[] = [];

    // in-degree가 0인 노드로 시작
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const deps = edges.get(current) || new Set();
      for (const dep of deps) {
        const newDegree = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, newDegree);

        if (newDegree === 0) {
          queue.push(dep);
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // Component ID/Name Resolution
  // ===========================================================================

  /**
   * FigmaNodeData에서 ComponentSet ID 추출
   * @param data - Figma 노드 데이터
   * @returns ComponentSet ID 또는 null
   */
  private _getComponentSetId(data: FigmaNodeData): ComponentId | null {
    const document = data.info?.document;
    if (!document) return null;

    if (document.type === "COMPONENT_SET") {
      return document.id;
    }

    if (document.type === "COMPONENT") {
      const componentId = document.id;
      const componentInfo = data.info?.components?.[componentId] as any;
      return componentInfo?.componentSetId || componentId;
    }

    return document.id;
  }

  /**
   * FigmaNodeData에서 컴포넌트 이름 추출
   * @param data - Figma 노드 데이터
   * @returns 컴포넌트 이름
   */
  private _getComponentName(data: FigmaNodeData): string {
    const document = data.info?.document;
    if (!document) return "Unknown";

    if (document.type === "COMPONENT_SET") {
      return document.name;
    }

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
   * componentId와 depData에서 ComponentSet 이름 결정
   * @param componentId - 컴포넌트 ID
   * @param depData - 의존성 Figma 노드 데이터
   * @returns ComponentSet 이름
   */
  private _resolveComponentName(
    componentId: string,
    depData: FigmaNodeData
  ): string {
    const componentInfo = depData.info?.components?.[componentId] as any;
    const componentSetId = componentInfo?.componentSetId;

    if (componentSetId) {
      const componentSetInfo = depData.info?.componentSets?.[
        componentSetId
      ] as any;
      return (
        componentSetInfo?.name || depData.info?.document?.name || componentId
      );
    }

    return depData.info?.document?.name || componentId;
  }
}

export default DependencyAnalyzer;
