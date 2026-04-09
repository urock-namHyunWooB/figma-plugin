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

/**
 * 부모 InternalNode의 styles.pseudo 구조에 pseudo-class entry를 병합.
 *
 * Spec §5.3 병합 규칙:
 * - 부모에 styles가 없으면 빈 StyleObject 생성
 * - styles.pseudo가 없으면 빈 객체 생성
 * - 같은 pseudo entry가 이미 있으면 부모의 기존 값 우선 (디자이너가 직접 작성한 게 명시적)
 * - 새 속성만 추가
 * - 빈 style 맵은 효과 없음 (entry 자체는 생성)
 */
export function mergePseudoIntoParent(
  parent: InternalNode,
  pseudo: PseudoClass,
  style: Record<string, string | number>,
): void {
  if (!parent.styles) {
    parent.styles = { base: {}, dynamic: [] };
  }
  if (!parent.styles.pseudo) {
    parent.styles.pseudo = {};
  }
  const existing = parent.styles.pseudo[pseudo] ?? {};
  const merged: Record<string, string | number> = { ...existing };
  for (const [key, value] of Object.entries(style)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }
  parent.styles.pseudo[pseudo] = merged;
}
