import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * ID 일치 신호.
 *
 * 같은 ID면 score 1, 다르면 score 0.
 *
 * 이 신호는 "ID가 같으면 같은 노드"라는 기존 NodeMatcher의 Pass 1 확정 매칭 로직을
 * 그대로 재현한다. score 0는 veto가 아닌 "이 신호만으로는 판단 불가" 상태 —
 * 다른 신호들이 매칭 여부를 결정할 수 있다.
 */
export class IdMatch implements MatchSignal {
  readonly name = "IdMatch";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.id === b.id) {
      return { kind: "score", score: 1, reason: `id match: ${a.id}` };
    }
    return { kind: "score", score: 0, reason: `id diff: ${a.id} ≠ ${b.id}` };
  }
}
