import { describe, it, expect } from "vitest";
import { IdMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/IdMatch";
import type { InternalNode } from "@code-generator2/types/types";

function node(id: string): InternalNode {
  return { id, name: id, type: "FRAME", children: [] } as unknown as InternalNode;
}

describe("IdMatch signal", () => {
  const signal = new IdMatch();

  it("returns decisive-match for identical ids", () => {
    const r = signal.evaluate(node("x"), node("x"), {} as any);
    expect(r.kind).toBe("decisive-match");
  });

  it("returns neutral for different ids", () => {
    const r = signal.evaluate(node("x"), node("y"), {} as any);
    expect(r.kind).toBe("neutral");
  });

  it("property: reflexive (node matches itself decisively)", () => {
    const n = node("self");
    const r = signal.evaluate(n, n, {} as any);
    expect(r.kind).toBe("decisive-match");
  });

  it("property: symmetric", () => {
    const r1 = signal.evaluate(node("a"), node("b"), {} as any);
    const r2 = signal.evaluate(node("b"), node("a"), {} as any);
    expect(r1.kind).toBe(r2.kind);
  });
});
