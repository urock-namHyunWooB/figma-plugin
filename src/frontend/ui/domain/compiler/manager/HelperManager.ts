import { ConditionNode, SuperTreeNode } from "@compiler";
import {
  BinaryOperator,
  TempAstTree,
  RenderTree,
} from "@compiler/types/customType";

class HelperManager {
  public findBooleanVariantProps(definitions: Record<string, any>): string[] {
    return Object.entries(definitions)
      .filter(([_, def]) => {
        const options = def.variantOptions?.sort();
        return (
          options?.length === 2 &&
          (options[0].toLowerCase() === "false" ||
            options[0].toLowerCase() === "true") &&
          (options[1].toLowerCase() === "false" ||
            options[1].toLowerCase() === "true")
        );
      })
      .map(([name]) => name);
  }

  public parseVariantName(variantName: string): Record<string, string> {
    const result: Record<string, string> = {};

    if (!variantName) return result;

    variantName.split(",").forEach((part) => {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key && value) {
        result[key] = value;
      }
    });

    return result;
  }

  public combineWithAnd(conditions: ConditionNode[]): ConditionNode {
    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "&&" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  public combineWithOr(conditions: ConditionNode[]): ConditionNode {
    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "||" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  public createBinaryCondition(propName: string, value: string): ConditionNode {
    return {
      type: "BinaryExpression",
      operator: "===" as BinaryOperator,
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { type: "Identifier", name: propName },
        computed: false,
        optional: false,
      },
      right: {
        type: "Literal",
        value: value,
        raw: `'${value}'`,
      },
    } as unknown as ConditionNode;
  }

  public deepCloneTree(tree: TempAstTree): any {
    // 순환 참조(parent) 제외하고 복사
    const clone = (node: TempAstTree): any => {
      const { parent, children, ...rest } = node;
      return {
        ...JSON.parse(JSON.stringify(rest)), // deep clone (parent 제외)
        children: children.map((child) => clone(child)),
      };
    };
    return clone(tree);
  }

  public getRootComponentNode(node: SuperTreeNode) {
    while (node) {
      if (node.type === "COMPONENT") return node;
      node = node.parent as SuperTreeNode;
    }

    return node;
  }
}

// Union-Find 헬퍼
export class UnionFind {
  private parent: Map<string, string> = new Map();

  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id);
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)!)); // 경로 압축
    }
    return this.parent.get(id)!;
  }

  union(id1: string, id2: string) {
    const root1 = this.find(id1);
    const root2 = this.find(id2);
    if (root1 !== root2) {
      this.parent.set(root2, root1);
    }
  }
}

// 방향 그래프 클래스
export class DirectedGraph {
  private adjacencyList: Map<string, Set<string>> = new Map();
  private nodes: Set<string> = new Set();

  addNode(nodeId: string) {
    this.nodes.add(nodeId);
    if (!this.adjacencyList.has(nodeId)) {
      this.adjacencyList.set(nodeId, new Set());
    }
  }

  addEdge(from: string, to: string) {
    this.addNode(from);
    this.addNode(to);
    this.adjacencyList.get(from)!.add(to);
  }

  hasEdge(from: string, to: string): boolean {
    return this.adjacencyList.get(from)?.has(to) ?? false;
  }

  getNodes(): Set<string> {
    return this.nodes;
  }

  getEdges(): Array<[string, string]> {
    const edges: Array<[string, string]> = [];
    for (const [from, neighbors] of this.adjacencyList) {
      for (const to of neighbors) {
        edges.push([from, to]);
      }
    }
    return edges;
  }

  /**
   * from → to edge를 추가했을 때 사이클이 생기는지 확인
   * (실제로 edge를 추가하지 않고 검사만 함)
   * @returns 사이클이 생기면 true, 아니면 false
   */
  wouldCreateCycle(from: string, to: string): boolean {
    // 이미 같은 edge가 있으면 사이클 아님
    if (this.hasEdge(from, to)) return false;

    // to에서 from으로 가는 경로가 있으면 사이클 발생
    // BFS로 to → from 경로 탐색
    const visited = new Set<string>();
    const queue: string[] = [to];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === from) return true; // 경로 발견 → 사이클

