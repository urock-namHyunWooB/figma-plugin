/**
 * 트리 순회 유틸리티 함수
 *
 * BFS(너비 우선 탐색) 기반으로 트리를 순회합니다.
 */

import { SuperTreeNode } from "@compiler";

/**
 * children 배열을 가진 트리 노드 인터페이스
 */
export interface TraversableNode {
  children: (TraversableNode | undefined)[];
  [key: string]: any;
}

/**
 * BFS 콜백에 전달되는 메타데이터
 */
export interface TraverseMeta<T> {
  /** 현재 깊이 (루트 = 0) */
  depth: number;
  /** 부모 노드 (루트는 null) */
  parent: T | null;
  /** 부모의 children 배열에서의 인덱스 */
  index: number;
}

/**
 * BFS(너비 우선 탐색)로 트리를 순회합니다.
 *
 * @param node 시작 노드 (루트)
 * @param callback 각 노드에 대해 실행할 콜백. false를 반환하면 순회 중단
 *
 * @example
 * // 기본 사용
 * traverseBFS(tree, (node, meta) => {
 *   console.log(`depth ${meta.depth}:`, node.name);
 * });
 *
 * @example
 * // 조기 종료
 * traverseBFS(tree, (node) => {
 *   if (node.id === targetId) {
 *     return false; // 순회 중단
 *   }
 * });
 *
 * @example
 * // 계층별 처리
 * traverseBFS(tree, (node, { depth, parent }) => {
 *   if (depth === 2) {
 *     // 2번째 깊이의 노드만 처리
 *   }
 * });
 */
export function traverseBFS<T extends TraversableNode>(
  node: T,
  callback: (node: T, meta: TraverseMeta<T>) => boolean | void
): void {
  interface QueueItem {
    node: T;
    depth: number;
    parent: T | null;
    index: number;
  }

  const queue: QueueItem[] = [{ node, depth: 0, parent: null, index: 0 }];

  while (queue.length > 0) {
    const { node: current, depth, parent, index } = queue.shift()!;

    // 콜백 실행, false 반환 시 순회 중단
    const result = callback(current, { depth, parent, index });
    if (result === false) {
      return;
    }

    // 자식 노드들을 큐에 추가
    current.children.forEach((child, childIndex) => {
      if (child !== undefined) {
        queue.push({
          node: child as T,
          depth: depth + 1,
          parent: current,
          index: childIndex,
        });
      }
    });
  }
}

/**
 * BFS로 조건에 맞는 첫 번째 노드를 찾습니다.
 *
 * @param node 시작 노드 (루트)
 * @param predicate 조건 함수
 * @returns 찾은 노드 또는 null
 *
 * @example
 * const found = findNodeBFS(tree, (node) => node.id === targetId);
 */
export function findNodeBFS<T extends TraversableNode>(
  node: T,
  predicate: (node: T, meta: TraverseMeta<T>) => boolean
): T | null {
  let result: T | null = null;

  traverseBFS(node, (current, meta) => {
    if (predicate(current, meta)) {
      result = current;
      return false; // 순회 중단
    }
  });

  return result;
}

/**
 * BFS로 조건에 맞는 모든 노드를 찾습니다.
 *
 * @param node 시작 노드 (루트)
 * @param predicate 조건 함수
 * @returns 찾은 노드 배열
 *
 * @example
 * const nodes = findAllNodesBFS(tree, (node) => node.type === "FRAME");
 */
export function findAllNodesBFS<T extends TraversableNode>(
  node: T,
  predicate: (node: T, meta: TraverseMeta<T>) => boolean
): T[] {
  const results: T[] = [];

  traverseBFS(node, (current, meta) => {
    if (predicate(current, meta)) {
      results.push(current);
    }
  });

  return results;
}

/**
 * BFS로 특정 깊이의 모든 노드를 가져옵니다.
 *
 * @param node 시작 노드 (루트)
 * @param targetDepth 찾을 깊이 (루트 = 0)
 * @returns 해당 깊이의 노드 배열
 *
 * @example
 * const level2Nodes = getNodesAtDepth(tree, 2);
 */
export function getNodesAtDepth<T extends TraversableNode>(
  node: T,
  targetDepth: number
): T[] {
  return findAllNodesBFS(node, (_, meta) => meta.depth === targetDepth);
}
