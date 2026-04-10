import { describe, it, expect } from "vitest";
import { MatchDecisionEngine } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchDecisionEngine";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchingPolicy";
import type {
  MatchSignal,
  SignalResult,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchSignal";
import type { InternalNode } from "@code-generator2/types/types";

function fakeSignal(name: string, result: SignalResult): MatchSignal {
  return { name, evaluate: () => result };
}

const n = (id: string): InternalNode => ({ id, name: id, type: "FRAME", children: [] } as any);
const ctx: any = { policy: defaultMatchingPolicy };

describe("MatchDecisionEngine (Phase 2 cost form)", () => {
  it("returns veto when all signals are neutral (no match indication)", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "neutral", reason: "ok" }),
        fakeSignal("s2", { kind: "neutral", reason: "ok" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(d.totalCost).toBe(Infinity);
  });

  it("returns veto when any signal vetoes", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "neutral", reason: "ok" }),
        fakeSignal("s2", { kind: "veto", reason: "nope" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(d.totalCost).toBe(Infinity);
  });

  it("sums match-with-cost contributions", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "match-with-cost", cost: 0.07, reason: "" }),
        fakeSignal("s2", { kind: "match-with-cost", cost: 0.5, reason: "" }),
      ],
      defaultMatchingPolicy, // threshold 0.6
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBeCloseTo(0.57, 5);
    expect(d.decision).toBe("match");
  });

  it("returns veto when totalCost exceeds matchCostThreshold", () => {
    const policy = { ...defaultMatchingPolicy, matchCostThreshold: 0.5 };
    const engine = new MatchDecisionEngine(
      [fakeSignal("s1", { kind: "match-with-cost", cost: 0.6, reason: "" })],
      policy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBe(Infinity);
    expect(d.decision).toBe("veto");
  });

  it("neutral signals contribute 0 cost", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "neutral", reason: "" }),
        fakeSignal("s2", { kind: "match-with-cost", cost: 0.05, reason: "" }),
        fakeSignal("s3", { kind: "neutral", reason: "" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBeCloseTo(0.05, 5);
    expect(d.decision).toBe("match");
  });

  it("signalResults preserves registration order", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "neutral", reason: "r1" }),
        fakeSignal("s2", { kind: "match-with-cost", cost: 0.05, reason: "r2" }),
        fakeSignal("s3", { kind: "neutral", reason: "r3" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.signalResults.map((r) => r.signalName)).toEqual(["s1", "s2", "s3"]);
  });

  // Spec C: 신호 독립성 복원 — 모든 신호가 평가된 후 resolution

  it("evaluates all signals even after veto, final decision is veto", () => {
    let s3Called = false;
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "match-with-cost", cost: 0.05, reason: "" }),
        fakeSignal("s2", { kind: "veto", reason: "stop here" }),
        {
          name: "s3",
          evaluate: () => {
            s3Called = true;
            return { kind: "neutral", reason: "" };
          },
        },
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(s3Called).toBe(true); // 모든 신호가 평가됨
    expect(d.signalResults).toHaveLength(3);
  });

  it("decisive-match overrides veto (IdMatch absolute certainty)", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "match-with-cost", cost: 0.1, reason: "" }),
        fakeSignal("s2", { kind: "decisive-match", reason: "override" }),
        fakeSignal("s3", { kind: "veto", reason: "would normally veto" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("match");
    expect(d.totalCost).toBe(0);
    expect(d.signalResults).toHaveLength(3); // 모든 신호 수집
  });

  it("evaluates all signals even after decisive-match", () => {
    let s3Called = false;
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "neutral", reason: "" }),
        fakeSignal("s2", { kind: "decisive-match", reason: "" }),
        { name: "s3", evaluate: () => { s3Called = true; return { kind: "neutral", reason: "" }; } },
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("match");
    expect(s3Called).toBe(true); // 모든 신호가 평가됨
    expect(d.signalResults).toHaveLength(3);
  });

  it("veto overrides decisive-match-with-cost", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "decisive-match-with-cost", cost: 0.05, reason: "NP match" }),
        fakeSignal("s2", { kind: "veto", reason: "후속 신호가 거부" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(d.totalCost).toBe(Infinity);
  });
});
