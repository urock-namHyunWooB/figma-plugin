import type { InternalNode } from "../../../../types/types";

/**
 * Interaction layer 감지.
 *
 * Spec §4 감지 규칙:
 * - name === "Interaction" (case-sensitive)
 * - type === "FRAME"
 * - children.length <= 1 (defensive: 2+ children은 strip 안 함)
 *
 * children type 제약은 의도적으로 없음 — 중첩 Interaction의 외곽 frame은
 * 자식이 FRAME(또 다른 Interaction)이고, 일반 case는 자식이 INSTANCE.
 * 둘 다 지원.
 */
export function isInteractionLayer(node: InternalNode): boolean {
  if (node.type !== "FRAME") return false;
  if (node.name !== "Interaction") return false;
  const children = node.children ?? [];
  if (children.length > 1) return false;
  return true;
}
