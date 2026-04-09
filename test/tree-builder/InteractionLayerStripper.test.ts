import { describe, it, expect } from "vitest";
import { isInteractionLayer } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import type { InternalNode } from "@code-generator2/types/types";

function node(name: string, type: string, children: InternalNode[] = []): InternalNode {
  return { id: name, name, type, children } as unknown as InternalNode;
}

describe("isInteractionLayer", () => {
  it("returns true for FRAME named Interaction with single INSTANCE child", () => {
    const inst = node("Interaction", "INSTANCE");
    const frame = node("Interaction", "FRAME", [inst]);
    expect(isInteractionLayer(frame)).toBe(true);
  });

  it("returns true for FRAME named Interaction with zero children", () => {
    const frame = node("Interaction", "FRAME", []);
    expect(isInteractionLayer(frame)).toBe(true);
  });

  it("returns true for nested Interaction (child is FRAME named Interaction)", () => {
    const inner = node("Interaction", "FRAME", [node("Interaction", "INSTANCE")]);
    const outer = node("Interaction", "FRAME", [inner]);
    expect(isInteractionLayer(outer)).toBe(true);
  });

  it("returns false for FRAME with name other than Interaction", () => {
    const frame = node("Wrapper", "FRAME", [node("Interaction", "INSTANCE")]);
    expect(isInteractionLayer(frame)).toBe(false);
  });

  it("returns false for non-FRAME type even if name matches", () => {
    const inst = node("Interaction", "INSTANCE");
    expect(isInteractionLayer(inst)).toBe(false);
  });

  it("returns false for FRAME with 2 children (defensive)", () => {
    const frame = node("Interaction", "FRAME", [
      node("a", "INSTANCE"),
      node("b", "INSTANCE"),
    ]);
    expect(isInteractionLayer(frame)).toBe(false);
  });

  it("name match is case-sensitive ('interaction' lowercase fails)", () => {
    const frame = node("interaction", "FRAME", []);
    expect(isInteractionLayer(frame)).toBe(false);
  });
});
