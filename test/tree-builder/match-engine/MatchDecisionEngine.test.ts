import { describe, it, expect } from "vitest";
import { MatchDecisionEngine } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchDecisionEngine";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type {
  MatchSignal,
  SignalResult,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal";
import type { InternalNode } from "@code-generator2/types/types";

function fakeSignal(name: string, result: SignalResult): MatchSignal {
  return { name, evaluate: () => result };
}

const n = (id: string): InternalNode => ({ id, name: id, type: "FRAME", children: [] } as any);
const ctx: any = { policy: defaultMatchingPolicy };

describe("MatchDecisionEngine", () => {
  it("returns match with totalCost 0 when all signals return score 1", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 1, reason: "ok" }),
        fakeSignal("s2", { kind: "score", score: 1, reason: "ok" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("match");
    expect(d.totalCost).toBe(0);
  });

  it("returns veto when any signal vetoes", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 1, reason: "ok" }),
        fakeSignal("s2", { kind: "veto", reason: "nope" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(d.totalCost).toBe(Infinity);
  });

  it("sums (1 - score) × weight for non-veto signals", () => {
    const policy = { ...defaultMatchingPolicy, matchCostThreshold: 1 };
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 0.7, reason: "" }),
        fakeSignal("s2", { kind: "score", score: 0.5, reason: "" }),
      ],
      policy,
    );
    // weights default 1 → totalCost = 0.3 + 0.5 = 0.8
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBeCloseTo(0.8, 5);
    expect(d.decision).toBe("match"); // 0.8 <= 1
  });

  it("returns veto when totalCost exceeds matchCostThreshold", () => {
    const policy = { ...defaultMatchingPolicy, matchCostThreshold: 0.5 };
    const engine = new MatchDecisionEngine(
      [fakeSignal("s1", { kind: "score", score: 0.1, reason: "" })],
      policy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBe(Infinity);
    expect(d.decision).toBe("veto");
  });

  it("signalResults preserves registration order", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 1, reason: "r1" }),
        fakeSignal("s2", { kind: "score", score: 0.5, reason: "r2" }),
        fakeSignal("s3", { kind: "score", score: 0.8, reason: "r3" }),
      ],
      { ...defaultMatchingPolicy, matchCostThreshold: 10 },
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.signalResults.map((r) => r.signalName)).toEqual(["s1", "s2", "s3"]);
  });

  it("short-circuits evaluation after first veto (optimization, order preserved)", () => {
    let s3Called = false;
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 1, reason: "" }),
        fakeSignal("s2", { kind: "veto", reason: "stop here" }),
        {
          name: "s3",
          evaluate: () => {
            s3Called = true;
            return { kind: "score", score: 1, reason: "" };
          },
        },
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(s3Called).toBe(false);
  });
});
