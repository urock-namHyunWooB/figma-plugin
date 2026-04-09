import { describe, it, expect, vi } from "vitest";
import { WrapperRoleDistinction } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/WrapperRoleDistinction";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function containerWithChildren(id: string, childCount: number): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: Array.from({ length: childCount }, (_, i) => ({
      id: `${id}-c${i}`,
      name: `c${i}`,
      type: "RECTANGLE",
      children: [],
    })),
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(rootAW: number, rootBW: number) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: { id, absoluteBoundingBox: { x: 0, y: 0, width: id === "rootA" ? rootAW : rootBW, height: 100 } },
      })),
    },
    layoutNormalizer: {} as any,
    nodeToVariantRoot: new Map([["a", "rootA"], ["b", "rootB"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("WrapperRoleDistinction signal", () => {
  const signal = new WrapperRoleDistinction();

  it("returns neutral when children counts are similar", () => {
    const a = containerWithChildren("a", 3);
    const b = containerWithChildren("b", 3);
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("neutral");
  });

  it("returns veto when roots similar but children differ drastically (1 vs 5, ratio 5)", () => {
    const a = containerWithChildren("a", 1);
    const b = containerWithChildren("b", 5);
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("veto");
  });

  it("returns neutral when variant roots are very different in size", () => {
    const a = containerWithChildren("a", 1);
    const b = containerWithChildren("b", 5);
    const r = signal.evaluate(a, b, makeCtx(100, 500));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for non-container nodes (passthrough)", () => {
    const a = { id: "a", name: "a", type: "TEXT", children: [] } as any;
    const b = { id: "b", name: "b", type: "TEXT", children: [] } as any;
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when ratio is below threshold (2x diff is OK at threshold 3.0)", () => {
    const a = containerWithChildren("a", 2);
    const b = containerWithChildren("b", 4);
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("neutral");
  });
});
