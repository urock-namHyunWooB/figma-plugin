import type { InternalNode } from "../../../../../../types/types";
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

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    // 비-INSTANCE pair: 판정 불가 → neutral (score 1)
    if (a.type !== "INSTANCE" || b.type !== "INSTANCE") {
      return { kind: "score", score: 1, reason: "non-INSTANCE pair neutral" };
    }
    const visA = (a as any).componentPropertyReferences?.visible;
    const visB = (b as any).componentPropertyReferences?.visible;
    if (visA && visB && visA === visB) {
      // 같은 visible ref → decisive-match (기존 isSameInstanceNode)
      return { kind: "decisive-match", reason: `same visible ref: ${visA}` };
    }
    return { kind: "score", score: 1, reason: "INSTANCE no visible ref match neutral" };
  }
}
