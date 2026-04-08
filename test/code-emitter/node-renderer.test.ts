import { describe, it, expect } from "vitest";
import { NodeRenderer, type NodeRendererContext } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer";
import { EmotionStrategy } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy";
import type { UINode } from "@frontend/ui/domain/code-generator2/types/types";

function makeCtx(): NodeRendererContext {
  return {
    styleStrategy: new EmotionStrategy(),
    debug: false,
    nodeStyleMap: new Map(),
    slotProps: new Set(),
    booleanProps: new Set(),
    booleanWithExtras: new Set(),
    propRenameMap: new Map(),
    arraySlots: new Map(),
    availableVarNames: new Set(),
    componentMapDeclarations: [],
    collectedDiagnostics: [],
  };
}

describe("NodeRenderer", () => {
  it("renders a simple text node", () => {
    const node = {
      id: "n1", name: "label", type: "text",
      textSegments: [{ text: "Hello" }],
    } as unknown as UINode;
    const out = NodeRenderer.generateNode(makeCtx(), node, 0, false);
    expect(out).toContain("Hello");
  });

  it("wraps a node with visibleCondition", () => {
    const node = {
      id: "n1", name: "x", type: "container", children: [],
      visibleCondition: { type: "truthy", prop: "show" },
    } as unknown as UINode;
    const out = NodeRenderer.generateNode(makeCtx(), node, 0, false);
    expect(out).toMatch(/show && \(/);
  });
});
