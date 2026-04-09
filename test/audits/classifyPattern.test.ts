import { describe, it, expect } from "vitest";
import { classifyPattern } from "./classifyPattern";
import type { DisjointPair } from "./detectDisjointVariants";

function pair(
  variantsA: string[],
  variantsB: string[],
  opts: {
    nameA?: string;
    nameB?: string;
    typeA?: string;
    typeB?: string;
  } = {},
): DisjointPair {
  return {
    parentId: "p",
    pair: [
      { id: "a", name: opts.nameA ?? "a", type: opts.typeA ?? "FRAME" },
      { id: "b", name: opts.nameB ?? "b", type: opts.typeB ?? "FRAME" },
    ],
    variantsA,
    variantsB,
  };
}

describe("classifyPattern (Phase 3)", () => {
  // Step 1: variantName-based classification (legacy)
  it("classifies Size-only diff as size-variant-reject", () => {
    const p = pair(["Size=Small, State=Default"], ["Size=Large, State=Default"]);
    expect(classifyPattern(p)).toBe("size-variant-reject");
  });

  it("classifies boolean-prop diff as variant-prop-position", () => {
    const p = pair(["LeftIcon=False, State=Default"], ["LeftIcon=True, State=Default"]);
    expect(classifyPattern(p)).toBe("variant-prop-position");
  });

  // Step 2: metadata-based classification (new)
  it("classifies same-name + same-type as same-name-same-type", () => {
    const p = pair(["Size=Small, State=Hover"], ["Size=Large, State=Default"], {
      nameA: "Icon",
      nameB: "Icon",
      typeA: "FRAME",
      typeB: "FRAME",
    });
    expect(classifyPattern(p)).toBe("same-name-same-type");
  });

  it("classifies same-name + cross-shape as same-name-same-type (compatible)", () => {
    const p = pair(["A"], ["B"], {
      nameA: "Icon",
      nameB: "Icon",
      typeA: "RECTANGLE",
      typeB: "VECTOR",
    });
    expect(classifyPattern(p)).toBe("same-name-same-type");
  });

  it("classifies same-name + incompatible-type as same-name-cross-type", () => {
    const p = pair(["A"], ["B"], {
      nameA: "Icon",
      nameB: "Icon",
      typeA: "TEXT",
      typeB: "FRAME",
    });
    expect(classifyPattern(p)).toBe("same-name-cross-type");
  });

  it("classifies different-name + incompatible-type as different-type", () => {
    const p = pair(["A"], ["B"], {
      nameA: "Label",
      nameB: "Icon",
      typeA: "TEXT",
      typeB: "FRAME",
    });
    expect(classifyPattern(p)).toBe("different-type");
  });

  it("classifies different-name + compatible-type as different-name", () => {
    const p = pair(["A"], ["B"], {
      nameA: "Label",
      nameB: "Title",
      typeA: "TEXT",
      typeB: "TEXT",
    });
    expect(classifyPattern(p)).toBe("different-name");
  });
});
