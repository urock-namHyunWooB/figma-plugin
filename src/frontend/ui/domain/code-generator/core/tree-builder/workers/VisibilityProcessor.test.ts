import { describe, it, expect } from "vitest";
import { VisibilityProcessor } from "./VisibilityProcessor";
import type { VisibleValue } from "@code-generator/types/customType";

const processor = new VisibilityProcessor();

// Type guard helper
const isStaticValue = (v: VisibleValue): v is { type: "static"; value: boolean } => v.type === "static";
const isConditionValue = (v: VisibleValue): v is { type: "condition"; condition: any } => v.type === "condition";

// Mock PreparedDesignData
const createMockData = (nodes: Record<string, any> = {}) => ({
  getNodeById: (id: string) => nodes[id] || null,
} as any);

// ============================================================================
// VisibilityDetector Tests
// ============================================================================

describe("VisibilityProcessor", () => {
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

  // ============================================================================
  // HiddenNodeProcessor Tests
  // ============================================================================

  describe("isHiddenNode()", () => {
    it("should return true for static false visible", () => {
      const node = {
        id: "node1",
        name: "Hidden",
        visible: { type: "static" as const, value: false },
      };
      const data = createMockData();

      expect(processor.isHiddenNode(node, data)).toBe(true);
    });

    it("should return true for spec visible false without prop binding", () => {
      const node = {
        id: "node1",
        name: "Hidden",
      };
      const data = createMockData({
        node1: { visible: false },
      });

      expect(processor.isHiddenNode(node, data)).toBe(true);
    });

    it("should return false for visible true", () => {
      const node = {
        id: "node1",
        name: "Visible",
        visible: { type: "static" as const, value: true },
      };
      const data = createMockData();

      expect(processor.isHiddenNode(node, data)).toBe(false);
    });

    it("should return false when visible has prop binding", () => {
      const node = {
        id: "node1",
        name: "ConditionalVisible",
        componentPropertyReferences: { visible: "showItem#123" },
      };
      const data = createMockData({
        node1: { visible: false },
      });

      expect(processor.isHiddenNode(node, data)).toBe(false);
    });

    it("should return false for condition type visible", () => {
      const node = {
        id: "node1",
        name: "Conditional",
        visible: { type: "condition" as const, condition: {} as any },
      };
      const data = createMockData({
        node1: { visible: false },
      });

      expect(processor.isHiddenNode(node, data)).toBe(false);
    });
  });

  describe("processHiddenNode()", () => {
    it("should generate showNodeName prop", () => {
      const node = { id: "node1", name: "Icon" };
      const usedPropNames = new Set<string>();

      const result = processor.processHiddenNode(node, usedPropNames);

      expect(result.propName).toBe("showIcon");
      expect(result.propDefinition.name).toBe("showIcon");
      expect(result.propDefinition.type).toBe("boolean");
      expect(result.propDefinition.defaultValue).toBe(false);
    });

    it("should handle duplicate prop names", () => {
      const node1 = { id: "node1", name: "Icon" };
      const node2 = { id: "node2", name: "Icon" };
      const usedPropNames = new Set<string>();

      const result1 = processor.processHiddenNode(node1, usedPropNames);
      const result2 = processor.processHiddenNode(node2, usedPropNames);

      expect(result1.propName).toBe("showIcon");
      expect(result2.propName).toBe("showIcon1");
    });

    it("should generate correct condition", () => {
      const node = { id: "node1", name: "Item" };
      const usedPropNames = new Set<string>();

      const result = processor.processHiddenNode(node, usedPropNames);

      expect(result.condition.type).toBe("BinaryExpression");
      expect(result.condition.operator).toBe("===");
      expect((result.condition.left as any).property.name).toBe("showItem");
      expect((result.condition.right as any).value).toBe(true);
    });

    it("should convert name to camelCase", () => {
      const node = { id: "node1", name: "My Special Icon" };
      const usedPropNames = new Set<string>();

      const result = processor.processHiddenNode(node, usedPropNames);

      expect(result.propName).toBe("showMySpecialIcon");
    });
  });

  describe("findHiddenNodes()", () => {
    it("should find all hidden nodes", () => {
      const nodes = [
        { id: "1", name: "Visible", visible: { type: "static" as const, value: true } },
        { id: "2", name: "Hidden1", visible: { type: "static" as const, value: false } },
        { id: "3", name: "Hidden2", visible: { type: "static" as const, value: false } },
      ];
      const data = createMockData();

      const result = processor.findHiddenNodes(nodes, data);

      expect(result).toHaveLength(2);
      expect(result.map((n) => n.id)).toContain("2");
      expect(result.map((n) => n.id)).toContain("3");
    });
  });

  describe("processAllHiddenNodes()", () => {
    it("should process all hidden nodes and return results and props", () => {
      const hiddenNodes = [
        { id: "1", name: "Icon1" },
        { id: "2", name: "Icon2" },
      ];

      const { results, newProps } = processor.processAllHiddenNodes(hiddenNodes);

      expect(results).toHaveLength(2);
      expect(newProps).toHaveLength(2);
      expect(newProps[0].name).toBe("showIcon1");
      expect(newProps[1].name).toBe("showIcon2");
    });
  });

  describe("getUpdatedVisibleState()", () => {
    it("should return updated visible state for hidden node", () => {
      const hiddenNodes = [{ id: "node1", name: "Icon" }];
      const { results } = processor.processAllHiddenNodes(hiddenNodes);

      const state = processor.getUpdatedVisibleState("node1", results);

      expect(state).not.toBeNull();
      expect(state?.type).toBe("condition");
      expect(state?.condition).toBeDefined();
    });

    it("should return null for non-hidden node", () => {
      const hiddenNodes = [{ id: "node1", name: "Icon" }];
      const { results } = processor.processAllHiddenNodes(hiddenNodes);

      const state = processor.getUpdatedVisibleState("other-node", results);

      expect(state).toBeNull();
    });
  });
});
