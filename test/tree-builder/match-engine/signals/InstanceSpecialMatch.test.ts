import { describe, it, expect } from "vitest";
import { InstanceSpecialMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/InstanceSpecialMatch";
import type { InternalNode } from "@code-generator2/types/types";

function instanceNode(id: string, visibleRef?: string, componentId?: string): InternalNode {
  return {
    id,
    name: "inst",
    type: "INSTANCE",
    children: [],
    componentId,
    componentPropertyReferences: visibleRef ? { visible: visibleRef } : undefined,
  } as unknown as InternalNode;
}

describe("InstanceSpecialMatch signal", () => {
  const signal = new InstanceSpecialMatch();

  it("returns score 1 when both INSTANCE share visible ref", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b", "showIcon");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 0 when visible refs differ", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b", "showLabel");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 for non-INSTANCE pair", () => {
    const a = { id: "a", name: "x", type: "FRAME", children: [] } as any;
    const b = { id: "b", name: "x", type: "FRAME", children: [] } as any;
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when only one side has visible ref", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });
});
