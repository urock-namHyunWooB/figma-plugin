import type { ElementASTNode, UnifiedNode } from "../types";

/**
 * AST 트리 순회 유틸리티 함수
 */

/**
 * Path 객체 - 노드와 부모 정보를 함께 관리 (Babel/traverse 패턴)
 */
export class ASTPath {
  public readonly node: ElementASTNode;
  private readonly parent: ElementASTNode | null;
  private readonly index: number | null;

  constructor(
    node: ElementASTNode,
    parent: ElementASTNode | null = null,
    index: number | null = null
  ) {
    this.node = node;
    this.parent = parent;
    this.index = index;
  }

  /**
   * 현재 노드를 부모의 children 배열에서 제거
   * Babel/traverse의 path.remove() 패턴
   */
  public remove(): void {
    if (this.parent !== null && this.index !== null) {
      this.parent.children.splice(this.index, 1);
    }
  }

  /**
   * 부모 노드가 있는지 확인
   */
  public hasParent(): boolean {
    return this.parent !== null;
  }
}

/**
 * AST 트리를 순회하면서 각 노드에 대해 콜백 함수 실행
 *
 * Path 객체를 받는 콜백을 사용하면 노드 제거가 가능합니다.
 * 기존 방식(노드만 받는 콜백)도 계속 지원됩니다.
 *
 * @overload Path 기반 (노드 제거 가능)
 * @param node 시작 노드
 * @param callback Path 객체를 받는 콜백 함수
 *
 * @overload 기존 방식
 * @param node 시작 노드
 * @param callback 노드만 받는 콜백 함수
 *
 * @example
 * // Path 기반 (노드 제거 가능)
 * traverseAST(ast.root, (path) => {
 *   if (path.node.tag === "hr" && path.node.figmaStyles?.height === 0) {
 *     path.remove(); // 노드 제거
 *   }
 * });
 *
 * @example
 * // 기존 방식 (하위 호환)
 * traverseAST(ast.root, (node) => {
 *   console.log(node.id);
 * });
 */
export function traverseAST(
  node: ElementASTNode,
  callback: (path: ASTPath) => void
): void;
export function traverseAST(
  node: ElementASTNode,
  callback: (node: ElementASTNode) => void
): void;
export function traverseAST(
  node: ElementASTNode,
  callback: ((path: ASTPath) => void) | ((node: ElementASTNode) => void),
  parent?: ElementASTNode | null,
  index?: number | null
): void {
  const path = new ASTPath(node, parent ?? null, index ?? null);

  // 역순으로 순회하여 안전하게 제거 가능
  // (뒤에서부터 제거하면 인덱스 변경이 앞쪽에 영향을 주지 않음)
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    // 재귀 호출 시 내부 시그니처 사용
    (traverseAST as any)(child, callback, node, i);
  }

  // 콜백 실행 - Path 객체를 전달
  // Path는 node 속성을 가지므로 기존 코드에서 path.node로 접근하거나
  // Path를 직접 받아서 path.node 또는 path.remove() 사용 가능
  (callback as any)(path);
}

/**
 * AST 트리에서 특정 ID를 가진 노드 찾기
 * @param node 시작 노드
 * @param id 찾을 노드의 ID
 * @returns 찾은 노드 또는 null
 */
