import { describe, it, expect } from "vitest";
import { TextSpecialMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TextSpecialMatch";
import type { InternalNode } from "@code-generator2/types/types";

function textNode(id: string, name: string, parentType: string | null): InternalNode {
  const node: any = { id, name, type: "TEXT", children: [] };
  if (parentType) node.parent = { type: parentType };
  return node as InternalNode;
}

describe("TextSpecialMatch signal", () => {
  const signal = new TextSpecialMatch();

  it("returns score 1 for TEXT pair with same name + same parent type", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Label", "FRAME");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 0 for non-TEXT pair (neutral)", () => {
    const a = { id: "a", name: "x", type: "FRAME", children: [] } as any;
    const b = { id: "b", name: "x", type: "FRAME", children: [] } as any;
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 for TEXT pair with different names", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Title", "FRAME");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 for TEXT pair with different parent types", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Label", "GROUP");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when parent is missing", () => {
    const a = textNode("a", "Label", null);
    const b = textNode("b", "Label", null);
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });
});
