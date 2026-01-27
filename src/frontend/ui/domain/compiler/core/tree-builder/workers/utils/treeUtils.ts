/**
 * Tree Traversal Utilities
 */

import type { InternalNode } from "../VariantProcessor";

/**
 * InternalNode 트리를 순회하며 각 노드에 대해 콜백 실행
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
 */
export function flattenTree(root: InternalNode): InternalNode[] {
  const result: InternalNode[] = [];
  traverseTree(root, (node) => result.push(node));
  return result;
}
