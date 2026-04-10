import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * 부모 컨텍스트 일치 신호 (booster).
 *
 * 두 노드의 직접 부모가 같으면 자식들도 같은 역할 가능성이 높다는 가정.
 *
 * 점수:
 * - type + name + refId 전부 일치: score 1 (강한 확신, cost 0 기여)
 * - type + name 일치, refId 다름: score 0.75
 * - type만 일치: score 0.5
 * - 그 외: neutral (booster 효과 없음)
 *
 * 이 신호는 단독으로 매치를 결정하지 않는다 — 다른 신호와 결합해 총 cost에 기여.
 * Note: 현재 엔진의 mutual-exclusive 흐름 (NormalizedPosition decisive-match-with-cost)
 * 때문에 NP 성공 시 이 booster는 호출되지 않을 수 있다. NP fallback 케이스에서만 의미.
 */
export class ParentShapeIdentity implements MatchSignal {
  readonly name = "ParentShapeIdentity";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    const pA = a.parent;
    const pB = b.parent;
    if (!pA || !pB) {
      return { kind: "neutral", reason: "missing parent on one side" };
    }
    if (pA.type !== pB.type) {
      return { kind: "neutral", reason: `parent type diff: ${pA.type}↔${pB.type}` };
    }
    const refA = (pA as any).refId;
    const refB = (pB as any).refId;
    if (pA.name === pB.name && refA && refB && refA === refB) {
      return { kind: "score", score: 1, reason: `same parent: ${pA.name} (${refA})` };
    }
    if (pA.name === pB.name) {
      return { kind: "score", score: 0.75, reason: `same parent name ${pA.name}, diff refId` };
    }
    return { kind: "score", score: 0.5, reason: `same parent type only (${pA.type})` };
  }
}
