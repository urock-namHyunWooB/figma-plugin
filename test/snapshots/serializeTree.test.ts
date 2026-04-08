import { describe, it, expect } from "vitest";
import { serializeTree } from "./serializeTree";
import type { InternalNode } from "@code-generator2/types/types";

function n(id: string, children: InternalNode[] = []): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children,
  } as unknown as InternalNode;
}

describe("serializeTree", () => {
  it("preserves id, name, type, children order", () => {
    const tree = n("root", [n("a"), n("b"), n("c")]);
    const out = serializeTree(tree);
    expect(out).toMatchObject({
      id: "root",
      name: "root",
      type: "FRAME",
      children: [
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ],
    });
  });

  it("removes parent back-reference (breaks cycles)", () => {
    const parent = n("p");
    const child = n("c");
    (child as any).parent = parent;
    parent.children = [child];
    const out = serializeTree(parent);
    // Should not throw and should not contain 'parent' field
    const json = JSON.stringify(out);
    expect(json).not.toContain('"parent"');
  });

  it("includes mergedNodes variantNames", () => {
    const tree = n("root");
    (tree as any).mergedNodes = [
      { id: "v1", name: "root", variantName: "Size=S" },
      { id: "v2", name: "root", variantName: "Size=L" },
    ];
    const out = serializeTree(tree);
    expect((out as any).mergedNodes).toEqual([
      { id: "v1", variantName: "Size=S" },
      { id: "v2", variantName: "Size=L" },
    ]);
  });
});
