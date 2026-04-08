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
      getById: vi.fn().mockReturnValue({
        node: { id: "orig", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      }),
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

describe("NormalizedPosition signal", () => {
  const signal = new NormalizedPosition();

  it("returns score 1 when cost is 0", () => {
    // parent 필요 — 루트 단락 금지하기 위해 parent 추가
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const ctx = makeCtx(0);
    // findDirectParent가 부모를 찾도록 mock 보강
    ctx.dataManager.getById = vi.fn((id: string) => ({
      node: id === "root"
        ? { children: [{ id: "x", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { id: "y", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }] }
        : { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    }));
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score ~0.5 when cost is half of threshold", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const ctx = makeCtx(0.05);
    ctx.dataManager.getById = vi.fn((id: string) => ({
      node: id === "root"
        ? { children: [{ id: "x", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { id: "y", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }] }
        : { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    }));
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("returns score 0 when cost equals threshold", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const ctx = makeCtx(0.1);
    ctx.dataManager.getById = vi.fn((id: string) => ({
      node: id === "root"
        ? { children: [{ id: "x", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { id: "y", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }] }
        : { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    }));
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns veto when cost exceeds threshold", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const ctx = makeCtx(0.2);
    ctx.dataManager.getById = vi.fn((id: string) => ({
      node: id === "root"
        ? { children: [{ id: "x", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { id: "y", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }] }
        : { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    }));
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("veto");
  });

  it("returns veto when mergedNodes missing", () => {
    const a = { id: "a", name: "a", type: "FRAME", children: [], parent: {} } as unknown as InternalNode;
    const b = { id: "b", name: "b", type: "FRAME", children: [], parent: {} } as unknown as InternalNode;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("veto");
  });

  it("returns score 1 when both nodes are roots (no parent)", () => {
    const a = node("x"); // no parent
    const b = node("y");
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });
});
