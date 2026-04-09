import { describe, it, expect } from "vitest";
import { InstanceSpecialMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/InstanceSpecialMatch";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
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

const ctx = { policy: defaultMatchingPolicy } as any;

describe("InstanceSpecialMatch signal", () => {
  const signal = new InstanceSpecialMatch();

  it("returns decisive-match-with-cost 0.05 when both INSTANCE share visible ref", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b", "showIcon");
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBe(0.05);
  });

  it("returns neutral when visible refs differ", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b", "showLabel");
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral for non-INSTANCE pair", () => {
    const a = { id: "a", name: "x", type: "FRAME", children: [] } as any;
    const b = { id: "b", name: "x", type: "FRAME", children: [] } as any;
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when only one side has visible ref", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b");
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });
});
