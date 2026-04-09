import { describe, it, expect } from "vitest";
import { TypeCompatibility } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TypeCompatibility";
import type { InternalNode } from "@code-generator2/types/types";

function node(type: string): InternalNode {
  return { id: "n", name: "n", type, children: [] } as unknown as InternalNode;
}

describe("TypeCompatibility signal", () => {
  const signal = new TypeCompatibility();

  it("returns neutral for identical types", () => {
    const r = signal.evaluate(node("FRAME"), node("FRAME"), {} as any);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for same shape group", () => {
    const r = signal.evaluate(node("RECTANGLE"), node("VECTOR"), {} as any);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for same container group", () => {
    const r = signal.evaluate(node("GROUP"), node("FRAME"), {} as any);
    expect(r.kind).toBe("neutral");
  });

  it("returns veto for cross-group types", () => {
    const r = signal.evaluate(node("TEXT"), node("FRAME"), {} as any);
    expect(r.kind).toBe("veto");
  });

  it("returns veto for shape ↔ container", () => {
    const r = signal.evaluate(node("RECTANGLE"), node("FRAME"), {} as any);
    expect(r.kind).toBe("veto");
  });

  it("property: signal is symmetric", () => {
    const pairs: Array<[string, string]> = [
      ["FRAME", "GROUP"],
      ["RECTANGLE", "VECTOR"],
      ["TEXT", "FRAME"],
      ["INSTANCE", "INSTANCE"],
    ];
    for (const [a, b] of pairs) {
      const r1 = signal.evaluate(node(a), node(b), {} as any);
      const r2 = signal.evaluate(node(b), node(a), {} as any);
      expect(r1.kind).toBe(r2.kind);
    }
  });
});
