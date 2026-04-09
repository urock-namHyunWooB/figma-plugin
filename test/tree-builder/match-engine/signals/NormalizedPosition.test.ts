import { describe, it, expect, vi } from "vitest";
import { NormalizedPosition } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(id: string): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: [],
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(positionCost: number) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: id === "root"
          ? {
              children: [
                { id: "x", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
                { id: "y", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
              ],
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
            }
          : { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      })),
    },
    layoutNormalizer: {
      normalize: vi.fn().mockReturnValue({ cx: 0.5, cy: 0.5, relWidth: 0.5, relHeight: 0.5 }),
      compare: vi.fn().mockReturnValue(positionCost),
      compareAvgSize: vi.fn().mockReturnValue(positionCost),
    },
    nodeToVariantRoot: new Map([["x", "root"], ["y", "root"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("NormalizedPosition signal (Phase 2 inline overflow + size)", () => {
  const signal = new NormalizedPosition();

  it("returns decisive-match-with-cost 0 when raw posCost is 0", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBe(0);
  });

  it("returns decisive-match-with-cost equal to raw posCost (0.05)", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0.05));
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBeCloseTo(0.05, 5);
  });

  it("returns decisive-match-with-cost 0.1 at threshold boundary", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0.1));
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBeCloseTo(0.1, 5);
  });

  it("returns neutral (fallback) when cost exceeds threshold", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0.2));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when mergedNodes missing", () => {
    const a = { id: "a", name: "a", type: "FRAME", children: [], parent: {} } as unknown as InternalNode;
    const b = { id: "b", name: "b", type: "FRAME", children: [], parent: {} } as unknown as InternalNode;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("neutral");
  });

  it("returns decisive-match-with-cost 0 for root-root pair", () => {
    const a = node("x"); // no parent
    const b = node("y");
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBe(0);
  });
});
