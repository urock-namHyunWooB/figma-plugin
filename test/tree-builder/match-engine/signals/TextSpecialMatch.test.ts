import { describe, it, expect } from "vitest";
import { TextSpecialMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/TextSpecialMatch";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function textNode(id: string, name: string, parentType: string | null): InternalNode {
  const node: any = { id, name, type: "TEXT", children: [] };
  if (parentType) node.parent = { type: parentType };
  return node as InternalNode;
}

const ctx = { policy: defaultMatchingPolicy } as any;

describe("TextSpecialMatch signal", () => {
  const signal = new TextSpecialMatch();

  it("returns decisive-match-with-cost 0.05 for TEXT pair with same name + parent type", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Label", "FRAME");
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBe(0.05);
  });

  it("returns neutral for non-TEXT pair", () => {
    const a = { id: "a", name: "x", type: "FRAME", children: [] } as any;
    const b = { id: "b", name: "x", type: "FRAME", children: [] } as any;
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for TEXT pair with different names", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Title", "FRAME");
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for TEXT pair with different parent types", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Label", "GROUP");
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when parent is missing", () => {
    const a = textNode("a", "Label", null);
    const b = textNode("b", "Label", null);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });
});
