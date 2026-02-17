import { ConditionNode, SuperTreeNode } from "@code-generator";
import { BinaryOperator, RenderTree } from "@code-generator/types/customType";
import { traverseBFS } from "../utils/traverse";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

class HelperManager {
  /**
   * Boolean 타입의 Variant props를 찾아 반환
   * @param definitions - componentPropertyDefinitions 객체
   * @returns Boolean variant prop 이름 배열
   */
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

  /**
   * variant 이름을 파싱하여 key-value 객체로 반환
   * 예: "Size=Large, State=Default" → { Size: "Large", State: "Default" }
   * @param variantName - 파싱할 variant 이름 문자열
   * @returns prop 이름과 값의 Record 객체
   */
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

  /**
   * 여러 조건을 AND(&&) 연산자로 결합
   * @param conditions - 결합할 ConditionNode 배열
   * @returns AND 연산자로 결합된 ConditionNode
   */
  public combineWithAnd(conditions: ConditionNode[]): ConditionNode {
    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "&&" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  /**
   * 여러 조건을 OR(||) 연산자로 결합
   * @param conditions - 결합할 ConditionNode 배열
   * @returns OR 연산자로 결합된 ConditionNode
   */
  public combineWithOr(conditions: ConditionNode[]): ConditionNode {
    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "||" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  /**
   * 배열 기반 includes 조건 생성
   * ["filled", "outlined"].includes(props.customType)
   * -> 이후 CreateJsxTree에서 props.X를 X로 변환
   * @param propName - prop 이름
   * @param values - 포함 여부를 검사할 값 배열
   * @returns includes 메소드 호출 형태의 ConditionNode
   */
  public createIncludesCondition(
    propName: string,
    values: string[]
  ): ConditionNode {
    return {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: {
          type: "ArrayExpression",
          elements: values.map((v) => ({
            type: "Literal",
            value: v,
            raw: `"${v}"`,
          })),
        },
        property: { type: "Identifier", name: "includes" },
        computed: false,
        optional: false,
      },
      arguments: [
        {
          // props.propName 형태로 생성 (createBinaryCondition과 동일)
          // CreateJsxTree에서 props.X를 X로 변환함
          type: "MemberExpression",
          object: { type: "Identifier", name: "props" },
          property: { type: "Identifier", name: propName },
          computed: false,
          optional: false,
        },
      ],
      optional: false,
    } as unknown as ConditionNode;
  }

  /**
   * 이진 비교 조건(===) 생성
   * props.propName === value 형태의 ConditionNode 생성
   * @param propName - prop 이름
   * @param value - 비교할 값
   * @returns 이진 비교 형태의 ConditionNode
   */
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

  /**
   * SuperTreeNode를 깊은 복사
   * 순환 참조(parent)를 제외하고 복사 후 parent 관계를 복원
   * @param tree - 복사할 SuperTreeNode
   * @returns 깊은 복사된 SuperTreeNode
   */
  public deepCloneTree(tree: SuperTreeNode): SuperTreeNode {
    // 순환 참조(parent) 제외하고 복사 후, parent 관계 복원
    const clone = (node: SuperTreeNode, parentNode: SuperTreeNode | null = null): SuperTreeNode => {
      const { parent, children, ...rest } = node;
      const clonedNode: any = {
        ...JSON.parse(JSON.stringify(rest)), // deep clone (parent 제외)
        parent: parentNode,
        children: [],
      };

      clonedNode.children = children.map((child) =>
        clone(child as any, clonedNode)
      );
      return clonedNode;
    };
    return clone(tree);
  }

  /**
   * 주어진 노드에서 루트 COMPONENT 노드를 찾아 반환
   * 부모 방향으로 탐색하며 type이 "COMPONENT"인 노드를 찾음
   * @param node - 시작 노드
   * @returns 루트 COMPONENT 노드 또는 탐색 종료 시 현재 노드
   */
  public getRootComponentNode(node: SuperTreeNode) {
    const visited = new Set<string>();
    while (node) {
      // 무한루프 방지
      if (visited.has(node.id)) {
        return node; // 순환 참조 감지, 현재 노드 반환
      }
      visited.add(node.id);

      if (node.type === "COMPONENT") return node;
      node = node.parent as SuperTreeNode;
    }

    return node;
  }

  /**
   * ID로 노드를 찾아 반환 (BFS 탐색)
   * @param tree - 탐색할 루트 노드
   * @param id - 찾을 노드 ID
   * @returns 찾은 노드 또는 null
   */
  public findNodeById(
    tree: SuperTreeNode,
    id: string
  ): SuperTreeNode | null {
    let foundNode: SuperTreeNode | null = null;

    traverseBFS(tree, (node) => {
      if (node.id === id) {
        foundNode = node;
        return false; // 순회 중단
      }
    });

    return foundNode;
  }

  /**
   * 노드의 형제 간 인덱스를 반환
   * @param node - 인덱스를 확인할 노드
   * @returns 형제 배열 내 인덱스, 부모가 없으면 -1
   */
  public getSiblingIndex(node: SuperTreeNode) {
    const parent = node.parent as SuperTreeNode;

    if (!parent) return -1;
    const index = parent.children.indexOf(node);
    return index;
  }

  /**
   * 다음 형제 노드를 반환
   * @param node - 기준 노드
   * @returns 다음 형제 노드 또는 null/undefined
   */
  public getNextSiblingNode(node: SuperTreeNode) {
    const parent = node.parent;
    const index = this.getSiblingIndex(node);

    if (!parent) return null;
    return parent.children[index + 1];
  }

  /**
   * ConditionNode AST를 { propName: value } 형태로 파싱
   * @param condition - 파싱할 ConditionNode
   * @returns prop 이름과 값의 Record 객체
   * @example
   * // 입력: props.Size === "Large" && props.Disabled === "True"
   * // 출력: { Size: "Large", Disabled: "True" }
   */
  public parseConditionToRecord(
    condition: ConditionNode
  ): Record<string, string> {
    const result: Record<string, string> = {};

    const extract = (node: any) => {
      if (node.type === "BinaryExpression") {
        const operator = node.operator as string;

        if (operator === "&&" || operator === "||") {
          // 복합 조건: 좌우 재귀 탐색
          extract(node.left);
          extract(node.right);
        } else if (operator === "===") {
          // 단일 비교: props.X === "value"
          const left = node.left;
          const right = node.right;

          if (
            left.type === "MemberExpression" &&
            left.object?.name === "props" &&
            right.type === "Literal"
          ) {
            const propName = left.property?.name;
            const propValue = right.value;
            if (propName && propValue !== undefined) {
              result[propName] = String(propValue);
            }
          }
        }
      }
    };

    extract(condition);
    return result;
  }
}

/**
 * Union-Find 헬퍼 클래스
 * 경로 압축을 지원하는 Disjoint Set 자료구조
 */
export class UnionFind {
  private parent: Map<string, string> = new Map();

