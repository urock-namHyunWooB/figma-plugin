import { describe, it, expect } from "vitest";
import { applyFix, applyFixes } from "@backend/handlers/feedbackFixHandler";

interface MockNode {
  id: string;
  type: string;
  fills: unknown[];
  strokes: unknown[];
  cornerRadius: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  itemSpacing: number;
  opacity: number;
}

function mockFrameNode(overrides: Partial<MockNode> = {}): MockNode {
  return {
    id: "n1",
    type: "FRAME",
    fills: [],
    strokes: [],
    cornerRadius: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    itemSpacing: 0,
    opacity: 1,
    ...overrides,
  };
}

describe("feedbackFixHandler.applyFix", () => {
  it("background hex → node.fills solid paint", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "background", expectedValue: "#3B82F6" });
    expect(result.success).toBe(true);
    expect(node.fills).toHaveLength(1);
    const paint = node.fills[0] as { type: string; color: { r: number; g: number; b: number } };
    expect(paint.type).toBe("SOLID");
    expect(paint.color.r).toBeCloseTo(59 / 255, 5);
    expect(paint.color.g).toBeCloseTo(130 / 255, 5);
    expect(paint.color.b).toBeCloseTo(246 / 255, 5);
  });

  it("background-color도 background와 동일하게 동작", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "background-color", expectedValue: "#fff" });
    expect(result.success).toBe(true);
    expect(node.fills).toHaveLength(1);
  });

  it("border-color hex → node.strokes", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "border-color", expectedValue: "#10B981" });
    expect(result.success).toBe(true);
    expect(node.strokes).toHaveLength(1);
    const stroke = node.strokes[0] as { type: string };
    expect(stroke.type).toBe("SOLID");
  });

  it("padding-top px → node.paddingTop 숫자", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "padding-top", expectedValue: "12px" });
    expect(result.success).toBe(true);
    expect(node.paddingTop).toBe(12);
  });

  it("padding-left, padding-right, padding-bottom 모두 동작", () => {
    const node = mockFrameNode();
    applyFix(node, { cssProperty: "padding-left", expectedValue: "4px" });
    applyFix(node, { cssProperty: "padding-right", expectedValue: "5px" });
    applyFix(node, { cssProperty: "padding-bottom", expectedValue: "6px" });
    expect(node.paddingLeft).toBe(4);
    expect(node.paddingRight).toBe(5);
    expect(node.paddingBottom).toBe(6);
  });

  it("border-radius px → node.cornerRadius 숫자", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "border-radius", expectedValue: "8px" });
    expect(result.success).toBe(true);
    expect(node.cornerRadius).toBe(8);
  });

  it("gap px → node.itemSpacing", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "gap", expectedValue: "10px" });
    expect(result.success).toBe(true);
    expect(node.itemSpacing).toBe(10);
  });

  it("opacity number → node.opacity", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "opacity", expectedValue: "0.5" });
    expect(result.success).toBe(true);
    expect(node.opacity).toBe(0.5);
  });

  it("color는 TEXT 노드에만 적용", () => {
    const text = mockFrameNode({ type: "TEXT" });
    const r1 = applyFix(text, { cssProperty: "color", expectedValue: "#000" });
    expect(r1.success).toBe(true);
    expect(text.fills).toHaveLength(1);

    const frame = mockFrameNode();
    const r2 = applyFix(frame, { cssProperty: "color", expectedValue: "#000" });
    expect(r2.success).toBe(false);
    expect(r2.reason).toContain("TEXT");
  });

  it("지원 안 되는 속성은 success=false", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "text-shadow", expectedValue: "0 1px 2px #000" });
    expect(result.success).toBe(false);
    expect(result.reason).toContain("unsupported");
  });

  it("잘못된 hex 형식은 success=false", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "background", expectedValue: "not-a-color" });
    expect(result.success).toBe(false);
  });

  it("잘못된 px 형식은 success=false", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "padding-top", expectedValue: "12rem" });
    expect(result.success).toBe(false);
  });
});

describe("feedbackFixHandler.applyFixes", () => {
  it("여러 fix를 한 번에 적용", () => {
    const node = mockFrameNode();
    const result = applyFixes(node, [
      { cssProperty: "padding-top", expectedValue: "10px" },
      { cssProperty: "padding-bottom", expectedValue: "20px" },
      { cssProperty: "gap", expectedValue: "8px" },
    ]);
    expect(result.appliedCount).toBe(3);
    expect(result.skippedReasons).toHaveLength(0);
    expect(node.paddingTop).toBe(10);
    expect(node.paddingBottom).toBe(20);
    expect(node.itemSpacing).toBe(8);
  });

  it("일부만 성공하면 skippedReasons에 실패 사유", () => {
    const node = mockFrameNode();
    const result = applyFixes(node, [
      { cssProperty: "padding-top", expectedValue: "10px" },
      { cssProperty: "text-shadow", expectedValue: "0 1px 2px #000" },
    ]);
    expect(result.appliedCount).toBe(1);
    expect(result.skippedReasons).toHaveLength(1);
    expect(result.skippedReasons[0]).toContain("text-shadow");
  });
});
