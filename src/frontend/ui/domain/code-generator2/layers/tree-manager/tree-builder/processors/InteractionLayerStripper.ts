import type { InternalNode, PseudoClass } from "../../../../types/types";

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

/**
 * Figma `State` variant 값을 CSS pseudo-class로 매핑.
 *
 * Spec §5.2 매핑 테이블:
 * - Normal  → null (default state, no pseudo)
 * - Hover   → :hover
 * - Pressed → :active
 * - Focused → :focus
 * - Disabled → :disabled
 *
 * Case-insensitive. 알 수 없는 값은 null 반환.
 */
export function mapFigmaStateToPseudo(state: string): PseudoClass | null {
  const normalized = state.toLowerCase().trim();
  switch (normalized) {
    case "normal":
      return null;
    case "hover":
      return ":hover";
    case "pressed":
      return ":active";
    case "focused":
      return ":focus";
    case "disabled":
      return ":disabled";
    default:
      return null;
  }
}
