import { describe, it, expect } from "vitest";
import { ParentShapeIdentity } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/ParentShapeIdentity";
import type { InternalNode } from "@code-generator2/types/types";

function nodeWithParent(id: string, parentName: string, parentType: string, parentRefId?: string): InternalNode {
  return {
    id,
    name: id,
    type: "RECTANGLE",
    children: [],
    parent: {
      id: `parent-${id}`,
      name: parentName,
      type: parentType,
      refId: parentRefId,
    },
  } as unknown as InternalNode;
}

describe("ParentShapeIdentity signal", () => {
  const signal = new ParentShapeIdentity();

  it("returns score 1 when parents have same name + type + refId", () => {
    const a = nodeWithParent("a", "Mono", "FRAME", "comp-42");
    const b = nodeWithParent("b", "Mono", "FRAME", "comp-42");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 0.75 when parents have same name + type but different refId", () => {
    const a = nodeWithParent("a", "Mono", "FRAME", "comp-42");
    const b = nodeWithParent("b", "Mono", "FRAME", "comp-99");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0.75);
  });

  it("returns score 0.5 when parents have same type but different name", () => {
    const a = nodeWithParent("a", "Mono", "FRAME");
    const b = nodeWithParent("b", "Chroma", "FRAME");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0.5);
  });

  it("returns neutral when parents differ in type", () => {
    const a = nodeWithParent("a", "Mono", "FRAME");
    const b = nodeWithParent("b", "Mono", "GROUP");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when either parent is missing", () => {
    const a = nodeWithParent("a", "Mono", "FRAME");
    const b = { id: "b", name: "b", type: "RECTANGLE", children: [] } as unknown as InternalNode;
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("neutral");
  });
});