  /**
   * ID의 루트를 찾아 반환 (경로 압축 적용)
   * @param id - 찾을 노드 ID
   * @returns 루트 노드 ID
   */
  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id);
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)!)); // 경로 압축
    }
    return this.parent.get(id)!;
  }

  /**
   * 두 ID를 같은 집합으로 합침
   * @param id1 - 첫 번째 노드 ID
   * @param id2 - 두 번째 노드 ID
   */
  union(id1: string, id2: string) {
    const root1 = this.find(id1);
    const root2 = this.find(id2);
    if (root1 !== root2) {
      this.parent.set(root2, root1);
    }
  }
}

/**
 * 방향 그래프 클래스
 * 인접 리스트 기반 방향 그래프 구현
 */
export class DirectedGraph {
  private adjacencyList: Map<string, Set<string>> = new Map();
  private nodes: Set<string> = new Set();

  /**
   * 그래프에 노드 추가
   * @param nodeId - 추가할 노드 ID
   */
  addNode(nodeId: string) {
    this.nodes.add(nodeId);
    if (!this.adjacencyList.has(nodeId)) {
      this.adjacencyList.set(nodeId, new Set());
    }
  }

  /**
   * 그래프에 방향 간선 추가
   * @param from - 출발 노드 ID
   * @param to - 도착 노드 ID
   */
  addEdge(from: string, to: string) {
    this.addNode(from);
    this.addNode(to);
    this.adjacencyList.get(from)!.add(to);
  }

  /**
   * 간선 존재 여부 확인
   * @param from - 출발 노드 ID
   * @param to - 도착 노드 ID
   * @returns 간선이 존재하면 true
   */
  hasEdge(from: string, to: string): boolean {
    return this.adjacencyList.get(from)?.has(to) ?? false;
  }

  /**
   * 모든 노드 반환
   * @returns 노드 ID Set
   */
  getNodes(): Set<string> {
    return this.nodes;
  }

  /**
   * 모든 간선 반환
   * @returns [출발, 도착] 튜플 배열
   */
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
   * from -> to edge를 추가했을 때 사이클이 생기는지 확인
   * (실제로 edge를 추가하지 않고 검사만 함)
   * @param from - 출발 노드 ID
   * @param to - 도착 노드 ID
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
   * @param nodeA - 병합될 노드 ID
   * @param nodeB - 병합 대상 노드 ID
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
   * (노드 제거 시 incoming -> outgoing을 연결하는 transitivity 적용)
   * @param nodeToRemove - 제거할 노드 ID
   * @returns 사이클이 생기면 true, 아니면 false
   * @example
   * // Icon1 -> Text -> Icon2 에서 Text 제거 시
   * // Icon1 -> Icon2 연결이 추가됨
   * // 만약 이미 Icon2 -> Icon1 경로가 있다면 사이클 발생
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
   * @param from - 출발 노드 ID
   * @param to - 도착 노드 ID
   * @returns 경로가 존재하면 true
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

const helper = new HelperManager();

export default helper;
