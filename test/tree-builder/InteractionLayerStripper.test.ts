import { describe, it, expect } from "vitest";
import { isInteractionLayer } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { mapFigmaStateToPseudo } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { mergePseudoIntoParent } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import type { InternalNode, StyleObject } from "@code-generator2/types/types";

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

describe("mapFigmaStateToPseudo", () => {
  it("maps Normal to null (no pseudo)", () => {
    expect(mapFigmaStateToPseudo("Normal")).toBeNull();
  });

  it("maps Hover to :hover", () => {
    expect(mapFigmaStateToPseudo("Hover")).toBe(":hover");
  });

  it("maps Pressed to :active", () => {
    expect(mapFigmaStateToPseudo("Pressed")).toBe(":active");
  });

  it("maps Focused to :focus", () => {
    expect(mapFigmaStateToPseudo("Focused")).toBe(":focus");
  });

  it("maps Disabled to :disabled", () => {
    expect(mapFigmaStateToPseudo("Disabled")).toBe(":disabled");
  });

  it("is case-insensitive", () => {
    expect(mapFigmaStateToPseudo("hover")).toBe(":hover");
    expect(mapFigmaStateToPseudo("PRESSED")).toBe(":active");
  });

  it("returns null for unknown values", () => {
    expect(mapFigmaStateToPseudo("Weird")).toBeNull();
    expect(mapFigmaStateToPseudo("")).toBeNull();
  });
});

describe("mergePseudoIntoParent", () => {
  function makeNode(styles?: StyleObject): InternalNode {
    return {
      id: "p",
      name: "parent",
      type: "FRAME",
      children: [],
      styles,
    } as unknown as InternalNode;
  }

  it("creates pseudo field on parent without styles", () => {
    const p = makeNode();
    mergePseudoIntoParent(p, ":hover", { background: "#000" });
    expect(p.styles?.pseudo?.[":hover"]).toEqual({ background: "#000" });
  });

  it("creates pseudo field on parent with base styles only", () => {
    const p = makeNode({ base: { color: "red" }, dynamic: [] });
    mergePseudoIntoParent(p, ":hover", { background: "#000" });
    expect(p.styles?.base).toEqual({ color: "red" });
    expect(p.styles?.pseudo?.[":hover"]).toEqual({ background: "#000" });
  });

  it("merges into existing pseudo entry without overwriting", () => {
    const p = makeNode({
      base: {},
      dynamic: [],
      pseudo: { ":hover": { background: "red" } },
    });
    mergePseudoIntoParent(p, ":hover", { background: "#000", opacity: 0.5 });
    // 기존 background 우선 (덮어쓰기 안 함), opacity는 새로 추가
    expect(p.styles?.pseudo?.[":hover"]).toEqual({
      background: "red",
      opacity: 0.5,
    });
  });

  it("adds different pseudo entries side by side", () => {
    const p = makeNode({
      base: {},
      dynamic: [],
      pseudo: { ":hover": { background: "red" } },
    });
    mergePseudoIntoParent(p, ":active", { background: "#000" });
    expect(p.styles?.pseudo?.[":hover"]).toEqual({ background: "red" });
    expect(p.styles?.pseudo?.[":active"]).toEqual({ background: "#000" });
  });

  it("does nothing for empty style map", () => {
    const p = makeNode({ base: {}, dynamic: [] });
    mergePseudoIntoParent(p, ":hover", {});
    // pseudo 필드는 생성됐지만 :hover 항목은 빈 객체
    expect(p.styles?.pseudo?.[":hover"] ?? {}).toEqual({});
  });
});
