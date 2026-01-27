import { describe, it, expect } from "vitest";
import { VisibilityProcessor } from "./VisibilityProcessor";

const processor = new VisibilityProcessor();

// Mock PreparedDesignData
const createMockData = (nodes: Record<string, any> = {}) => ({
  getNodeById: (id: string) => nodes[id] || null,
} as any);

describe("HiddenNodeProcessor", () => {
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
