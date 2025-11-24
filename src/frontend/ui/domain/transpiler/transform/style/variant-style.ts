import type { BaseStyleProperties } from "@backend/types/styles";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type {
  CSSStyleValue,
  LayoutTreeNode,
} from "@backend/managers/ComponentStructureManager";

import { buildStyleTree } from "./layoutTreeConverter";
import type { StyleTreeNode } from "../../types/styles";

import { VariantStyleIR } from "../../types";

/**
 * spec의 variantPatterns를 처리하여 variant style을 생성
 * @param spec ComponentSetNodeSpec
 * @param sharedBaseStyle 공유할 baseStyle (중복 제거를 위해 링킹)
 */
export function buildVariantStyles(
  spec: ComponentSetNodeSpec,
  sharedBaseStyle?: StyleTreeNode | null
): Map<string, VariantStyleIR> {
  const variantStyleMap = new Map<string, VariantStyleIR>();

  // baseStyle을 트리 형태로 생성 (공유된 baseStyle이 있으면 사용, 없으면 새로 생성)
  const baseStyleTree = sharedBaseStyle ?? buildStyleTree(spec.layoutTree);

  if (!spec.variantPatterns) {
    return variantStyleMap;
  }

  // variantPatterns에서 각 prop별로 variant style 생성
  for (const [propName, variantPatterns] of Object.entries(
    spec.variantPatterns
  )) {
    const variantStyle = buildVariantStyleIR(
      propName,
      variantPatterns as Record<string, unknown>,
      baseStyleTree,
      spec.layoutTree
    );
    variantStyleMap.set(propName, variantStyle);
  }

  return variantStyleMap;
}

/**
 * VariantStyleIR 생성
 * variantPatterns를 처리하여 baseStyle과 각 옵션별 델타를 계산
 */
function buildVariantStyleIR(
  variantPropName: string,
  variantPatterns: Record<string, unknown>,
  baseStyleTree: StyleTreeNode | null,
  layoutTree: LayoutTreeNode | null
): VariantStyleIR {
  const variantStyles: Record<string, StyleTreeNode | null> = {};

  // 각 옵션 값별로 variantStyle 계산 및 델타 추출
  for (const [variantValue, pattern] of Object.entries(variantPatterns)) {
    // pattern을 트리 형태로 변환
    const variantStyleTree = convertPatternToStyleTree(
      pattern as Record<string, unknown>,
      layoutTree
    );

    // baseStyleTree와 variantStyleTree를 비교하여 델타 계산
    const deltaTree = diffStyleTree(baseStyleTree, variantStyleTree);
    variantStyles[variantValue] = deltaTree;
  }

  return {
    id: variantPropName,
    propName: variantPropName,
    baseStyle: baseStyleTree,
    variantStyles,
  };
}

/**
 * variantPattern을 StyleTree로 변환
 * pattern이 노드 ID별로 구조화되어 있으면 각 노드별로 변환하고,
 * 그렇지 않으면 루트 노드의 스타일만 변환
 */
function convertPatternToStyleTree(
  pattern: Record<string, unknown>,
  layoutTree: LayoutTreeNode | null
): StyleTreeNode | null {
  if (!layoutTree) {
    return null;
  }

  // pattern이 노드 ID를 키로 하는 객체인지 확인
  // (layoutTree의 노드 ID들과 매칭되는지 확인)
  const nodeIds = collectNodeIds(layoutTree);
  const hasNodeIdKeys = Object.keys(pattern).some((key) => nodeIds.has(key));

  if (hasNodeIdKeys) {
    // 노드 ID별로 구조화된 경우: 각 노드별로 스타일 트리 생성
    return buildStyleTreeFromNodePatterns(pattern, layoutTree);
  } else {
    // 루트 노드의 스타일만 있는 경우: 루트 노드에만 적용
    // variantStyles의 style은 항상 CSSStyleValue 형태여야 하므로 layoutTree.style 사용
    const rootStyle = layoutTree.style;

    return {
      id: layoutTree.id,
      style: rootStyle,
      figmaStyle: (pattern as BaseStyleProperties) || layoutTree.figmaStyle,
      children: layoutTree.children.map((child) => {
        const childStyleTree = buildStyleTree(child);
        return (
          childStyleTree || {
            id: child.id,
            style: {} as CSSStyleValue,
            figmaStyle: {} as BaseStyleProperties,
            children: [],
          }
        );
      }),
    };
  }
}

