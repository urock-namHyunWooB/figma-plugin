import { describe, it, expect } from "vitest";
import { isInteractionLayer } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { mapFigmaStateToPseudo } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { mergePseudoIntoParent } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { extractInteractionStyles } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
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

describe("extractInteractionStyles", () => {
  function makeMockDataManager(opts: {
    spec: any;
    nodes?: Record<string, any>;
  }): any {
    return {
      getById: (id: string) => {
        if (opts.nodes && opts.nodes[id]) return { node: opts.nodes[id], spec: opts.spec };
        return { spec: opts.spec };
      },
      getMainComponentId: () => "doc-root",
    };
  }

  it("returns empty object when interaction frame has no children", () => {
    const interactionFrame = node("Interaction", "FRAME");
    const dm = makeMockDataManager({ spec: { info: { components: {}, componentSets: {} } } });
    expect(extractInteractionStyles(interactionFrame, dm)).toEqual({});
  });

  it("returns empty object when only Normal variant exists (no pseudo to extract)", () => {
    const childInst: any = {
      id: "child-inst",
      name: "Interaction",
      type: "INSTANCE",
      mergedNodes: [{ id: "raw-inst-id" }],
    };
    const interactionFrame = { id: "f", name: "Interaction", type: "FRAME", children: [childInst] } as unknown as InternalNode;
    const spec = {
      info: {
        components: {
          "comp-normal": { name: "State=Normal", componentSetId: "set-1" },
        },
        componentSets: { "set-1": { name: "Interaction/Normal" } },
      },
    };
    const rawInst = {
      id: "raw-inst-id",
      componentId: "comp-normal",
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    };
    const dm = makeMockDataManager({ spec, nodes: { "raw-inst-id": rawInst } });

    const result = extractInteractionStyles(interactionFrame, dm);
    // Normal은 default → pseudo entry 생성 안 함
    expect(result).toEqual({});
  });

  it("extracts :hover when State=Hover variant exists", () => {
    const childInst: any = {
      id: "child-inst",
      name: "Interaction",
      type: "INSTANCE",
      mergedNodes: [{ id: "raw-inst-id" }],
    };
    const interactionFrame = { id: "f", name: "Interaction", type: "FRAME", children: [childInst] } as unknown as InternalNode;
    const spec = {
      info: {
        components: {
          "comp-normal": { name: "State=Normal", componentSetId: "set-1" },
          "comp-hover": { name: "State=Hover", componentSetId: "set-1" },
        },
        componentSets: { "set-1": { name: "Interaction/Normal" } },
      },
    };
    const rawInst = {
      id: "raw-inst-id",
      componentId: "comp-normal",
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    };
    const hoverComp = {
      id: "comp-hover",
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 0.5 } }],
    };
    const dm = makeMockDataManager({
      spec,
      nodes: { "raw-inst-id": rawInst, "comp-hover": hoverComp },
    });

    const result = extractInteractionStyles(interactionFrame, dm);
    expect(result[":hover"]).toBeDefined();
    expect(result[":hover"]?.background).toMatch(/rgba?\(/);
  });

  it("returns empty object when child INSTANCE has no fills", () => {
    const childInst: any = {
      id: "child-inst",
      name: "Interaction",
      type: "INSTANCE",
      mergedNodes: [{ id: "raw-inst-id" }],
    };
    const interactionFrame = { id: "f", name: "Interaction", type: "FRAME", children: [childInst] } as unknown as InternalNode;
    const spec = {
      info: { components: {}, componentSets: {} },
    };
    const dm = makeMockDataManager({ spec, nodes: { "raw-inst-id": { id: "raw-inst-id" } } });
    expect(extractInteractionStyles(interactionFrame, dm)).toEqual({});
  });
});
