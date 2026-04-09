import { describe, it, expect } from "vitest";
import { FeedbackBuilder } from "@code-generator2/feedback/FeedbackBuilder";
import type { VariantInconsistency } from "@code-generator2/types/types";

function mkInconsistency(
  nodeId: string,
  cssProperty: string,
  propName: string,
  propValue: string,
  variants: Array<{ props: Record<string, string>; value: string }>,
  expectedValue: string | null
): VariantInconsistency {
  return {
    cssProperty,
    propName,
    propValue,
    nodeId,
    nodeName: "Button",
    variants,
    expectedValue,
  };
}

describe("FeedbackBuilder", () => {
  it("같은 nodeId + variantCoordinate 항목을 한 그룹으로 묶는다", () => {
    const diagnostics: VariantInconsistency[] = [
      mkInconsistency("node1", "background", "type", "primary",
        [
          { props: { type: "primary", state: "hover" }, value: "#10B981" },
          { props: { type: "primary", state: "default" }, value: "#3B82F6" },
        ],
        "#3B82F6"),
      mkInconsistency("node1", "border-color", "type", "primary",
        [
          { props: { type: "primary", state: "hover" }, value: "#059669" },
          { props: { type: "primary", state: "default" }, value: "#2563EB" },
        ],
        "#2563EB"),
    ];

    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].sharedContext.nodeId).toBe("node1");
    expect(groups[0].sharedContext.variantCoordinate).toEqual({ type: "primary", state: "hover" });
  });

  it("다른 nodeId는 다른 그룹", () => {
    const diagnostics = [
      mkInconsistency("node1", "background", "type", "primary",
        [
          { props: { type: "primary" }, value: "#10B981" },
          { props: { type: "primary" }, value: "#3B82F6" },
        ],
        "#3B82F6"),
      mkInconsistency("node2", "background", "type", "primary",
        [
          { props: { type: "primary" }, value: "#A00" },
          { props: { type: "primary" }, value: "#B00" },
        ],
        "#B00"),
    ];
    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups).toHaveLength(2);
  });

  it("expectedValue가 null이면 canAutoFix=false", () => {
    const diagnostics = [
      mkInconsistency("node1", "background", "type", "primary",
        [
          { props: { type: "primary", state: "hover" }, value: "#A00" },
          { props: { type: "primary", state: "default" }, value: "#B00" },
        ],
        null),
    ];
    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups[0].items[0].canAutoFix).toBe(false);
    expect(groups[0].canAutoFixGroup).toBe(false);
  });

  it("nodeId가 없는 진단은 필터아웃", () => {
    const diagnostics = [
      {
        cssProperty: "padding",
        propName: "size",
        propValue: "L",
        variants: [{ props: { size: "L" }, value: "12px" }],
        expectedValue: "16px",
      } as VariantInconsistency,
    ];
    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups).toHaveLength(0);
  });
});
