import { describe, it, expect } from "vitest";
import type { InternalNode, DesignPattern } from "@code-generator2/types/types";

describe("DesignPattern types", () => {
  it("alphaMask annotation이 metadata.designPatterns에 할당 가능", () => {
    const pattern: DesignPattern = {
      type: "alphaMask",
      visibleRef: "Loading#29474:0",
    };
    const node = { metadata: { designPatterns: [pattern] } } as Partial<InternalNode>;
    expect(node.metadata!.designPatterns![0].type).toBe("alphaMask");
  });

  it("모든 패턴 타입이 할당 가능", () => {
    const patterns: DesignPattern[] = [
      { type: "alphaMask", visibleRef: "Loading#29474:0" },
      { type: "interactionFrame" },
      { type: "fullCoverBackground" },
      { type: "statePseudoClass", prop: "state", stateMap: { Hover: ":hover" } },
      { type: "breakpointVariant", prop: "breakpoint" },
      { type: "booleanPositionSwap", prop: "active" },
    ];
    expect(patterns).toHaveLength(6);
  });
});
