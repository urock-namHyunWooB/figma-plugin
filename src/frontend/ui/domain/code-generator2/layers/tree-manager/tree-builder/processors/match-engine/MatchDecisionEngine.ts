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
 * 동작:
 * 1. 등록된 신호를 순서대로 호출
 * 2. 하나라도 veto → 즉시 decision="veto" 반환 (short-circuit)
 * 3. 전부 score → totalCost = Σ weight_i × (1 - score_i)
 * 4. totalCost ≤ policy.matchCostThreshold → decision="match", 아니면 "veto"
 *
 * 결정론 보장:
 * - 신호 평가 순서는 생성자 배열 순서
 * - 각 신호는 pure function이어야 함 (MatchSignal 계약)
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
    }

    let totalCost = 0;
    for (const { result, weight } of signalResults) {
      if (result.kind === "score") {
        totalCost += weight * (1 - result.score);
      }
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
