import { describe, it, expect } from "vitest";
import { classifyPattern } from "./classifyPattern";
import type { DisjointPair } from "./detectDisjointVariants";

function pair(variantsA: string[], variantsB: string[]): DisjointPair {
  return {
    parentId: "p",
    pair: [{ id: "a", name: "a" }, { id: "b", name: "b" }],
    variantsA,
    variantsB,
  };
}

describe("classifyPattern", () => {
  it("classifies Size-only diff as size-variant-reject", () => {
    const p = pair(["Size=Small, State=Default"], ["Size=Large, State=Default"]);
    expect(classifyPattern(p)).toBe("size-variant-reject");
  });

  it("classifies boolean-prop diff as variant-prop-position", () => {
    const p = pair(["LeftIcon=False, State=Default"], ["LeftIcon=True, State=Default"]);
    expect(classifyPattern(p)).toBe("variant-prop-position");
  });

  it("returns unknown for multi-prop diffs", () => {
    const p = pair(["Size=Small, State=Hover"], ["Size=Large, State=Default"]);
    expect(classifyPattern(p)).toBe("unknown");
  });

  it("returns unknown when variantNames cannot be parsed", () => {
    const p = pair(["weird"], ["thing"]);
    expect(classifyPattern(p)).toBe("unknown");
  });
});
