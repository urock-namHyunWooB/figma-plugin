import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { RelativeSize } from "./signals/RelativeSize";
import { defaultMatchingPolicy, type MatchingPolicy } from "./MatchingPolicy";

export { MatchDecisionEngine } from "./MatchDecisionEngine";
export { defaultMatchingPolicy } from "./MatchingPolicy";
export type { MatchingPolicy } from "./MatchingPolicy";
export type {
  MatchSignal,
  SignalResult,
  MatchContext,
  MatchDecision,
} from "./MatchSignal";

/**
 * Phase 1 기본 엔진 생성.
 *
 * 등록 순서는 평가 비용이 낮은 것부터:
 * 1. TypeCompatibility — O(1), 대부분의 불일치를 즉시 veto
 * 2. IdMatch — O(1), 확정 매칭 빠른 경로
 * 3. RelativeSize — O(1), hit에는 DataManager 조회 1회
 * 4. NormalizedPosition — O(1)~O(depth), LayoutNormalizer 호출
 */
export function createDefaultEngine(
  policy: MatchingPolicy = defaultMatchingPolicy,
): MatchDecisionEngine {
  return new MatchDecisionEngine(
    [
      new TypeCompatibility(),
      new IdMatch(),
      new RelativeSize(),
      new NormalizedPosition(),
    ],
    policy,
  );
}
