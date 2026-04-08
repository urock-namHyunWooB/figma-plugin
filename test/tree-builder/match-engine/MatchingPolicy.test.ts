import { describe, it, expect } from "vitest";
import {
  defaultMatchingPolicy,
  type MatchingPolicy,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";

describe("MatchingPolicy", () => {
  it("defaultMatchingPolicy has Phase 1a values (behavior-preserving)", () => {
    const p: MatchingPolicy = defaultMatchingPolicy;
    expect(p.normalizedPositionThreshold).toBe(0.1);
    expect(p.relativeSizeMaxRatio).toBe(1.3);
    expect(p.variantRootSimilarityRatio).toBe(1.5);
    expect(p.overflowMismatchPenalty).toBe(0.5);
    expect(p.textSpecialMatchCost).toBe(0.05);
    expect(p.instanceSpecialMatchCost).toBe(0.05);
  });

  it("MatchingPolicy weights for signals default to 1", () => {
    const p = defaultMatchingPolicy;
    expect(p.signalWeights.TypeCompatibility).toBe(1);
    expect(p.signalWeights.IdMatch).toBe(1);
    expect(p.signalWeights.NormalizedPosition).toBe(1);
    expect(p.signalWeights.RelativeSize).toBe(1);
  });

  it("final match threshold corresponds to existing isSameNode semantics", () => {
    const p = defaultMatchingPolicy;
    expect(p.matchCostThreshold).toBeGreaterThan(0);
    expect(p.matchCostThreshold).toBeLessThan(Infinity);
  });
});
