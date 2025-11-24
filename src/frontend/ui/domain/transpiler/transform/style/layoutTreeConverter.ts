import { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import { StyleTreeNode } from "@frontend/ui/domain/transpiler/types/styles";
import {
  FigmaNodeData,
  StyleTree,
} from "@frontend/ui/domain/transpiler/types/figma-api";
import { traverseAST } from "../../utils/ast-tree-utils";

/**
 * figmaNodeData에 있는 figmaStyle을 styleTree에 붙여서 리턴
 */
export function buildStyleTree(figmaNodeData: FigmaNodeData): StyleTree | null {
  const styleTree = figmaNodeData.styleTree;
  if (!styleTree) {
    return null;
  }

  /**
   * figmaNodeData.document를 전부 순회해서 styleTree.id와 매칭되는 노드를 찾아서 styleTree에 붙여서 리턴
   */

  return figmaNodeData.styleTree;
}

/**
 * styleTree에서 특정 ID의 노드 찾기
 */
export function findStyleNodeById(
  styleTree: StyleTreeNode | null,
  id: string
): StyleTreeNode | null {
  if (!styleTree) {
    return null;
  }

  if (styleTree.id === id) {
    return styleTree;
  }

  // 자식 노드들 탐색
  for (const child of styleTree.children) {
    const found = findStyleNodeById(child, id);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * styleTree를 평탄화하여 id -> style 맵으로 변환
 * 빠른 조회를 위한 헬퍼 함수
 */
export function flattenStyleTree(
  styleTree: StyleTreeNode | null
): Map<string, CSSStyleValue> {
  const map = new Map<string, CSSStyleValue>();

  if (!styleTree) {
    return map;
  }

  const traverse = (node: StyleTreeNode) => {
    map.set(node.id, node.style);

    for (const child of node.children) {
      traverse(child);
    }
  };

  traverse(styleTree);
  return map;
}
