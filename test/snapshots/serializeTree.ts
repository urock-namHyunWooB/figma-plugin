import type { InternalNode } from "@code-generator2/types/types";

/**
 * Tree → snapshot용 안정적 직렬화.
 *
 * 목적:
 * 1. parent 역참조 같은 순환 제거
 * 2. 결정론적이지 않은 필드(디버그 metadata 등) 제외
 * 3. children 순서는 그대로 유지 (매칭 결과를 반영하므로)
 *
 * 포함 필드: id, name, type, visible?, mergedNodes(축약), children(재귀)
 * 또한 styles/props 같은 핵심 필드는 포함하되, 객체 키를 정렬해 diff 재현성을 높인다.
 */
export function serializeTree(node: InternalNode): unknown {
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  const anyNode = node as any;
  if (typeof anyNode.visible === "boolean") out.visible = anyNode.visible;
  if (Array.isArray(anyNode.mergedNodes)) {
    out.mergedNodes = anyNode.mergedNodes.map((m: any) => ({
      id: m.id,
      variantName: m.variantName,
    }));
  }
  if (anyNode.refId) out.refId = anyNode.refId;
  if (Array.isArray(node.children)) {
    out.children = node.children.map((c) => serializeTree(c));
  }
  return out;
}
