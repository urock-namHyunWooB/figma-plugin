import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { RelativeSize } from "./signals/RelativeSize";
import { TextSpecialMatch } from "./signals/TextSpecialMatch";
import { InstanceSpecialMatch } from "./signals/InstanceSpecialMatch";
import { OverflowPenalty } from "./signals/OverflowPenalty";
import { defaultMatchingPolicy, type MatchingPolicy } from "./MatchingPolicy";

export { MatchDecisionEngine } from "./MatchDecisionEngine";
export { defaultMatchingPolicy } from "./MatchingPolicy";
export type { MatchingPolicy } from "./MatchingPolicy";
export type { MatchSignal, SignalResult, MatchContext, MatchDecision } from "./MatchSignal";

/**
 * Phase 2a 확장 엔진.
 *
 * 신호 순서:
 * 1. TypeCompatibility — O(1), 가장 빠른 veto
 * 2. IdMatch — O(1), id 일치 빠른 경로
 * 3. TextSpecialMatch — O(1), TEXT 특수
 * 4. InstanceSpecialMatch — O(1), INSTANCE visible ref 특수
 * 5. RelativeSize — O(1), 크기 veto
 * 6. OverflowPenalty — O(depth), overflow 감점
 * 7. NormalizedPosition — O(depth), 위치 비교
 */
export function createDefaultEngine(
  policy: MatchingPolicy = defaultMatchingPolicy,
): MatchDecisionEngine {
  return new MatchDecisionEngine(
    [
      new TypeCompatibility(),
      new IdMatch(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
      new RelativeSize(),
      new OverflowPenalty(),
      new NormalizedPosition(),
    ],
    policy,
  );
}