/**
 * layoutTree에서 모든 노드 ID 수집
 */
function collectNodeIds(node: LayoutTreeNode | null): Set<string> {
  const ids = new Set<string>();
  if (!node) return ids;

  const traverse = (n: LayoutTreeNode) => {
    ids.add(n.id);
    n.children.forEach(traverse);
  };

  traverse(node);
  return ids;
}

/**
 * 노드 ID별 패턴으로부터 StyleTree 생성
 */
function buildStyleTreeFromNodePatterns(
  patterns: Record<string, unknown>,
  layoutTree: LayoutTreeNode
): StyleTreeNode {
  const nodePattern = patterns[layoutTree.id] as
    | BaseStyleProperties
    | CSSStyleValue
    | undefined;

  // variantStyles의 style은 항상 CSSStyleValue 형태여야 함
  // nodePattern이 CSSStyleValue 형태라면 사용, 아니면 layoutTree.style 사용
  const style: CSSStyleValue =
    nodePattern &&
    typeof nodePattern === "object" &&
    !(
      "width" in nodePattern ||
      "height" in nodePattern ||
      "fills" in nodePattern
    ) &&
    Object.keys(nodePattern).every(
      (key) => typeof (nodePattern as any)[key] === "string"
    )
      ? (nodePattern as CSSStyleValue)
      : layoutTree.style;

  // 자식 노드들 재귀적으로 변환
  const children: StyleTreeNode[] = layoutTree.children.map((child) => {
    return buildStyleTreeFromNodePatterns(patterns, child);
  });

  const { id: _, children: __, style: ___, ...figmaStyle } = layoutTree;

  return {
    id: layoutTree.id,
    style,
    figmaStyle: (nodePattern as BaseStyleProperties) || figmaStyle,
    children,
  };
}

/**
 * 두 스타일 트리를 비교하여 델타만 추출
 * baseStyleTree와 variantStyleTree의 차이만 반환 (트리 형태)
 */
function diffStyleTree(
  baseTree: StyleTreeNode | null,
  variantTree: StyleTreeNode | null
): StyleTreeNode | null {
  if (!variantTree) {
    return null;
  }

  if (!baseTree) {
    // baseTree가 없으면 variantTree 전체를 반환
    return variantTree;
  }

  // 현재 노드의 스타일 델타 계산
  // variantStyles의 style은 항상 CSSStyleValue ({ [key: string]: string }) 형태
  const styleDelta: CSSStyleValue = {};
  const variantStyle = variantTree.style;
  const baseStyle = baseTree.style;

  for (const [key, value] of Object.entries(variantStyle)) {
    // baseTree에 없거나 값이 다른 경우
    if (!(key in baseStyle) || baseStyle[key] !== value) {
      styleDelta[key] = value;
    }
  }

  // 델타가 없고 자식도 없으면 null 반환
  if (
    Object.keys(styleDelta).length === 0 &&
    variantTree.children.length === 0
  ) {
    return null;
  }

  // 자식 노드들 재귀적으로 비교
  const children: StyleTreeNode[] = [];
  const maxChildren = Math.max(
    baseTree.children.length,
    variantTree.children.length
  );

  for (let i = 0; i < maxChildren; i++) {
    const baseChild = baseTree.children[i] || null;
    const variantChild = variantTree.children[i] || null;

    if (variantChild) {
      const childDelta = diffStyleTree(baseChild, variantChild);
      if (childDelta) {
        children.push(childDelta);
      }
    }
  }

  // 스타일 델타가 없고 자식도 없으면 null 반환
  if (Object.keys(styleDelta).length === 0 && children.length === 0) {
    return null;
  }

  return {
    id: variantTree.id,
    style: styleDelta,
    figmaStyle: variantTree.figmaStyle,
    children,
  };
}
