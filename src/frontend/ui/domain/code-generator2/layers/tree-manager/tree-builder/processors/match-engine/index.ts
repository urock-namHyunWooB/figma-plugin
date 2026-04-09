import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { VariantPropPosition } from "./signals/VariantPropPosition";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { TextSpecialMatch } from "./signals/TextSpecialMatch";
import { InstanceSpecialMatch } from "./signals/InstanceSpecialMatch";
import { ParentShapeIdentity } from "./signals/ParentShapeIdentity";
import { defaultMatchingPolicy, type MatchingPolicy } from "./MatchingPolicy";

export { MatchDecisionEngine } from "./MatchDecisionEngine";
export { defaultMatchingPolicy } from "./MatchingPolicy";
export type { MatchingPolicy } from "./MatchingPolicy";
export type { MatchSignal, SignalResult, MatchContext, MatchDecision } from "./MatchSignal";

/**
 * Phase 2 엔진 — getPositionCost 위임 호환 cost form.
 *
 * 신호 순서:
 * 1. TypeCompatibility — O(1), 가장 빠른 veto
 * 2. IdMatch — O(1), id 일치 시 decisive-match
 * 3. NormalizedPosition — O(depth), 위치+size+overflow 통합. success 시 decisive-match-with-cost로
 *    fallback 신호 차단. 실패 시 neutral (Text/Instance Special 및 VariantPropPosition에 위임).
 * 4. VariantPropPosition — NormalizedPosition fallback에서만 발동. boolean variant가 cx 이동을
 *    결정하는 패턴 (Switch Knob 등)을 decisive-match 처리. NP가 성공하면 이 신호는 실행되지 않음.
 * 5. TextSpecialMatch — TEXT pair fallback (decisive-match-with-cost(0.05))
 * 6. InstanceSpecialMatch — INSTANCE pair fallback (decisive-match-with-cost(0.05))
 *
 * RelativeSize와 OverflowPenalty는 NormalizedPosition에 inline됨 (legacy semantic 보존).
 * 모든 신호가 neutral이면 엔진이 veto 반환.
 */
export function createDefaultEngine(
  policy: MatchingPolicy = defaultMatchingPolicy,
): MatchDecisionEngine {
  return new MatchDecisionEngine(
    [
      new TypeCompatibility(),
      new IdMatch(),
      new NormalizedPosition(),
      new VariantPropPosition(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
      new ParentShapeIdentity(),
    ],
    policy,
  );
}
