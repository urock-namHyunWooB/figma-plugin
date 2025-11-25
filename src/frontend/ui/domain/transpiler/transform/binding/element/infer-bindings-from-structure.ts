import type {
  FigmaNodeData,
  BaseStyleTree,
  StyleTree,
} from "../../../types/figma-api";
import type { FigmaNodeTree } from "../../../types/tree";

/**
 * Slot 신뢰도: 몇 개의 variant에 노드가 존재하는지
 */
export interface SlotConfidence {
  existsIn: number;
  totalVariants: number;
}

/**
 * baseStyle을 기준으로 모든 variant들과 비교하여 Slot 추론
 *
 * 로직:
 * 1. baseStyle 트리의 각 노드를 순회
 * 2. spec의 모든 variant에서 같은 id의 노드가 있는지 확인
 * 3. 존재 비율을 각 노드의 meta.slot에 저장
 */
export function inferBindingsFromStructureComparison(
  spec: FigmaNodeData,
  baseStyle: BaseStyleTree
): FigmaNodeTree {
  const document = spec.info.document;

  // Helper: StyleTree를 FigmaNodeTree로 변환 (기본 meta 추가)
  const convertToNodeTree = (node: StyleTree): FigmaNodeTree => {
    return {
      ...node,
      meta: {},
      children: node.children?.map(convertToNodeTree) || [],
    };
  };

  if (!document || document.type !== "COMPONENT_SET") {
    // ComponentSet이 아니면 baseStyle을 그대로 반환 (meta만 추가)
    return convertToNodeTree(baseStyle);
  }

  // 모든 variant 컴포넌트
  const variantComponents = document.children || [];
  const totalVariants = variantComponents.length;

  if (totalVariants === 0) {
    return convertToNodeTree(baseStyle);
  }

  // 각 노드를 name+type으로 식별하여 몇 개의 variant에 존재하는지 카운트
  // key: "name|type", value: 존재하는 variant 수
  const nodeExistenceMap = new Map<string, number>();

  // baseStyle 트리의 모든 노드 수집 (name 기준)
  const collectNodeNames = (node: StyleTree): string[] => {
    const names: string[] = [];

    if (node.figmaStyle?.name) {
      names.push(node.figmaStyle.name);
    }

    node.children.forEach((child) => {
      names.push(...collectNodeNames(child));
    });

    return names;
  };

  const baseNodeNames = collectNodeNames(baseStyle);

  // 각 variant를 순회하면서 노드 존재 여부 체크
  variantComponents.forEach((variant) => {
    const variantNodeNames = collectNodeNamesFromVariant(variant);
    const variantNodeSet = new Set(variantNodeNames);

    baseNodeNames.forEach((nodeName) => {
      if (variantNodeSet.has(nodeName)) {
        nodeExistenceMap.set(
          nodeName,
          (nodeExistenceMap.get(nodeName) || 0) + 1
        );
      }
    });
  });

  // baseStyle 트리에 meta 추가
  const addMetaToTree = (node: StyleTree): FigmaNodeTree => {
    const nodeName = node.figmaStyle?.name || "";
    const existsIn = nodeExistenceMap.get(nodeName) || 0;

    return {
      ...node,
      meta: {
        slot: {
          existsIn,
          totalVariants,
        },
      },
      children: node.children.map((child) => addMetaToTree(child)),
    };
  };

  return addMetaToTree(baseStyle);
}

/**
 * Variant 노드에서 모든 하위 노드 이름 수집
 */
function collectNodeNamesFromVariant(variantNode: any): string[] {
  const names: string[] = [];

  const traverse = (node: any) => {
    if (node.name) {
      names.push(node.name);
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any) => traverse(child));
    }
  };

  traverse(variantNode);
  return names;
}
