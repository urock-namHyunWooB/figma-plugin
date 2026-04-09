import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { TextSpecialMatch } from "./signals/TextSpecialMatch";
import { InstanceSpecialMatch } from "./signals/InstanceSpecialMatch";
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
 *    fallback 신호 차단. 실패 시 neutral (Text/Instance Special에 위임).
 * 4. TextSpecialMatch — TEXT pair fallback (decisive-match-with-cost(0.05))
 * 5. InstanceSpecialMatch — INSTANCE pair fallback (decisive-match-with-cost(0.05))
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
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
    ],
    policy,
  );
}
