import { describe, it, expect } from "vitest";
import { detectDisjointVariants } from "./detectDisjointVariants";
import type { InternalNode } from "@code-generator2/types/types";

function node(
  id: string,
  variantNames: string[],
  children: InternalNode[] = []
): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children,
    mergedNodes: variantNames.map((v) => ({
      id: `${id}-${v}`,
      name: id,
      variantName: v,
    })),
  } as unknown as InternalNode;
}

describe("detectDisjointVariants", () => {
  it("returns empty when siblings share at least one variant", () => {
    const parent = node("root", ["S=S", "S=L"], [
      node("a", ["S=S", "S=L"]),
      node("b", ["S=S", "S=L"]),
    ]);
    expect(detectDisjointVariants(parent)).toEqual([]);
  });

  it("flags siblings with disjoint variant sets", () => {
    const parent = node("root", ["S=S", "S=L"], [
      node("a", ["S=S"]),
      node("b", ["S=L"]),
    ]);
    const result = detectDisjointVariants(parent);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      parentId: "root",
      pair: [{ id: "a" }, { id: "b" }],
      variantsA: ["S=S"],
      variantsB: ["S=L"],
    });
  });

  it("recurses into children to detect nested disjoint siblings", () => {
    const deeper = node("inner", ["S=S", "S=L"], [
      node("x", ["S=S"]),
      node("y", ["S=L"]),
    ]);
    const parent = node("root", ["S=S", "S=L"], [deeper]);
    const result = detectDisjointVariants(parent);
    expect(result).toHaveLength(1);
    expect(result[0].parentId).toBe("inner");
  });

  it("handles nodes without mergedNodes as empty variant set", () => {
    const parent = node("root", ["S=S", "S=L"], [
      { id: "a", name: "a", type: "FRAME", children: [] } as unknown as InternalNode,
      node("b", ["S=L"]),
    ]);
    // a has no variants → not disjoint (empty set ∩ anything = empty, but we skip empties)
    expect(detectDisjointVariants(parent)).toEqual([]);
  });
});
