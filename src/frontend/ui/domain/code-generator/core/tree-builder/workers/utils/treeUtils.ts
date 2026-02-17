/**
 * Tree Traversal Utilities
 *
 * InternalNode 트리를 순회/변환하기 위한 공유 유틸리티.
 * 각 Processor에서 반복되는 인라인 순회 클로저를 이 유틸리티로 대체합니다.
 */

import type { InternalNode } from "../interfaces";

/**
 * InternalNode 트리를 순회하며 각 노드에 대해 콜백 실행 (DFS)
 * @param root - 루트 노드
 * @param callback - 각 노드에 대해 실행할 콜백 함수
 */
export function traverseTree(
  root: InternalNode,
  callback: (node: InternalNode, parent: InternalNode | null) => void
): void {
  const traverse = (node: InternalNode, parent: InternalNode | null) => {
    callback(node, parent);
    for (const child of node.children) {
      traverse(child, node);
    }
  };
  traverse(root, null);
}

/**
 * InternalNode 트리를 flat한 배열로 변환
 * @param root - 루트 노드
 * @returns 트리의 모든 노드를 담은 배열
 */
export function flattenTree(root: InternalNode): InternalNode[] {
  const result: InternalNode[] = [];
  traverseTree(root, (node) => result.push(node));
  return result;
}

/**
 * InternalNode 트리를 다른 타입의 트리로 재귀적 변환 (map)
 *
 * NodeConverter.assemble 등에서 InternalNode → DesignNode 변환에 사용
 * @param root - 루트 노드
 * @param mapper - 노드와 변환된 자식들을 받아 새 타입으로 변환하는 함수
 * @returns 변환된 트리의 루트
 */
export function mapTree<T>(
  root: InternalNode,
  mapper: (node: InternalNode, mappedChildren: T[]) => T
): T {
  const map = (node: InternalNode): T => {
    const mappedChildren = node.children.map(map);
    return mapper(node, mappedChildren);
  };
  return map(root);
}
