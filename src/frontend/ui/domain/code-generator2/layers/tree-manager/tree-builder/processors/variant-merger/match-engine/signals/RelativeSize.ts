import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const SHAPE_TYPES: ReadonlySet<string> = new Set([
  "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
]);
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * 크기 비율 신호.
 *
 * 기존 NodeMatcher.isSimilarSize를 재현:
 * - 같은 container type (예: FRAME↔FRAME) → score 1 passthrough
 * - 같은 shape type (예: RECTANGLE↔RECTANGLE) → 비율 체크 (동심원 오매칭 방지)
 * - Shape↔Shape 교차 매칭(RECTANGLE↔VECTOR 등) → 비율 체크
 * - Container 교차(GROUP↔FRAME) → 비율 체크
 * - 비율 max/min > policy.relativeSizeMaxRatio → veto (Phase 1a: 1.3, Phase 1b: 2.0)
 * - 비율 이내 → score 1
 * - bounding box 없으면 defensive로 score 1
 *
 * 이 신호는 Phase 1b에서 MatchingPolicy.relativeSizeMaxRatio 값만 바꿔 완화된다.
 */
export class RelativeSize implements MatchSignal {
  readonly name = "RelativeSize";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    // 같은 container type 내 매칭(FRAME↔FRAME, GROUP↔GROUP)은 크기 체크 제외
    if (a.type === b.type && CONTAINER_TYPES.has(a.type)) {
      return { kind: "neutral", reason: `same-type ${a.type} passthrough` };
    }

    // 같은 shape type은 체크 (기존 isSimilarSize 동심원 방지 로직)
    if (a.type === b.type && SHAPE_TYPES.has(a.type)) {
      return this.checkRatio(a, b, ctx);
    }

    // 타입 다름 — Shape 그룹 교차 또는 Container 그룹 교차에만 적용
    const bothShapes = SHAPE_TYPES.has(a.type) && SHAPE_TYPES.has(b.type);
    const bothContainers = CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type);
    if (!bothShapes && !bothContainers) {
      return { kind: "neutral", reason: `non-shape/container cross passthrough` };
    }
    return this.checkRatio(a, b, ctx);
  }

  private checkRatio(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) {
      return { kind: "neutral", reason: "missing mergedNodes, defensive passthrough" };
    }
    const origA = ctx.dataManager.getById(mergedA.id)?.node as any;
    const origB = ctx.dataManager.getById(mergedB.id)?.node as any;
    const boxA = origA?.absoluteBoundingBox;
    const boxB = origB?.absoluteBoundingBox;
    if (!boxA || !boxB) {
      return { kind: "neutral", reason: "missing bounding box, defensive passthrough" };
    }
    const minW = Math.min(boxA.width, boxB.width);
    const minH = Math.min(boxA.height, boxB.height);
    if (minW <= 0 || minH <= 0) {
      return { kind: "neutral", reason: "zero dimension, defensive passthrough" };
    }
    const wRatio = Math.max(boxA.width, boxB.width) / minW;
    const hRatio = Math.max(boxA.height, boxB.height) / minH;
    const maxRatio = Math.max(wRatio, hRatio);
    if (maxRatio > ctx.policy.relativeSizeMaxRatio) {
      return {
        kind: "veto",
        reason: `size ratio ${maxRatio.toFixed(2)} > ${ctx.policy.relativeSizeMaxRatio}`,
      };
    }
    return {
      kind: "neutral",
      reason: `size ratio ${maxRatio.toFixed(2)} ≤ ${ctx.policy.relativeSizeMaxRatio}`,
    };
  }
}
