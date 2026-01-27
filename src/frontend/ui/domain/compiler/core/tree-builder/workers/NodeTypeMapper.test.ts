import { describe, it, expect } from "vitest";
import { NodeProcessor } from "./NodeProcessor";

const processor = new NodeProcessor();

describe("NodeTypeMapper", () => {
  describe("processor.mapNodeType()", () => {
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

  describe("processor.isContainerType()", () => {
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

  describe("processor.isComponentReference()", () => {
    it("should return true for INSTANCE", () => {
      expect(processor.isComponentReference("INSTANCE")).toBe(true);
    });

    it("should return false for other types", () => {
      expect(processor.isComponentReference("COMPONENT")).toBe(false);
      expect(processor.isComponentReference("FRAME")).toBe(false);
    });
  });

  describe("processor.isVectorType()", () => {
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

  describe("processor.isTextType()", () => {
    it("should return true for TEXT", () => {
      expect(processor.isTextType("TEXT")).toBe(true);
    });

    it("should return false for other types", () => {
      expect(processor.isTextType("FRAME")).toBe(false);
      expect(processor.isTextType("VECTOR")).toBe(false);
    });
  });
});
