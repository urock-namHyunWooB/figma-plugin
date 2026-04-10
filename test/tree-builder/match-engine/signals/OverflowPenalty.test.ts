import { describe, it, expect, vi } from "vitest";
import { OverflowPenalty } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/OverflowPenalty";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function containerNode(id: string): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: [],
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(overflowA: boolean, overflowB: boolean, rootSimilar = true) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: {
          id,
          absoluteBoundingBox: { x: 0, y: 0, width: id === "rootBbig" ? 50 : 10, height: id === "rootBbig" ? 50 : 10 },
          children: [{ id: "child" }],
        },
      })),
    },
    layoutNormalizer: {
      normalize: vi.fn((_parent: any, orig: any) => {
        if (orig.id === "a") return { cx: 0.5, cy: 0.5, relWidth: overflowA ? 1.2 : 0.5, relHeight: overflowA ? 1.2 : 0.5 };
        if (orig.id === "b") return { cx: 0.5, cy: 0.5, relWidth: overflowB ? 1.2 : 0.5, relHeight: overflowB ? 1.2 : 0.5 };
        return null;
      }),
    },
    nodeToVariantRoot: new Map([["a", "rootA"], ["b", rootSimilar ? "rootB" : "rootBbig"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("OverflowPenalty signal (Phase 2 cost form)", () => {
  const signal = new OverflowPenalty();

  it("returns neutral when both nodes are normal (no overflow)", () => {
    const r = signal.evaluate(containerNode("a"), containerNode("b"), makeCtx(false, false));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when both nodes are overflow", () => {
    const r = signal.evaluate(containerNode("a"), containerNode("b"), makeCtx(true, true));
    expect(r.kind).toBe("neutral");
  });

  it("returns match-with-cost 0.5 when one is overflow and other is normal", () => {
    const r = signal.evaluate(containerNode("a"), containerNode("b"), makeCtx(true, false));
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") expect(r.cost).toBe(0.5);
  });

  it("returns neutral for non-container pair (passthrough)", () => {
    const a = { id: "a", name: "a", type: "TEXT", children: [] } as any;
    const b = { id: "b", name: "b", type: "TEXT", children: [] } as any;
    const r = signal.evaluate(a, b, makeCtx(true, false));
    expect(r.kind).toBe("neutral");
  });
});
