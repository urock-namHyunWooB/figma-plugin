import { SceneNode } from "../../../types/figma-api";
import { StructureNode, FixedStructureNode, SlotStructureNode } from "./types";
import { computeStructureHash } from "./hasher";
import { normalizeNodes } from "./normalizer";

/**
 * 여러 Variant 노드들을 분석하여 공통 구조 트리로 병합합니다.
 * 진입점: 외부에서 호출 시 정규화를 수행합니다.
 */
export function mergeStructureNodes(
  nodes: readonly SceneNode[],
  variants: readonly SceneNode[]
): StructureNode {
  const normalizedNodes = normalizeNodes(nodes);
  const normalizedVariants = normalizeNodes(variants);

  return mergeNormalizedNodes(normalizedNodes, normalizedVariants);
}

function mergeNormalizedNodes(
  nodes: SceneNode[],
  rootVariants: SceneNode[]
): StructureNode {
  // nodes가 비어있거나 유효하지 않은 경우는 호출 측에서 필터링했어야 함.
  // 하지만 가짜 노드(NONE)만 넘어오는 경우를 대비해 방어 코드
  const validNodes = nodes.filter((n) => n && n.type !== "NONE");
  const primaryNode = validNodes.length > 0 ? validNodes[0] : nodes[0];

  // 모든 노드가 NONE인 경우 (이런 경우는 없어야 하지만)
  if (primaryNode.type === "NONE") {
    return createSlotNode(nodes, rootVariants);
  }

  const primaryHash = computeStructureHash(primaryNode);

  // 1. 완전 일치 확인 (가짜 노드가 섞여있으면 해시가 달라지므로 자동으로 걸러짐)
  const allHashesMatch = nodes.every(
    (node) => computeStructureHash(node) === primaryHash
  );

  if (allHashesMatch) {
    return createFixedNode(primaryNode, nodes, rootVariants, true);
  }

  // 2. 껍데기 비교
  if (areStructurePropsEqual(nodes)) {
    return createFixedNode(primaryNode, nodes, rootVariants, false);
  }

  // 3. 불일치 (Slot 처리)
  return createSlotNode(nodes, rootVariants);
}

function createFixedNode(
  primary: SceneNode,
  nodes: SceneNode[],
  rootVariants: SceneNode[],
  deepMatch: boolean
): FixedStructureNode {
  let children: StructureNode[] = [];

  if ("children" in primary) {
    if (deepMatch) {
      // 해시 완벽 일치: 첫 번째 노드 기준
      children = primary.children.map((child: SceneNode) =>
        mergeNormalizedNodes([child], [child])
      );
    } else {
      // 해시 불일치: 모든 Variant 자식들의 합집합(Union)을 생성하여 순회
      const allChildNames = unifyChildNames(nodes);

      children = allChildNames.map((childName) => {
        const childGroup = nodes.map((parentNode) => {
          if (!("children" in parentNode)) return null;

          // 이름으로 매칭 시도
          const target = parentNode.children.find((c) => c.name === childName);

          // 찾으면 반환, 없으면 null (가짜 노드 처리 필요)
          return target || null;
        });

        const validChildGroup = childGroup.map((c) =>
          c
            ? c
            : ({
                type: "NONE",
                id: "missing",
                name: "Missing",
              } as any)
        );

        return mergeNormalizedNodes(validChildGroup, rootVariants);
      });
    }
  }

  return {
    kind: "FIXED",
    id: primary.id,
    name: primary.name,
    originalType: primary.type,
    hash: computeStructureHash(primary),
    children,
    variants: [...nodes],
  };
}

function createSlotNode(
  nodes: readonly SceneNode[],
  rootVariants: readonly SceneNode[]
): SlotStructureNode {
  // primary가 NONE일 수 있으므로 유효한 노드 찾기
  const primary = nodes.find((n) => n.type !== "NONE") || nodes[0];
  const variantMap: Record<string, StructureNode | null> = {};

  rootVariants.forEach((variant, index) => {
    const targetNode = nodes[index];

    if (targetNode && targetNode.type !== "NONE") {
      // 단일 노드 변환 (자기 자신과의 비교)
      variantMap[variant.id] = mergeNormalizedNodes([targetNode], [variant]);
    } else {
      variantMap[variant.id] = null;
    }
  });

  return {
    kind: "SLOT",
    id: primary.id,
    name: "Slot",
    originalType: "SLOT",
    hash: "slot-" + primary.id,
    variantMap,
  };
}

function areStructurePropsEqual(nodes: readonly SceneNode[]): boolean {
  // 가짜 노드가 하나라도 섞여있으면 구조 불일치로 간주 -> Slot
  if (nodes.some((n) => n.type === "NONE")) return false;

  const first = nodes[0];
  const firstHashWithoutChildren = computeShallowHash(first);
  return nodes.every((n) => computeShallowHash(n) === firstHashWithoutChildren);
}

function computeShallowHash(node: SceneNode): string {
  const parts: string[] = [];
  parts.push(node.type);

  if ("layoutMode" in node) parts.push(`lm:${node.layoutMode}`);
  if ("children" in node) parts.push(`childCount:${node.children.length}`);

  return parts.join("|");
}

/**
 * 모든 Variant의 자식 이름들을 수집하여 중복 없는 순서 리스트 생성
 * (단순 구현: 등장 순서대로 병합)
 */
function unifyChildNames(nodes: SceneNode[]): string[] {
  const names = new Set<string>();

  // 가장 자식이 많은 노드를 기준으로 삼으면 순서 보존에 유리함 (선택사항)
  // 여기서는 단순하게 모든 노드를 순회하며 Set에 추가
  nodes.forEach((node) => {
    if ("children" in node) {
      node.children.forEach((child) => {
        names.add(child.name);
      });
    }
  });

  return Array.from(names);
}