export function findNodeById(
  node: ElementASTNode,
  id: string
): ElementASTNode | null {
  if (node.id === id) {
    return node;
  }

  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * AST 트리에서 특정 조건을 만족하는 모든 노드 찾기
 * @param node 시작 노드
 * @param predicate 조건 함수
 * @returns 조건을 만족하는 노드 배열
 */
export function findNodesByPredicate(
  node: ElementASTNode,
  predicate: (node: ElementASTNode) => boolean
): ElementASTNode[] {
  const results: ElementASTNode[] = [];

  if (predicate(node)) {
    results.push(node);
  }

  node.children.forEach((child) => {
    results.push(...findNodesByPredicate(child, predicate));
  });

  return results;
}

/**
 * AST 트리의 모든 노드 ID 수집
 * @param node 시작 노드
 * @returns 노드 ID 배열
 */
export function collectNodeIds(node: ElementASTNode): string[] {
  const ids: string[] = [node.id];
  node.children.forEach((child) => {
    ids.push(...collectNodeIds(child));
  });
  return ids;
}

/**
 * AST 트리의 깊이 계산
 * @param node 시작 노드
 * @returns 트리의 최대 깊이
 */
export function getTreeDepth(node: ElementASTNode): number {
  if (node.children.length === 0) {
    return 1;
  }

  const childDepths = node.children.map((child) => getTreeDepth(child));
  return 1 + Math.max(...childDepths, 0);
}

// ============================================================
// UnifiedNode 전용 유틸리티 함수
// ============================================================

/**
 * UnifiedNode Path 객체 - 노드와 부모 정보를 함께 관리
 */
export class UnifiedNodePath {
  public readonly node: UnifiedNode;
  private readonly parent: UnifiedNode | null;
  private readonly index: number | null;

  constructor(
    node: UnifiedNode,
    parent: UnifiedNode | null = null,
    index: number | null = null
  ) {
    this.node = node;
    this.parent = parent;
    this.index = index;
  }

  /**
   * 현재 노드를 부모의 children 배열에서 제거
   */
  public remove(): void {
    if (this.parent !== null && this.index !== null) {
      this.parent.children.splice(this.index, 1);
    }
  }

  /**
   * 부모 노드가 있는지 확인
   */
  public hasParent(): boolean {
    return this.parent !== null;
  }

  /**
   * 부모 노드 반환
   */
  public getParent(): UnifiedNode | null {
    return this.parent;
  }

  /**
   * 현재 노드가 루트인지 확인
   */
  public isRoot(): boolean {
    return this.parent === null;
  }
}

/**
 * UnifiedNode 트리를 순회하면서 각 노드에 대해 콜백 함수 실행
 *
 * @param node 시작 노드
 * @param callback Path 객체 또는 노드를 받는 콜백 함수
 *
 * @example
 * // Path 기반 (노드 제거 가능)
 * traverseUnifiedNode(ast, (path) => {
 *   console.log(path.node.name);
 *   if (someCondition) path.remove();
 * });
 *
 * @example
 * // 노드만 받는 콜백
 * traverseUnifiedNode(ast, (node) => {
 *   console.log(node.id, node.name);
 * });
 */
export function traverseUnifiedNode(
  node: UnifiedNode,
  callback: (path: UnifiedNodePath) => void
): void;
export function traverseUnifiedNode(
  node: UnifiedNode,
  callback: (node: UnifiedNode) => void
): void;
export function traverseUnifiedNode(
  node: UnifiedNode,
  callback: ((path: UnifiedNodePath) => void) | ((node: UnifiedNode) => void),
  parent?: UnifiedNode | null,
  index?: number | null
): void {
  const path = new UnifiedNodePath(node, parent ?? null, index ?? null);

  // 역순으로 순회하여 안전하게 제거 가능
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    (traverseUnifiedNode as any)(child, callback, node, i);
  }

  // 콜백 실행 - Path 객체를 전달
  (callback as any)(path);
}

/**
 * UnifiedNode 트리에서 특정 ID를 가진 노드 찾기
 * @param node 시작 노드
 * @param id 찾을 노드의 ID
 * @returns 찾은 노드 또는 null
 */
export function findUnifiedNodeById(
  node: UnifiedNode,
  id: string
): UnifiedNode | null {
  if (node.id === id) {
    return node;
  }

  for (const child of node.children) {
    const found = findUnifiedNodeById(child, id);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * UnifiedNode 트리에서 특정 조건을 만족하는 모든 노드 찾기
 * @param node 시작 노드
 * @param predicate 조건 함수
 * @returns 조건을 만족하는 노드 배열
 */
export function findUnifiedNodesByPredicate(
  node: UnifiedNode,
  predicate: (node: UnifiedNode) => boolean
): UnifiedNode[] {
  const results: UnifiedNode[] = [];

  if (predicate(node)) {
    results.push(node);
  }

  node.children.forEach((child) => {
    results.push(...findUnifiedNodesByPredicate(child, predicate));
  });

  return results;
}

/**
 * UnifiedNode 트리를 평탄화하여 모든 노드 배열로 반환
 * @param node 시작 노드
 * @returns 모든 노드 배열 (DFS 순서)
 */
export function flattenUnifiedNodes(node: UnifiedNode): UnifiedNode[] {
  const nodes: UnifiedNode[] = [node];

  node.children.forEach((child) => {
    nodes.push(...flattenUnifiedNodes(child));
  });

  return nodes;
}
