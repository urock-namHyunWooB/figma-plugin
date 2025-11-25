import { StyleTreeNode } from "@frontend/ui/domain/transpiler/types/styles";
import {
  BaseStyleTree,
  FigmaNodeData,
  StyleTree,
} from "@frontend/ui/domain/transpiler/types/figma-api";
import { BaseStyleProperties } from "@backend";

/**
 * figmaNodeData에 있는 figmaStyle을 styleTree에 붙여서 리턴
 */
export function buildStyleTree(
  figmaNodeData: FigmaNodeData
): BaseStyleTree | null {
  if (!figmaNodeData) return null;

  const styleTree = figmaNodeData.styleTree;
  if (!styleTree) {
    return null;
  }

  const styleTreeIdMap = {
    [styleTree.id]: styleTree,
  };

  const traverse = (node: StyleTree) => {
    styleTreeIdMap[node.id] = node;
    for (const child of node.children) {
      traverse(child);
    }
  };

  traverse(styleTree);

  /**
   * figmaNodeData.document를 전부 순회해서 styleTree.id와 매칭되는 노드를 찾아서 styleTree에 붙여서 리턴
   */

  const traverseNode = (node: SceneNode) => {
    const { ...figmaStyle } = node;

    if (styleTreeIdMap[node.id]) {
      styleTreeIdMap[node.id].figmaStyle = figmaStyle as BaseStyleProperties;
    }

    if (!("children" in node) || !node.children || node.children.length === 0) {
      return;
    }

    for (const child of node.children) {
      traverseNode(child);
    }
  };

  traverseNode(figmaNodeData.info.document);

  return getBaseStyleTree(figmaNodeData.styleTree);
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

/**
 * 노드의 모든 하위 자식 노드의 총 개수를 재귀적으로 계산
 */
function countAllDescendants(node: StyleTree): number {
  if (!node.children || node.children.length === 0) {
    return 0;
  }

  let total = node.children.length;
  for (const child of node.children) {
    total += countAllDescendants(child);
  }
  return total;
}

/**
 * ComponentSetNode의 StyleTree에서 baseStyleTree를 찾아서 리턴
 * baseStyleTree는 ComponentSetNode의 자식 노드 중에서 모든 하위 자식 노드의 총 개수가 가장 많은 노드를 찾아서 리턴
 */
function getBaseStyleTree(
  figmaNodeData: StyleTree | null
): BaseStyleTree | null {
  if (!figmaNodeData) return null;

  // 자식이 없으면 자기 자신을 반환
  if (!figmaNodeData.children || figmaNodeData.children.length === 0) {
    return null;
  }

  // 자식 노드들 중에서 모든 하위 자식 노드의 총 개수가 가장 많은 노드를 찾기
  let baseStyleTree: StyleTree | null = null;
  let maxChildrenCount = -1;

  for (const child of figmaNodeData.children) {
    const totalChildrenCount = countAllDescendants(child);
    if (totalChildrenCount > maxChildrenCount) {
      maxChildrenCount = totalChildrenCount;
      baseStyleTree = {
        ...child,
      };
    }
  }

  // 자식이 없는 경우가 모두라면 첫 번째 자식을 반환
  if (!baseStyleTree && figmaNodeData.children.length > 0) {
    baseStyleTree = figmaNodeData.children[0];
  }

  const baseVariants: BaseStyleTree["baseVariants"] = baseStyleTree?.figmaStyle
    ?.name
    ? {
        ...parseVariantString(baseStyleTree.figmaStyle.name),
      }
    : {};

  const baseStyleTreeResult = { ...baseStyleTree, baseVariants };

  return baseStyleTreeResult as BaseStyleTree;
}

function parseVariantString(str: string) {
  const result: Record<string, string> = {};

  str.split(",").forEach((pair) => {
    const [rawKey, rawValue] = pair.split("=");
    if (!rawKey || !rawValue) return;

    const key = rawKey.trim();
    const value = rawValue.trim();

    result[key] = value;
  });

  return result;
}
