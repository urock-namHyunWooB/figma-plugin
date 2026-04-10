import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * ID 일치 신호.
 *
 * - 같은 ID → decisive-match (기존 NodeMatcher.isSameNode Step 2: 즉시 true)
 * - 다른 ID → score 1 (neutral, 이 신호로는 판단 불가)
 *
 * 주의: 이 신호는 "ID가 다르면 다른 노드"를 의미하지 않는다. 서로 다른
 * variant의 같은 노드는 ID가 다르지만 여전히 매칭 가능해야 한다. 따라서
 * 다름은 **negative evidence가 아닌 neutral** (score 1로 cost 0 기여).
 */
export class IdMatch implements MatchSignal {
  readonly name = "IdMatch";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.id === b.id) {
      return { kind: "decisive-match", reason: `id match: ${a.id}` };
    }
    return { kind: "neutral", reason: `id diff: ${a.id} ≠ ${b.id}` };
  }
}
