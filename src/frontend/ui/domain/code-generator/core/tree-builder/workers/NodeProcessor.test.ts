import { describe, it, expect } from "vitest";
import { NodeProcessor } from "./NodeProcessor";

const processor = new NodeProcessor();

// Mock PreparedDesignData
const createMockData = (nodes: Record<string, any> = {}) => ({
  getNodeById: (id: string) => nodes[id] || null,
  mergeInstanceVectorSvgs: () => null,
  getFirstVectorSvgByInstanceId: () => null,
  getVectorSvgByNodeId: () => null,
} as any);

// ============================================================================
// NodeTypeMapper Tests
// ============================================================================

describe("NodeProcessor", () => {
  describe("mapNodeType()", () => {
    it("should map container types correctly", () => {
      expect(processor.mapNodeType("FRAME")).toBe("container");
      expect(processor.mapNodeType("GROUP")).toBe("container");
      expect(processor.mapNodeType("COMPONENT")).toBe("container");
      expect(processor.mapNodeType("COMPONENT_SET")).toBe("container");
      expect(processor.mapNodeType("SECTION")).toBe("container");
    });

    it("should map TEXT to text", () => {
      expect(processor.mapNodeType("TEXT")).toBe("text");
    });

    it("should map vector types correctly", () => {
      expect(processor.mapNodeType("VECTOR")).toBe("vector");
      expect(processor.mapNodeType("LINE")).toBe("vector");
      expect(processor.mapNodeType("ELLIPSE")).toBe("vector");
      expect(processor.mapNodeType("RECTANGLE")).toBe("vector");
      expect(processor.mapNodeType("STAR")).toBe("vector");
      expect(processor.mapNodeType("POLYGON")).toBe("vector");
      expect(processor.mapNodeType("BOOLEAN_OPERATION")).toBe("vector");
    });

    it("should map INSTANCE to component", () => {
      expect(processor.mapNodeType("INSTANCE")).toBe("component");
    });

    it("should default to container for unknown types", () => {
      expect(processor.mapNodeType("UNKNOWN_TYPE")).toBe("container");
      expect(processor.mapNodeType("")).toBe("container");
    });
  });

  describe("isContainerType()", () => {
    it("should return true for container types", () => {
      expect(processor.isContainerType("FRAME")).toBe(true);
      expect(processor.isContainerType("GROUP")).toBe(true);
      expect(processor.isContainerType("COMPONENT")).toBe(true);
    });

    it("should return false for non-container types", () => {
      expect(processor.isContainerType("TEXT")).toBe(false);
      expect(processor.isContainerType("VECTOR")).toBe(false);
      expect(processor.isContainerType("INSTANCE")).toBe(false);
    });
  });

  describe("isComponentReference()", () => {
    it("should return true for INSTANCE", () => {
      expect(processor.isComponentReference("INSTANCE")).toBe(true);
    });

    it("should return false for other types", () => {
      expect(processor.isComponentReference("COMPONENT")).toBe(false);
      expect(processor.isComponentReference("FRAME")).toBe(false);
    });
  });

  describe("isVectorType()", () => {
    it("should return true for vector types", () => {
      expect(processor.isVectorType("VECTOR")).toBe(true);
      expect(processor.isVectorType("LINE")).toBe(true);
      expect(processor.isVectorType("RECTANGLE")).toBe(true);
    });

    it("should return false for non-vector types", () => {
      expect(processor.isVectorType("FRAME")).toBe(false);
      expect(processor.isVectorType("TEXT")).toBe(false);
    });
  });

  describe("isTextType()", () => {
    it("should return true for TEXT", () => {
      expect(processor.isTextType("TEXT")).toBe(true);
    });

    it("should return false for other types", () => {
      expect(processor.isTextType("FRAME")).toBe(false);
      expect(processor.isTextType("VECTOR")).toBe(false);
    });
  });

  // ============================================================================
  // SemanticRoleDetector Tests
  // ============================================================================

  describe("isButtonComponent()", () => {
    it('should return true for names containing "button"', () => {
      expect(processor.isButtonComponent("PrimaryButton")).toBe(true);
      expect(processor.isButtonComponent("button-primary")).toBe(true);
      expect(processor.isButtonComponent("My Button")).toBe(true);
    });

    it('should return true for names containing "btn"', () => {
      expect(processor.isButtonComponent("PrimaryBtn")).toBe(true);
      expect(processor.isButtonComponent("btn-primary")).toBe(true);
    });

    it('should return true for names containing "cta"', () => {
      expect(processor.isButtonComponent("CTAButton")).toBe(true);
      expect(processor.isButtonComponent("cta-primary")).toBe(true);
    });

    it("should return false for non-button names", () => {
      expect(processor.isButtonComponent("Card")).toBe(false);
      expect(processor.isButtonComponent("InputField")).toBe(false);
      expect(processor.isButtonComponent("Header")).toBe(false);
    });
  });

  describe("detectSemanticRole()", () => {
    it("should return root role for root node", () => {
      const node = { id: "root", type: "FRAME", name: "Card", parent: null, children: [] };
      const data = createMockData();

      const result = processor.detectSemanticRole(node, data, "Card");

      expect(result.role).toBe("root");
    });

    it("should return button role for button component root", () => {
      const node = { id: "root", type: "FRAME", name: "Button", parent: null, children: [] };
      const data = createMockData();

      const result = processor.detectSemanticRole(node, data, "Button");

      expect(result.role).toBe("button");
    });

    it("should return text role for TEXT node", () => {
      const parent = { id: "parent", type: "FRAME", name: "Parent", parent: null, children: [] };
      const node = { id: "text1", type: "TEXT", name: "Label", parent, children: [] };
      const data = createMockData();

      const result = processor.detectSemanticRole(node, data, "Parent");

      expect(result.role).toBe("text");
    });

    it("should return icon role for INSTANCE node", () => {
      const parent = { id: "parent", type: "FRAME", name: "Parent", parent: null, children: [] };
      const node = { id: "icon1", type: "INSTANCE", name: "Icon", parent, children: [] };
      const data = createMockData();

      const result = processor.detectSemanticRole(node, data, "Parent");

      expect(result.role).toBe("icon");
    });

    it("should return vector role for VECTOR node", () => {
      const parent = { id: "parent", type: "FRAME", name: "Parent", parent: null, children: [] };
      const node = { id: "vec1", type: "VECTOR", name: "Arrow", parent, children: [] };
      const data = createMockData();

      const result = processor.detectSemanticRole(node, data, "Parent");

      expect(result.role).toBe("vector");
    });

    it("should return image role for RECTANGLE with image fill", () => {
      const parent = { id: "parent", type: "FRAME", name: "Parent", parent: null, children: [] };
      const node = { id: "rect1", type: "RECTANGLE", name: "Image", parent, children: [] };
      const data = createMockData({
        rect1: { fills: [{ type: "IMAGE", visible: true }] },
      });

      const result = processor.detectSemanticRole(node, data, "Parent");

      expect(result.role).toBe("image");
    });

    it("should return container role for RECTANGLE without image fill", () => {
      const parent = { id: "parent", type: "FRAME", name: "Parent", parent: null, children: [] };
      const node = { id: "rect1", type: "RECTANGLE", name: "Box", parent, children: [] };
      const data = createMockData({
        rect1: { fills: [{ type: "SOLID" }] },
      });

      const result = processor.detectSemanticRole(node, data, "Parent");

      expect(result.role).toBe("container");
    });

    it("should return container role for FRAME node", () => {
      const parent = { id: "parent", type: "FRAME", name: "Parent", parent: null, children: [] };
      const node = { id: "frame1", type: "FRAME", name: "Container", parent, children: [] };
      const data = createMockData();

      const result = processor.detectSemanticRole(node, data, "Parent");

      expect(result.role).toBe("container");
    });
  });
});
