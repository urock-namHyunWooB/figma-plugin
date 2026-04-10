import { describe, it, expect, vi } from "vitest";
import { RelativeSize } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/RelativeSize";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(type: string, id = "n"): InternalNode {
  return {
    id,
    name: id,
    type,
    children: [],
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(
  boxA: { width: number; height: number },
  boxB: { width: number; height: number },
) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: {
          id,
          absoluteBoundingBox: { x: 0, y: 0, ...(id === "a" ? boxA : boxB) },
        },
      })),
    },
    layoutNormalizer: {} as any,
    nodeToVariantRoot: new Map(),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("RelativeSize signal (Phase 2 cost form)", () => {
  const signal = new RelativeSize();

  it("returns neutral for non-shape/container pair (passthrough)", () => {
    const r = signal.evaluate(
      node("TEXT", "a"),
      node("TEXT", "b"),
      makeCtx({ width: 10, height: 10 }, { width: 100, height: 100 }),
    );
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for shape pair with same size", () => {
    const r = signal.evaluate(
      node("RECTANGLE", "a"),
      node("VECTOR", "b"),
      makeCtx({ width: 20, height: 20 }, { width: 20, height: 20 }),
    );
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for shape pair within ratio 2.0", () => {
    const r = signal.evaluate(
      node("RECTANGLE", "a"),
      node("RECTANGLE", "b"),
      makeCtx({ width: 10, height: 10 }, { width: 15, height: 15 }),
    );
    expect(r.kind).toBe("neutral");
  });

  it("returns veto for shape pair exceeding ratio 2.0", () => {
    const r = signal.evaluate(
      node("RECTANGLE", "a"),
      node("RECTANGLE", "b"),
      makeCtx({ width: 10, height: 10 }, { width: 25, height: 25 }),
    );
    expect(r.kind).toBe("veto");
  });

  it("returns veto for GROUP↔FRAME cross with size exceeding ratio 2.0", () => {
    const r = signal.evaluate(
      node("GROUP", "a"),
      node("FRAME", "b"),
      makeCtx({ width: 10, height: 10 }, { width: 30, height: 30 }),
    );
    expect(r.kind).toBe("veto");
  });

  it("returns neutral for same-type container pair regardless of size", () => {
    const r = signal.evaluate(
      node("FRAME", "a"),
      node("FRAME", "b"),
      makeCtx({ width: 10, height: 10 }, { width: 100, height: 100 }),
    );
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when bounding box unavailable (defensive)", () => {
    const ctx: any = {
      dataManager: { getById: vi.fn().mockReturnValue({ node: {} }) },
      policy: defaultMatchingPolicy,
    };
    const r = signal.evaluate(node("RECTANGLE", "a"), node("RECTANGLE", "b"), ctx);
    expect(r.kind).toBe("neutral");
  });
});
