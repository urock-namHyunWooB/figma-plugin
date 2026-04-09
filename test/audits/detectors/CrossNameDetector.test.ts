import { describe, it, expect } from "vitest";
import type { InternalNode, InternalTree } from "@code-generator2/types/types";
import { CrossNameDetector } from "./CrossNameDetector";

const ctx = {} as any;

function makeNode(
  id: string,
  type: string,
  merged: Array<{ id: string; name: string; variantName: string }>
): InternalNode {
  return {
    id,
    type: type as any,
    name: merged[0]?.name ?? "",
    children: [],
    mergedNodes: merged,
  } as any;
}

describe("CrossNameDetector", () => {
  it("returns null for variant root (depth 0)", () => {
    const node = makeNode("root", "FRAME", [
      { id: "r1", name: "Size=Large", variantName: "Size=Large" },
      { id: "r2", name: "Size=Small", variantName: "Size=Small" },
    ]);
    const det = new CrossNameDetector();
    expect(det.detect(node, 0, ctx)).toBeNull();
  });

  it("returns null when all merged names are identical", () => {
    const node = makeNode("n1", "FRAME", [
      { id: "a", name: "Wrapper", variantName: "v1" },
      { id: "b", name: "Wrapper", variantName: "v2" },
      { id: "c", name: "Wrapper", variantName: "v3" },
    ]);
    const det = new CrossNameDetector();
    expect(det.detect(node, 1, ctx)).toBeNull();
  });

  it("returns null when mergedNodes has fewer than 2 entries", () => {
    const node = makeNode("n1", "FRAME", [
      { id: "a", name: "Wrapper", variantName: "v1" },
    ]);
    const det = new CrossNameDetector();
    expect(det.detect(node, 1, ctx)).toBeNull();
  });

  it("detects mixed names and reports primary + outliers", () => {
    const node = makeNode("n1", "FRAME", [
      { id: "a1", name: "Interaction", variantName: "v1" },
      { id: "a2", name: "Interaction", variantName: "v2" },
      { id: "a3", name: "Interaction", variantName: "v3" },
      { id: "b1", name: "Wrapper", variantName: "v4" },
    ]);
    const det = new CrossNameDetector();
    const result = det.detect(node, 1, ctx);
    expect(result).not.toBeNull();
    expect(result!.primaryName).toBe("Interaction");
    expect(result!.detectorName).toBe("cross-name");
    const payload = result!.payload as any;
    expect(payload.outlierNames).toEqual([{ name: "Wrapper", count: 1 }]);
    expect(payload.mergedNodesCount).toBe(4);
    expect(payload.outlierMerged).toHaveLength(1);
    expect(payload.outlierMerged[0].id).toBe("b1");
  });
});
