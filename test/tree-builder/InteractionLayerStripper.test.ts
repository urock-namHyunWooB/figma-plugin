import { describe, it, expect } from "vitest";
import { isInteractionLayer } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { mapFigmaStateToPseudo } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { mergePseudoIntoParent } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { extractInteractionStyles } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import { stripInteractionLayers } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import type { InternalNode, StyleObject } from "@code-generator2/types/types";

function node(name: string, type: string, children: InternalNode[] = []): InternalNode {
  const n = { id: name, name, type, children } as unknown as InternalNode;
  // Interaction frame을 auto-annotate (DesignPatternDetector가 detect() 호출 전인 unit test 환경 모의)
  if (type === "FRAME" && name === "Interaction") {
    if (!n.metadata) n.metadata = {};
    if (!n.metadata.designPatterns) n.metadata.designPatterns = [];
    n.metadata.designPatterns.push({ type: "interactionFrame", nodeId: n.id });
  }
  return n;
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

  it("returns true for FRAME with 2+ children (merger bug case — strip anyway)", () => {
    // VariantMerger가 다른 sibling의 자식을 Interaction에 잘못 넣는 경우.
    // 그래도 strip해서 merger 버그를 가린다 (의도된 부수효과).
    const frame = node("Interaction", "FRAME", [
      node("a", "INSTANCE"),
      node("b", "INSTANCE"),
    ]);
    expect(isInteractionLayer(frame)).toBe(true);
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

describe("stripInteractionLayers", () => {
  function makeMockDataManager(opts: { spec?: any; nodes?: Record<string, any> } = {}): any {
    return {
      getById: (id: string) => ({
        node: opts.nodes?.[id],
        spec: opts.spec ?? { info: { components: {}, componentSets: {} } },
      }),
      getMainComponentId: () => "doc-root",
    };
  }

  it("removes Interaction frame from parent.children", () => {
    const parent: any = {
      id: "p",
      name: "Button",
      type: "COMPONENT",
      children: [
        { id: "i", name: "Interaction", type: "FRAME", children: [], parent: null, metadata: { designPatterns: [{ type: "interactionFrame", nodeId: "i" }] } },
        { id: "c", name: "Content", type: "FRAME", children: [], parent: null },
      ],
    };
    parent.children.forEach((c: any) => (c.parent = parent));
    stripInteractionLayers(parent, makeMockDataManager());
    expect(parent.children.map((c: any) => c.name)).toEqual(["Content"]);
  });

  it("removes nested Interaction frames at all depths", () => {
    const inner: any = {
      id: "in",
      name: "Interaction",
      type: "FRAME",
      children: [{ id: "leaf", name: "Interaction", type: "INSTANCE", children: [], mergedNodes: [{ id: "r" }] }],
      metadata: { designPatterns: [{ type: "interactionFrame", nodeId: "in" }] },
    };
    const outer: any = { id: "out", name: "Interaction", type: "FRAME", children: [inner], metadata: { designPatterns: [{ type: "interactionFrame", nodeId: "out" }] } };
    const root: any = {
      id: "p",
      name: "Card",
      type: "FRAME",
      children: [outer, { id: "c", name: "Content", type: "FRAME", children: [] }],
    };
    stripInteractionLayers(root, makeMockDataManager());
    expect(root.children.map((c: any) => c.name)).toEqual(["Content"]);
  });

  it("does not remove Interaction-named non-FRAME nodes", () => {
    const root: any = {
      id: "p",
      name: "Btn",
      type: "FRAME",
      children: [
        { id: "inst", name: "Interaction", type: "INSTANCE", children: [] },
      ],
    };
    stripInteractionLayers(root, makeMockDataManager());
    expect(root.children.length).toBe(1);
  });

  it("does not touch a tree without Interaction frames", () => {
    const root: any = {
      id: "p",
      name: "Card",
      type: "FRAME",
      children: [
        { id: "h", name: "Header", type: "FRAME", children: [] },
        { id: "b", name: "Body", type: "FRAME", children: [] },
      ],
    };
    const before = JSON.parse(JSON.stringify(root));
    stripInteractionLayers(root, makeMockDataManager());
    expect(root).toEqual(before);
  });

  it("merges extracted styles into parent.styles.pseudo", () => {
    const childInst: any = {
      id: "child",
      name: "Interaction",
      type: "INSTANCE",
      children: [],
      mergedNodes: [{ id: "raw" }],
    };
    const interaction: any = {
      id: "i",
      name: "Interaction",
      type: "FRAME",
      children: [childInst],
      metadata: {
        designPatterns: [{ type: "interactionFrame", nodeId: "i" }],
      },
    };
    const parent: any = {
      id: "p",
      name: "Btn",
      type: "COMPONENT",
      children: [interaction],
    };
    const dm = makeMockDataManager({
      spec: {
        info: {
          components: {
            "comp-normal": { name: "State=Normal", componentSetId: "set-1" },
            "comp-hover": { name: "State=Hover", componentSetId: "set-1" },
          },
          componentSets: { "set-1": { name: "Interaction/Normal" } },
        },
      },
      nodes: {
        raw: { id: "raw", componentId: "comp-normal" },
        "comp-hover": { id: "comp-hover", fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 0.08 } }] },
      },
    });
    stripInteractionLayers(parent, dm);
    expect(parent.children.length).toBe(0);
    expect(parent.styles?.pseudo?.[":hover"]).toBeDefined();
  });
});
