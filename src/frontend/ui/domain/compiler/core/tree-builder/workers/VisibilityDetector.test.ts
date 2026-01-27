import { describe, it, expect } from "vitest";
import { VisibilityProcessor } from "./VisibilityProcessor";
import type { VisibleValue } from "@compiler/types/customType";

const processor = new VisibilityProcessor();

// Type guard helper
const isStaticValue = (v: VisibleValue): v is { type: "static"; value: boolean } => v.type === "static";
const isConditionValue = (v: VisibleValue): v is { type: "condition"; condition: any } => v.type === "condition";

describe("VisibilityDetector", () => {
  describe("inferVisibility()", () => {
    it("should return static true when visibleRef is provided", () => {
      const result = processor.inferVisibility([], 2, "showIcon#123");

      expect(result.type).toBe("static");
      if (isStaticValue(result)) expect(result.value).toBe(true);
    });

    it("should return static true when node exists in all variants", () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "Variant1" },
        { id: "2", name: "Node", variantName: "Variant2" },
      ];

      const result = processor.inferVisibility(mergedNodes, 2);

      expect(result.type).toBe("static");
      if (isStaticValue(result)) expect(result.value).toBe(true);
    });

    it("should return static false when node exists in no variants", () => {
      const result = processor.inferVisibility([], 2);

      expect(result.type).toBe("static");
      if (isStaticValue(result)) expect(result.value).toBe(false);
    });

    it("should return condition when node exists in some variants", () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "Size=Large" },
      ];
      const parseCondition = (_variantName: string) => ({
        type: "BinaryExpression" as const,
        operator: "===" as const,
        left: { type: "Identifier" as const, name: "size" },
        right: { type: "Literal" as const, value: "large" },
      });

      const result = processor.inferVisibility(mergedNodes, 2, undefined, parseCondition);

      expect(result.type).toBe("condition");
      if (isConditionValue(result)) expect(result.condition).toBeDefined();
    });

    it("should combine multiple conditions with OR", () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "Size=Large" },
        { id: "2", name: "Node", variantName: "Size=Medium" },
      ];
      const parseCondition = (variantName: string) => ({
        type: "BinaryExpression" as const,
        operator: "===" as const,
        left: { type: "Identifier" as const, name: "size" },
        right: { type: "Literal" as const, value: variantName.split("=")[1]?.toLowerCase() },
      });

      const result = processor.inferVisibility(mergedNodes, 3, undefined, parseCondition);

      expect(result.type).toBe("condition");
      if (isConditionValue(result)) expect((result.condition as any).operator).toBe("||");
    });

    it("should return static true when parseCondition returns null", () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "InvalidFormat" },
      ];
      const parseCondition = () => null;

      const result = processor.inferVisibility(mergedNodes, 2, undefined, parseCondition);

      expect(result.type).toBe("static");
      if (isStaticValue(result)) expect(result.value).toBe(true);
    });
  });

  describe("createConditionalRule()", () => {
    it("should create ConditionalRule with correct structure", () => {
      const condition = {
        type: "BinaryExpression" as const,
        operator: "===" as const,
        left: { type: "Identifier" as const, name: "show" },
        right: { type: "Literal" as const, value: true },
      };

      const result = processor.createConditionalRule("node-123", condition);

      expect(result.condition).toBe(condition);
      expect(result.showNodeId).toBe("node-123");
      expect(result.fallback).toBe("null");
    });
  });

  describe("analyzeVisibilityPattern()", () => {
    it('should return "always" when node exists in all variants', () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "V1" },
        { id: "2", name: "Node", variantName: "V2" },
      ];

      expect(processor.analyzeVisibilityPattern(mergedNodes, 2)).toBe("always");
    });

    it('should return "never" when node exists in no variants', () => {
      expect(processor.analyzeVisibilityPattern([], 2)).toBe("never");
    });

    it('should return "conditional" when node exists in some variants', () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "V1" },
      ];

      expect(processor.analyzeVisibilityPattern(mergedNodes, 3)).toBe("conditional");
    });
  });

  describe("isVisibleInVariant()", () => {
    it("should return true when node exists in specified variant", () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "Variant1" },
        { id: "2", name: "Node", variantName: "Variant2" },
      ];

      expect(processor.isVisibleInVariant(mergedNodes, "Variant1")).toBe(true);
      expect(processor.isVisibleInVariant(mergedNodes, "Variant2")).toBe(true);
    });

    it("should return false when node does not exist in specified variant", () => {
      const mergedNodes = [
        { id: "1", name: "Node", variantName: "Variant1" },
      ];

      expect(processor.isVisibleInVariant(mergedNodes, "Variant2")).toBe(false);
      expect(processor.isVisibleInVariant(mergedNodes, "Variant3")).toBe(false);
    });

    it("should return false for empty mergedNodes", () => {
      expect(processor.isVisibleInVariant([], "AnyVariant")).toBe(false);
    });
  });
});
