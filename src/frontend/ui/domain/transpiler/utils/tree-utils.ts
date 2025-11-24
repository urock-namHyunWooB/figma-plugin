import { StyleTree } from "../types/figma-api";

export function findStyleTreeById(
  tree: StyleTree,
  id: string
): StyleTree | undefined {
  if (tree.id === id) {
    return tree;
  }

  for (const child of tree.children) {
    const found = findStyleTreeById(child, id);
    if (found) {
      return found;
    }
  }
}
