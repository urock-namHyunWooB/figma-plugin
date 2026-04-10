import { describe, it, expect } from "vitest";
import type {
  MatchSignal,
  SignalResult,
  MatchContext,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchSignal";

describe("MatchSignal types", () => {
  it("SignalResult veto has kind 'veto' and no score", () => {
    const r: SignalResult = { kind: "veto", reason: "type mismatch" };
    expect(r.kind).toBe("veto");
    // @ts-expect-error — score must not exist on veto
    expect(r.score).toBeUndefined();
  });

  it("SignalResult score has kind 'score' and score in [0,1]", () => {
    const r: SignalResult = { kind: "score", score: 0.8, reason: "close match" };
    expect(r.kind).toBe("score");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it("MatchSignal interface requires name + evaluate", () => {
    const signal: MatchSignal = {
      name: "test",
      evaluate: (_a, _b, _ctx) => ({ kind: "score", score: 1, reason: "always match" }),
    };
    expect(signal.name).toBe("test");
    const result = signal.evaluate({} as any, {} as any, {} as MatchContext);
    expect(result).toEqual({ kind: "score", score: 1, reason: "always match" });
  });

  it("SignalResult decisive-match has kind 'decisive-match' and no score", () => {
    const r: SignalResult = { kind: "decisive-match", reason: "variant prop position override" };
    expect(r.kind).toBe("decisive-match");
    // @ts-expect-error — score must not exist on decisive-match
    expect(r.score).toBeUndefined();
  });
});