      if (visited.has(current)) continue;
      visited.add(current);

      for (const neighbor of this.adjacencyList.get(current) || []) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return false;
  }

  /**
   * 노드 A를 노드 B로 병합했을 때 사이클이 생기는지 확인
   * A의 모든 incoming/outgoing edge를 B로 옮겼을 때를 시뮬레이션
   * @returns 사이클이 생기면 true, 아니면 false
   */
  wouldCreateCycleOnMerge(nodeA: string, nodeB: string): boolean {
    // A → X 인 모든 edge를 B → X로 변경
    // X → A 인 모든 edge를 X → B로 변경
    // 이때 B → B 자기 루프가 생기거나 기존 경로와 충돌하면 사이클

    const aOutgoing = this.adjacencyList.get(nodeA) || new Set<string>();
    const aIncoming = new Set<string>();

    // A로 들어오는 edge 수집
    for (const [from, neighbors] of this.adjacencyList) {
      if (neighbors.has(nodeA) && from !== nodeA) {
        aIncoming.add(from);
      }
    }

    // Case 1: B가 A의 outgoing에 있으면서 A가 B의 outgoing에 있으면 사이클
    const bOutgoing = this.adjacencyList.get(nodeB) || new Set<string>();
    if (aOutgoing.has(nodeB) && bOutgoing.has(nodeA)) {
      return true;
    }

    // Case 2: A의 outgoing을 B로 옮겼을 때 B → B 자기 루프
    if (aOutgoing.has(nodeB)) {
      // B → B 루프는 제외하고 처리 가능
    }

    // Case 3: A의 incoming을 B로 옮겼을 때 B → B 자기 루프
    if (aIncoming.has(nodeB)) {
      // B → B 루프는 제외하고 처리 가능
    }

    // Case 4: 새로운 경로로 인한 사이클
    // A의 outgoing 노드들 중 하나에서 B로 가는 경로가 있으면 사이클
    for (const target of aOutgoing) {
      if (target === nodeB) continue;
      if (this.hasPath(target, nodeB)) {
        return true;
      }
    }

    // A의 incoming 노드들로 B에서 가는 경로가 있으면 사이클
    for (const source of aIncoming) {
      if (source === nodeB) continue;
      if (this.hasPath(nodeB, source)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 노드를 제거했을 때 사이클이 생기는지 확인
   * (노드 제거 시 incoming → outgoing을 연결하는 transitivity 적용)
   * @param nodeToRemove - 제거할 노드 ID
   * @returns 사이클이 생기면 true, 아니면 false
   *
   * @example
   * // Icon1 → Text → Icon2 에서 Text 제거 시
   * // Icon1 → Icon2 연결이 추가됨
   * // 만약 이미 Icon2 → Icon1 경로가 있다면 사이클 발생
   */
  wouldCreateCycleOnRemove(nodeToRemove: string): boolean {
    if (!this.nodes.has(nodeToRemove)) return false;

    // 제거할 노드의 incoming, outgoing 수집
    const incoming = new Set<string>(); // X → nodeToRemove
    const outgoing = this.adjacencyList.get(nodeToRemove) || new Set<string>();

    for (const [from, neighbors] of this.adjacencyList) {
      if (neighbors.has(nodeToRemove) && from !== nodeToRemove) {
        incoming.add(from);
      }
    }

    // transitivity: incoming의 각 노드에서 outgoing의 각 노드로 edge 추가 시 사이클 체크
    for (const from of incoming) {
      for (const to of outgoing) {
        if (from === to) continue; // 자기 루프는 제외
        if (to === nodeToRemove) continue; // 제거되는 노드로의 edge는 무시

        // 이미 to → from 경로가 있으면 from → to 추가 시 사이클
        if (this.hasPath(to, from)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * from에서 to로 가는 경로가 있는지 확인 (BFS)
   */
  hasPath(from: string, to: string): boolean {
    if (from === to) return true;

    const visited = new Set<string>();
    const queue: string[] = [from];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to) return true;

      if (visited.has(current)) continue;
      visited.add(current);

      for (const neighbor of this.adjacencyList.get(current) || []) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return false;
  }

  /**
   * Kahn's algorithm을 사용한 위상 정렬
   * @returns 정렬된 노드 ID 배열, 사이클이 있으면 null
   */
  topologicalSort(): string[] | null {
    const inDegree = new Map<string, number>();

    // Initialize in-degrees
    for (const node of this.nodes) {
      inDegree.set(node, 0);
    }

    // Calculate in-degrees
    for (const [_, neighbors] of this.adjacencyList) {
      for (const to of neighbors) {
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
      }
    }

    // Queue of nodes with 0 in-degree
    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const result: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      for (const neighbor of this.adjacencyList.get(node) || []) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check for cycle
    if (result.length !== this.nodes.size) {
      return null; // Cycle detected
    }

    return result;
  }
}

export type OrderGraphResult = {
  // parentId → 자식들의 방향 그래프
  graphs: Map<string, DirectedGraph>;
  // parentId → 위상 정렬된 자식 ID 배열 (사이클 시 null)
  sortedChildren: Map<string, string[] | null>;
};

/**
 * SuperTree를 순회하여 각 부모 노드별로 자식들의 순서 방향 그래프를 구축합니다.
 *
 * @param superTree - 순회할 SuperTree 루트 노드
 * @returns 각 부모별 방향 그래프와 위상 정렬 결과
 *
 * @example
 * const result = buildOrderGraphFromSuperTree(superTree);
 * const sortedIds = result.sortedChildren.get(parentId);
 */
export function buildOrderGraphFromSuperTree(
  superTree: SuperTreeNode
): OrderGraphResult {
  const graphs = new Map<string, DirectedGraph>();
  const sortedChildren = new Map<string, string[] | null>();

  // BFS로 superTree 순회
  const queue: SuperTreeNode[] = [superTree];

  while (queue.length > 0) {
    const node = queue.shift()!;
    const validChildren = node.children.filter(
      (c): c is SuperTreeNode => c !== undefined
    );

    if (validChildren.length >= 2) {
      const graph = new DirectedGraph();

      // variant별로 children 그룹핑
      const variantToChildren = new Map<string, SuperTreeNode[]>();

      for (const child of validChildren) {
        for (const merged of child.mergedNode) {
          const variantName = merged.variantName || "default";
          if (!variantToChildren.has(variantName)) {
            variantToChildren.set(variantName, []);
          }
          variantToChildren.get(variantName)!.push(child);
        }
      }

      // 각 variant 내에서 순서 관계를 edge로 추가
      // children[i] → children[j] (i < j)
      for (const [_, children] of variantToChildren) {
        for (let i = 0; i < children.length; i++) {
          for (let j = i + 1; j < children.length; j++) {
            graph.addEdge(children[i].id, children[j].id);
          }
        }
      }

      graphs.set(node.id, graph);
      sortedChildren.set(node.id, graph.topologicalSort());
    }

    // 자식 노드들을 큐에 추가
    for (const child of validChildren) {
      queue.push(child);
    }
  }

  return { graphs, sortedChildren };
}

/**
 * 노드 ID를 키로 사용하는 트리 노드 (순회용)
 */
interface TraversableTreeNode {
  id: string;
  name: string;
  children: TraversableTreeNode[];
}

export type ComponentOrderGraphResult = {
  // 부모 노드 ID → 자식들의 순서 방향 그래프
  graphs: Map<string, DirectedGraph>;
  // 부모 노드 ID → 위상 정렬된 자식 ID 배열 (사이클 시 null)
  sortedChildren: Map<string, string[] | null>;
  // nodeId → 해당 노드가 등장한 variant 이름들
  nodeVariants: Map<string, Set<string>>;
};

/**
 * 원본 RenderTree(components)를 순회하여 각 부모 노드별로 자식들의 순서 방향 그래프를 구축합니다.
 * 스쿼시 정책 결정 전에 사용합니다.
 *
 * @param components - 각 variant의 RenderTree 배열 (renderTree.children)
 * @returns 각 부모별 방향 그래프, 위상 정렬 결과, 노드별 variant 정보
 *
 * @example
 * const components = renderTree.children;
 * const result = buildOrderGraphFromComponents(components);
 *
 * // 스쿼시 가능 여부 확인
 * const graph = result.graphs.get(parentId);
 * if (graph && !graph.wouldCreateCycleOnMerge(nodeA, nodeB)) {
 *   // A를 B로 스쿼시 가능
 * }
 */
export function buildOrderGraphFromComponents(
  components: RenderTree[]
): ComponentOrderGraphResult {
  const graphs = new Map<string, DirectedGraph>();
  const sortedChildren = new Map<string, string[] | null>();
  const nodeVariants = new Map<string, Set<string>>();

  // 각 component(variant)를 순회
  for (const component of components) {
    const variantName = component.name;

    // BFS로 해당 variant의 모든 노드 순회
    const queue: TraversableTreeNode[] = [component];

    while (queue.length > 0) {
      const node = queue.shift()!;

      // 노드가 어떤 variant에 속하는지 기록
      if (!nodeVariants.has(node.id)) {
        nodeVariants.set(node.id, new Set());
      }
      nodeVariants.get(node.id)!.add(variantName);

      // 자식이 2개 이상인 경우에만 순서 그래프 구축
      if (node.children.length >= 2) {
        // 부모 ID를 기준으로 그래프 가져오기 (없으면 생성)
        if (!graphs.has(node.id)) {
          graphs.set(node.id, new DirectedGraph());
        }
        const graph = graphs.get(node.id)!;

        // 현재 variant에서의 children 순서를 edge로 추가
        // children[i] → children[j] (i < j)
        for (let i = 0; i < node.children.length; i++) {
          for (let j = i + 1; j < node.children.length; j++) {
            graph.addEdge(node.children[i].id, node.children[j].id);
          }
        }
      }

      // 자식 노드들을 큐에 추가
      for (const child of node.children) {
        queue.push(child);
      }
    }
  }

  // 모든 그래프에 대해 위상 정렬 수행
  for (const [parentId, graph] of graphs) {
    sortedChildren.set(parentId, graph.topologicalSort());
  }

  return { graphs, sortedChildren, nodeVariants };
}

/**
 * 스쿼시 방향을 결정합니다. (같은 부모를 가진 경우)
 * A를 B로 합칠지, B를 A로 합칠지 판단합니다.
 *
 * @param graph - 해당 부모의 자식 순서 그래프
 * @param nodeAId - 스쿼시 후보 A의 ID
 * @param nodeBId - 스쿼시 후보 B의 ID
 * @returns 'A_TO_B' | 'B_TO_A' | 'BOTH_OK' | 'CONFLICT'
 */
export function determineSquashDirection(
  graph: DirectedGraph,
  nodeAId: string,
  nodeBId: string
): "A_TO_B" | "B_TO_A" | "BOTH_OK" | "CONFLICT" {
  const aToB = !graph.wouldCreateCycleOnMerge(nodeAId, nodeBId);
  const bToA = !graph.wouldCreateCycleOnMerge(nodeBId, nodeAId);

  if (aToB && bToA) return "BOTH_OK";
  if (aToB && !bToA) return "A_TO_B";
  if (!aToB && bToA) return "B_TO_A";
  return "CONFLICT";
}

/**
 * 다른 부모를 가진 노드들의 스쿼시 가능 여부를 확인합니다.
 * nodeToRemove를 nodeToKeep에 합칠 때, nodeToRemove가 속한 부모의 그래프에서
 * 해당 노드를 제거해도 위상 정렬이 유지되는지 확인합니다.
 *
 * @param graphs - 부모별 방향 그래프 맵
 * @param nodeToRemove - 제거될 노드 (합쳐지는 쪽)
 * @param parentOfNodeToRemove - nodeToRemove의 부모 ID
 * @returns 스쿼시 가능하면 true, 사이클 발생하면 false
 *
 * @example
 * // Text_B를 Text_A로 합칠 때, Text_B가 ParentB에서 제거되어도 괜찮은지 확인
 * const canSquash = canSquashWithDifferentParent(graphs, textBId, parentBId);
 */
export function canSquashWithDifferentParent(
  graphs: Map<string, DirectedGraph>,
  nodeToRemove: string,
  parentOfNodeToRemove: string
): boolean {
  const graph = graphs.get(parentOfNodeToRemove);
  if (!graph) return true; // 그래프가 없으면 제약 없음

  return !graph.wouldCreateCycleOnRemove(nodeToRemove);
}

/**
 * 스쿼시 가능 여부와 방향을 종합적으로 판단합니다.
 *
 * @param graphs - 부모별 방향 그래프 맵
 * @param nodeA - 스쿼시 후보 A {id, parentId}
 * @param nodeB - 스쿼시 후보 B {id, parentId}
 * @returns 스쿼시 결과
 *
 * @example
 * const result = determineSquashStrategy(graphs,
 *   { id: 'textA', parentId: 'parentA' },
 *   { id: 'textB', parentId: 'parentB' }
 * );
 * // result: { canSquash: true, direction: 'B_TO_A', reason: '...' }
 */
export function determineSquashStrategy(
  graphs: Map<string, DirectedGraph>,
  nodeA: { id: string; parentId: string },
  nodeB: { id: string; parentId: string }
): {
  canSquash: boolean;
  direction: "A_TO_B" | "B_TO_A" | "BOTH_OK" | null;
  reason: string;
} {
  const sameParent = nodeA.parentId === nodeB.parentId;

  if (sameParent) {
    // 같은 부모: 기존 로직 사용
    const graph = graphs.get(nodeA.parentId);
    if (!graph) {
      return { canSquash: true, direction: "BOTH_OK", reason: "그래프 없음" };
    }

    const direction = determineSquashDirection(graph, nodeA.id, nodeB.id);
    if (direction === "CONFLICT") {
      return {
        canSquash: false,
        direction: null,
        reason: "양방향 모두 사이클 발생",
      };
    }
    return { canSquash: true, direction, reason: "같은 부모 내 스쿼시 가능" };
  }

  // 다른 부모: 각각의 부모 그래프에서 제거 가능한지 확인
  const canRemoveA = canSquashWithDifferentParent(
    graphs,
    nodeA.id,
    nodeA.parentId
  );
  const canRemoveB = canSquashWithDifferentParent(
    graphs,
    nodeB.id,
    nodeB.parentId
  );

  if (canRemoveA && canRemoveB) {
    return {
      canSquash: true,
      direction: "BOTH_OK",
      reason: "양쪽 모두 제거 가능",
    };
  }
  if (canRemoveA && !canRemoveB) {
    return {
      canSquash: true,
      direction: "A_TO_B",
      reason: "A 제거 시만 위상 정렬 유지",
    };
  }
  if (!canRemoveA && canRemoveB) {
    return {
      canSquash: true,
      direction: "B_TO_A",
      reason: "B 제거 시만 위상 정렬 유지",
    };
  }

  return {
    canSquash: false,
    direction: null,
    reason: "양쪽 모두 제거 시 위상 정렬 깨짐",
  };
}

const helper = new HelperManager();

export default helper;
