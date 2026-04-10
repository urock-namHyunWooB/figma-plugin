import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * INSTANCE 노드 특수 매칭 신호.
 *
 * 기존 NodeMatcher.isSameInstanceNode 재현:
 * - 두 노드 모두 INSTANCE
 * - componentPropertyReferences.visible이 둘 다 있고 일치 → score 1
 * - 그 외 → score 0
 */
export class InstanceSpecialMatch implements MatchSignal {
  readonly name = "InstanceSpecialMatch";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    // 비-INSTANCE pair: 판정 불가 → neutral
    if (a.type !== "INSTANCE" || b.type !== "INSTANCE") {
      return { kind: "neutral", reason: "non-INSTANCE pair" };
    }
    const visA = (a as any).componentPropertyReferences?.visible;
    const visB = (b as any).componentPropertyReferences?.visible;
    if (visA && visB && visA === visB) {
      // 같은 visible ref → decisive-match-with-cost(legacy 0.05)
      // legacy: INSTANCE special은 position match와 mutually exclusive
      return {
        kind: "decisive-match-with-cost",
        cost: ctx.policy.instanceSpecialMatchCost,
        reason: `same visible ref: ${visA}`,
      };
    }
    return { kind: "neutral", reason: "INSTANCE no visible ref match" };
  }
}
