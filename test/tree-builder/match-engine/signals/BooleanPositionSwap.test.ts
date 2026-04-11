import { describe, it, expect, vi } from "vitest";
import { BooleanPositionSwap } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/BooleanPositionSwap";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(id: string, variantName: string, name = "knob"): InternalNode {
  return {
    id,
    name,
    type: "FRAME",
    children: [],
    parent: {} as any,
    mergedNodes: [{ id, name, variantName }],
  } as unknown as InternalNode;
}

function makeCtx(cxA: number, cxB: number, cyA = 0.5, cyB = 0.5) {
  // 각 variant root는 한 children만 가짐: ordinal 0에서 a, 또 다른 variant root에서 ordinal 0에 b.
  // Switch Knob 패턴 — 같은 논리 노드가 서로 다른 variant에서 같은 ordinal, 다른 위치.
  const variantRootA = {
    id: "rootA",
    children: [{ id: "a", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }],
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
  };
  const variantRootB = {
    id: "rootB",
    children: [{ id: "b", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }],
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
  };
  return {
    dataManager: {
      getById: vi.fn((id: string) => {
        if (id === "rootA") return { node: variantRootA };
        if (id === "rootB") return { node: variantRootB };
        if (id === "a") return { node: variantRootA.children[0] };
        if (id === "b") return { node: variantRootB.children[0] };
        return { node: { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } } };
      }),
    },
    layoutNormalizer: {
      normalize: vi.fn((_p: any, orig: any) => {
        if (orig.id === "a") return { cx: cxA, cy: cyA, relCenterX: cxA, relCenterY: cyA, relWidth: 0.2, relHeight: 0.2 };
        if (orig.id === "b") return { cx: cxB, cy: cyB, relCenterX: cxB, relCenterY: cyB, relWidth: 0.2, relHeight: 0.2 };
        return null;
      }),
    },
    nodeToVariantRoot: new Map([["a", "rootA"], ["b", "rootB"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("BooleanPositionSwap signal", () => {
  const signal = new BooleanPositionSwap();

  it("returns decisive-match-with-cost for True/False variant diff with cx-only movement", () => {
    const a = node("a", "LeftIcon=False, State=Default");
    const b = node("b", "LeftIcon=True, State=Default");
    const ctx = makeCtx(0.2, 0.8);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") {
      expect(r.cost).toBeGreaterThan(0);
      expect(r.cost).toBeLessThan(0.1);
    }
  });

  it("matches even with multiple prop diffs (multi-prop swap)", () => {
    const a = node("a", "Active=False, Disable=False");
    const b = node("b", "Active=True, Disable=True");
    const r = signal.evaluate(a, b, makeCtx(0.2, 0.8));
    expect(r.kind).toBe("decisive-match-with-cost");
  });

  it("matches even with non-boolean prop diffs", () => {
    const a = node("a", "Size=Small");
    const b = node("b", "Size=Large");
    const r = signal.evaluate(a, b, makeCtx(0.2, 0.8));
    expect(r.kind).toBe("decisive-match-with-cost");
  });

  it("returns neutral when cy also differs (not cx-only)", () => {
    const a = node("a", "LeftIcon=False");
    const b = node("b", "LeftIcon=True");
    const ctx = makeCtx(0.2, 0.8, 0.3, 0.7);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when cx is too similar (not a position swap)", () => {
    const a = node("a", "LeftIcon=False");
    const b = node("b", "LeftIcon=True");
    const r = signal.evaluate(a, b, makeCtx(0.4, 0.45));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when variantName cannot be parsed", () => {
    const a = node("a", "weird");
    const b = node("b", "thing");
    const r = signal.evaluate(a, b, makeCtx(0.2, 0.8));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when mergedNodes missing", () => {
    const a = { id: "a", name: "a", type: "FRAME", children: [], parent: {} } as any;
    const b = { id: "b", name: "b", type: "FRAME", children: [], parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0.2, 0.8));
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when node names differ (prevents cross-sibling match)", () => {
    const a = node("a", "LeftIcon=False, State=Default", "Tab 4");
    const b = node("b", "LeftIcon=True, State=Default", "Tab 5");
    const r = signal.evaluate(a, b, makeCtx(0.2, 0.8));
    expect(r.kind).toBe("neutral");
  });
});
