import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * TEXT 노드 특수 매칭 신호.
 *
 * 기존 NodeMatcher.isSameTextNode 재현:
 * - 두 노드 모두 TEXT
 * - 이름 일치
 * - 부모 타입 일치
 * → score 1 (같은 역할 TEXT)
 *
 * 그 외에는 score 0 (이 신호로는 판정 불가, 다른 신호에 맡김).
 */
export class TextSpecialMatch implements MatchSignal {
  readonly name = "TextSpecialMatch";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    // 비-TEXT pair: 이 신호는 판정 불가 → neutral
    if (a.type !== "TEXT" || b.type !== "TEXT") {
      return { kind: "neutral", reason: "non-TEXT pair" };
    }
    if (a.name !== b.name) {
      return { kind: "neutral", reason: `TEXT name diff: ${a.name} ≠ ${b.name}` };
    }
    const parentAType = (a as any).parent?.type;
    const parentBType = (b as any).parent?.type;
    if (!parentAType || !parentBType || parentAType !== parentBType) {
      return { kind: "neutral", reason: "TEXT parent type diff" };
    }
    // 같은 이름 + 같은 부모 타입 TEXT → decisive-match-with-cost(legacy 0.05)
    // legacy: TEXT special은 position match와 mutually exclusive — 즉시 0.05 반환하고 끝
    return {
      kind: "decisive-match-with-cost",
      cost: ctx.policy.textSpecialMatchCost,
      reason: `same TEXT role: ${a.name}`,
    };
  }
}
