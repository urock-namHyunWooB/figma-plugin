import { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import { StyleTreeNode } from "@frontend/ui/domain/transpiler/types/styles";

/**
 * layoutTree를 순회하여 styleTree를 생성
 * 각 노드의 Figma 스타일을 CSS 스타일 객체로 변환
 */
export function buildStyleTree(
  layoutNode: LayoutTreeNode | null | undefined
): StyleTreeNode | null {
  if (!layoutNode) {
    return null;
  }

  // 자식 노드들 재귀적으로 변환
  const children: StyleTreeNode[] = [];
  if (layoutNode.children && Array.isArray(layoutNode.children)) {
    for (const child of layoutNode.children) {
      const childStyleNode = buildStyleTree(child);
      if (childStyleNode) {
        children.push(childStyleNode);
      }
    }
  }

  // id와 children을 제외한 원본 figmaStyle 추출
  const { id: _, children: __ } = layoutNode;

  return {
    id: layoutNode.id,
    style: layoutNode.style,
    figmaStyle: layoutNode.figmaStyle,
    children,
  };
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
