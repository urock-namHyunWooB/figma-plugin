import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { VariantPropPosition } from "./signals/VariantPropPosition";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { TextSpecialMatch } from "./signals/TextSpecialMatch";
import { InstanceSpecialMatch } from "./signals/InstanceSpecialMatch";
import { WrapperRoleDistinction } from "./signals/WrapperRoleDistinction";
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
    // Phase 2d 결정: WrapperRoleDistinction은 정의돼 있지만 등록하지 않는다.
    // 이유: Tagreview는 이미 NormalizedPosition의 size check로 보존되고 있어
    // 추가 wrapper veto가 불필요. 등록 시 Headersub/SegmentedControl에 false positive 발생.
    // Phase 3: ParentShapeIdentity 등록 해제.
    // 원래 설계는 "같은 부모 → 같은 노드 가능성 ↑"이지만 variant merger context
    // 에서는 매칭 대상 모두가 같은 variant root 하위라 거의 항상 true → 신호 가치 없음.
    // 원설계자도 주석에 "NP fallback에서만 의미"라 혼란 표시. 현재 NP의
    // decisive-match-with-cost로 short-circuit되고 있어서 PSI는 거의 호출되지 않음.
    // 이 전제를 명시적으로 확정하고 제거 (클래스 파일은 남김).
    [
      new TypeCompatibility(),
      new IdMatch(),
      new NormalizedPosition(),
      new VariantPropPosition(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
    ],
    policy,
  );
}
