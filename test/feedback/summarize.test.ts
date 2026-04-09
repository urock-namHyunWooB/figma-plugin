import { describe, it, expect } from "vitest";
import { summarizeGroup, summarizeItem } from "@code-generator2/feedback/summarize";
import type { FeedbackItem } from "@code-generator2/feedback/types";

function mkItem(cssProperty: string, actualValue: string, expectedValue: string | null): FeedbackItem {
  return {
    id: "i1",
    cssProperty,
    actualValue,
    expectedValue,
    nodeId: "n1",
    variantCoordinate: { Type: "Primary", State: "Hover" },
    canAutoFix: expectedValue !== null,
    reason: "",
  };
}

describe("summarize", () => {
  it("단일 item 요약은 속성명과 variant 좌표를 포함한다", () => {
    const item = mkItem("background", "#10B981", "#3B82F6");
    expect(summarizeItem(item)).toContain("background");
    expect(summarizeItem(item)).toContain("#10B981");
    expect(summarizeItem(item)).toContain("#3B82F6");
  });

  it("그룹 요약은 variant 좌표 + 속성 갯수를 표시", () => {
    const items = [
      mkItem("background", "#10B981", "#3B82F6"),
      mkItem("border-color", "#059669", "#2563EB"),
      mkItem("color", "#fff", "#fff"),
    ];
    const summary = summarizeGroup(items, { Type: "Primary", State: "Hover" });
    expect(summary).toContain("Type=Primary");
    expect(summary).toContain("State=Hover");
    expect(summary).toMatch(/3/);
  });

  it("단일 속성 그룹은 속성명을 직접 표기", () => {
    const items = [mkItem("padding", "12px", "16px")];
    const summary = summarizeGroup(items, { Size: "Large" });
    expect(summary).toContain("padding");
    expect(summary).toContain("Size=Large");
  });
});
