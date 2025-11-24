import type { BaseStyleProperties } from "@backend/types/styles";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type {
  CSSStyleValue,
  LayoutTreeNode,
} from "@backend/managers/ComponentStructureManager";

import type { StyleTreeNode } from "../../types/styles";

import { VariantStyleIR } from "../../types";
import { BaseStyleTree, FigmaNodeData, StyleTree } from "../../types/figma-api";

import { findStyleTreeById } from "../../utils/tree-utils";
import VariantUtils from "@frontend/ui/utils/variant";

interface VariantPatterns {
  [key: string]: Record<
    string,
    {
      cssStyle: Record<string, string>;
      figmaStyle: BaseStyleProperties;
      children: VariantPatterns[];
    }
  >;
}

/**
 * spec의 variantPatterns를 처리하여 variant style을 생성
 * @param spec ComponentSetNodeSpec
 * @param sharedBaseStyle 공유할 baseStyle (중복 제거를 위해 링킹)
 */
export function buildVariantStyles(
  spec: FigmaNodeData,
  sharedBaseStyle: BaseStyleTree
): Map<string, VariantStyleIR> | null {
  if (spec.info.document.type !== "COMPONENT_SET") {
    return null;
  }

  const componentSetNode = spec.info.document as ComponentSetNode;
  const variantsMaps: Record<string, StyleTree> = {};

  componentSetNode.children.forEach((child) => {
    if (child.type === "COMPONENT") {
      const component = child as ComponentNode;
      const id = component.id;

      const styleNode = findStyleTreeById(spec.styleTree!, id);
      if (styleNode) {
        variantsMaps[component.name] = styleNode;
      }
    }
  });
  const variantPatterns = VariantUtils.extractVariantPatterns(
    variantsMaps,
    sharedBaseStyle.baseVariants
  );

  const rtn = buildVariantStyleIR(
    variantPatterns,
    sharedBaseStyle,
    componentSetNode.children as ComponentNode[]
  );

  return rtn;
}

/**
 * VariantStyleIR 생성
 * variantPatterns를 처리하여 baseStyle과 각 옵션별 델타를 계산
 * ex) baseVariants = {
    "Size": "Large",
    "State": "Disabled",
    "Left Icon": "True",
    "Right Icon": "False"
  }
    가 이렇게 되어 있고 variantPatterns에서 각 baseVariants의 델타값을 찾아서 세팅한다.
    Size의 다른점을 구하려면 components에서 Size만 다르고 나머지 variants는 똑같은 컴포넌트를 찾아서 비교한다.
 */
function buildVariantStyleIR(
  variantPatterns: VariantPatterns,
  sharedBaseStyle: BaseStyleTree,
  components: ComponentNode[]
) {}

/**
 * 패턴을 baseStyle의 구조를 참고하여 StyleTree로 변환
 */
function convertPatternToStyleTreeFromBase(
  pattern: {
    cssStyle: Record<string, string>;
    figmaStyle: BaseStyleProperties;
  },
  baseStyle: StyleTree | null
): StyleTree | null {
  if (!baseStyle) {
    // baseStyle이 없으면 패턴만으로 StyleTree 생성
    return {
      id: "root",
      cssStyle: pattern.cssStyle,
      figmaStyle: pattern.figmaStyle,
      children: [],
    };
  }

  // baseStyle의 구조를 유지하면서 패턴의 스타일 적용
  const convertNode = (baseNode: StyleTree): StyleTree => {
    return {
      id: baseNode.id,
      cssStyle: pattern.cssStyle, // 패턴의 cssStyle 사용
      figmaStyle: pattern.figmaStyle, // 패턴의 figmaStyle 사용
      children: baseNode.children.map(convertNode),
    };
  };

  return convertNode(baseStyle);
}

/**
 * 두 StyleTree를 비교하여 델타만 추출 (StyleTree 타입용)
 */
function diffStyleTreeForVariant(
  baseTree: StyleTree | null,
  variantTree: StyleTree | null
): StyleTree | null {
  if (!variantTree) {
    return null;
  }

  if (!baseTree) {
    // baseTree가 없으면 variantTree 전체를 반환
    return variantTree;
  }

  // 현재 노드의 스타일 델타 계산
  const cssStyleDelta: { [p: string]: string } = {};
  const variantCssStyle = variantTree.cssStyle || {};
  const baseCssStyle = baseTree.cssStyle || {};

  for (const [key, value] of Object.entries(variantCssStyle)) {
    // baseTree에 없거나 값이 다른 경우
    if (!(key in baseCssStyle) || baseCssStyle[key] !== value) {
      cssStyleDelta[key] = value;
    }
  }

  // 자식 노드들 재귀적으로 비교 (ID 기반)
  const children: StyleTree[] = [];

  // baseTree의 자식들을 ID로 매핑 (빠른 조회를 위해)
  const baseChildrenMap = new Map<string, StyleTree>();
  for (const baseChild of baseTree.children) {
    baseChildrenMap.set(baseChild.id, baseChild);
  }

  // variantTree의 모든 자식을 순회하면서 같은 ID를 가진 baseTree 자식과 비교
  for (const variantChild of variantTree.children) {
    const baseChild = baseChildrenMap.get(variantChild.id) || null;
    const childDelta = diffStyleTreeForVariant(baseChild, variantChild);
    if (childDelta) {
      children.push(childDelta);
    }
  }

  // 스타일 델타가 없고 자식도 없으면 null 반환
  if (Object.keys(cssStyleDelta).length === 0 && children.length === 0) {
    return null;
  }

  return {
    id: variantTree.id,
    cssStyle: cssStyleDelta,
    figmaStyle: variantTree.figmaStyle,
    children,
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

  // pattern이 { cssStyle, figmaStyle } 형태인지 확인
  if ("cssStyle" in pattern && "figmaStyle" in pattern) {
    const cssStyle = (pattern.cssStyle as CSSStyleValue) || {};
    const figmaStyle =
      (pattern.figmaStyle as BaseStyleProperties) || layoutTree.figmaStyle;

    return {
      id: layoutTree.id,
      style: cssStyle,
      figmaStyle: figmaStyle,
      children: layoutTree.children.map((child) => {
        return {
          id: child.id,
          style: child.style,
          figmaStyle: child.figmaStyle,
          children: [],
        };
      }),
    };
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
        return {
          id: child.id,
          style: child.style,
          figmaStyle: child.figmaStyle,
          children: [],
        };
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
