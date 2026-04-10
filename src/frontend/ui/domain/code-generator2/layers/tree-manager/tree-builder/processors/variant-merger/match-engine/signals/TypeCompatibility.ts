import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/** Shape 계열 타입 — Figma가 같은 도형을 다른 타입으로 표현할 수 있으므로 상호 호환 */
const SHAPE_TYPES: ReadonlySet<string> = new Set([
  "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
]);

/** 컨테이너 계열 타입 — Figma가 variant에 따라 GROUP↔FRAME을 바꿀 수 있으므로 상호 호환 */
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * 두 노드의 Figma type 호환성 신호.
 *
 * 판정:
 * - 같은 type → score 1
 * - 둘 다 SHAPE_TYPES → score 1 (cross-shape 허용)
 * - 둘 다 CONTAINER_TYPES → score 1 (GROUP↔FRAME 허용)
 * - 그 외 → veto
 *
 * 이 신호는 기존 NodeMatcher.isSameNode Step 1을 정확히 재현한다.
 */
export class TypeCompatibility implements MatchSignal {
  readonly name = "TypeCompatibility";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.type === b.type) {
      return { kind: "neutral", reason: `same type: ${a.type}` };
    }
    if (SHAPE_TYPES.has(a.type) && SHAPE_TYPES.has(b.type)) {
      return { kind: "neutral", reason: `shape group: ${a.type}↔${b.type}` };
    }
    if (CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type)) {
      return { kind: "neutral", reason: `container group: ${a.type}↔${b.type}` };
    }
    return { kind: "veto", reason: `incompatible types: ${a.type}↔${b.type}` };
  }
}
