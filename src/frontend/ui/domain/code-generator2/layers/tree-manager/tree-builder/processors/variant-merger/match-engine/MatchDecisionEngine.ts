import type { InternalNode } from "../../../../../../types/types";
import type {
  MatchSignal,
  MatchContext,
  MatchDecision,
  SignalResult,
} from "./MatchSignal";
import type { MatchingPolicy } from "./MatchingPolicy";

/**
 * 신호 기반 매칭 결정 엔진.
 *
 * Spec C (신호 독립성 복원):
 * Phase 1 — 모든 신호를 순서대로 평가하고 결과를 수집한다. 즉시 return 없음.
 * Phase 2 — Resolution (우선순위 순):
 *   1. decisive-match (IdMatch) → match, cost=0
 *   2. veto → veto, cost=Infinity
 *   3. decisive-match-with-cost → match, 첫 해당 신호의 cost 사용
 *   4. match-with-cost / score 합산 → matchCostThreshold 비교
 *   5. 아무 match 표시 없음 → veto
 *
 * 핵심 변경: decisive-match-with-cost가 후속 신호를 차단하지 않는다.
 * 모든 신호가 평가되므로 후속 신호의 veto가 NP의 match를 override할 수 있다.
 *
 * 결정론 보장:
 * - 신호 평가 순서는 생성자 배열 순서
 * - 각 신호는 pure function이어야 함
 * - 신호 간 부작용 없음
 */
export class MatchDecisionEngine {
  constructor(
    private readonly signals: ReadonlyArray<MatchSignal>,
    private readonly policy: MatchingPolicy,
  ) {}

  decide(a: InternalNode, b: InternalNode, ctx: MatchContext): MatchDecision {
    // Phase 1 — 모든 신호 평가 + 수집 (short-circuit 없음)
    const signalResults: Array<{
      signalName: string;
      result: SignalResult;
      weight: number;
    }> = [];

    let hasVeto = false;
    let hasDecisiveMatch = false;
    let firstDecisiveCost: number | null = null;

    for (const signal of this.signals) {
      const result = signal.evaluate(a, b, ctx);
      const weight = this.weightFor(signal.name);
      signalResults.push({ signalName: signal.name, result, weight });

      if (result.kind === "veto") {
        hasVeto = true;
      } else if (result.kind === "decisive-match") {
        hasDecisiveMatch = true;
      } else if (result.kind === "decisive-match-with-cost" && firstDecisiveCost === null) {
        firstDecisiveCost = result.cost;
      }
    }

    // Phase 2 — Resolution (우선순위 순)

    // 1. decisive-match (IdMatch: 절대 확실) → veto보다 우선
    if (hasDecisiveMatch) {
      return { decision: "match", totalCost: 0, signalResults };
    }

    // 2. veto → decisive-match-with-cost보다 우선
    if (hasVeto) {
      return { decision: "veto", totalCost: Infinity, signalResults };
    }

    // 3. decisive-match-with-cost → 첫 해당 신호의 cost 사용
    if (firstDecisiveCost !== null) {
      return { decision: "match", totalCost: firstDecisiveCost, signalResults };
    }

    // 4. match-with-cost / score 합산
    let totalCost = 0;
    let anyMatchIndication = false;
    for (const { result, weight } of signalResults) {
      if (result.kind === "match-with-cost") {
        totalCost += result.cost;
        anyMatchIndication = true;
      } else if (result.kind === "score") {
        totalCost += weight * (1 - result.score);
        anyMatchIndication = true;
      }
    }

    // 5. 아무 match 표시 없음 → veto
    if (!anyMatchIndication) {
      return { decision: "veto", totalCost: Infinity, signalResults };
    }

    if (totalCost <= this.policy.matchCostThreshold) {
      return { decision: "match", totalCost, signalResults };
    }

    return { decision: "veto", totalCost: Infinity, signalResults };
  }

  private weightFor(signalName: string): number {
    const weights = this.policy.signalWeights as Record<string, number>;
    return weights[signalName] ?? 1;
  }
}
