import type { InternalNode } from "../../../../../types/types";
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
 * Phase 2 cost form 재설계:
 * 1. 등록된 신호를 순서대로 호출
 * 2. veto → 즉시 decision="veto", totalCost=Infinity (short-circuit)
 * 3. decisive-match → 즉시 decision="match", totalCost=0 (short-circuit, veto override)
 * 4. match-with-cost → cost를 totalCost에 누적 (legacy posCost와 호환)
 * 5. neutral → 0 기여 (적용 불가 신호)
 * 6. score → weight × (1 - score) cost 기여 (보조 신호 booster)
 * 7. totalCost ≤ matchCostThreshold → "match", 아니면 "veto"
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
    const signalResults: Array<{
      signalName: string;
      result: SignalResult;
      weight: number;
    }> = [];

    for (const signal of this.signals) {
      const result = signal.evaluate(a, b, ctx);
      const weight = this.weightFor(signal.name);
      signalResults.push({ signalName: signal.name, result, weight });

      if (result.kind === "veto") {
        return {
          decision: "veto",
          totalCost: Infinity,
          signalResults,
        };
      }
      if (result.kind === "decisive-match") {
        return {
          decision: "match",
          totalCost: 0,
          signalResults,
        };
      }
      if (result.kind === "decisive-match-with-cost") {
        return {
          decision: "match",
          totalCost: result.cost,
          signalResults,
        };
      }
    }

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
      // neutral contributes 0 (and doesn't claim match)
    }

    // 모든 신호가 neutral이면 어느 신호도 매치를 주장하지 않은 것 → veto
    if (!anyMatchIndication) {
      return {
        decision: "veto",
        totalCost: Infinity,
        signalResults,
      };
    }

    if (totalCost <= this.policy.matchCostThreshold) {
      return {
        decision: "match",
        totalCost,
        signalResults,
      };
    }

    return {
      decision: "veto",
      totalCost: Infinity,
      signalResults,
    };
  }

  private weightFor(signalName: string): number {
    const weights = this.policy.signalWeights as Record<string, number>;
    return weights[signalName] ?? 1;
  }
}
