import { describe, it, expect } from "vitest";
import { StyleProcessor } from "./StyleProcessor";

const processor = new StyleProcessor();

// Mock PreparedDesignData
const createMockData = (nodes: Record<string, any> = {}) => ({
  getNodeById: (id: string) => nodes[id] || null,
} as any);

describe("PositionStyler", () => {
  describe("processor.isAutoLayout()", () => {
    it("should return true for HORIZONTAL layout", () => {
      const node = { layoutMode: "HORIZONTAL" } as any;
      expect(processor.isAutoLayout(node)).toBe(true);
    });

    it("should return true for VERTICAL layout", () => {
      const node = { layoutMode: "VERTICAL" } as any;
      expect(processor.isAutoLayout(node)).toBe(true);
    });

    it("should return false for NONE layout", () => {
      const node = { layoutMode: "NONE" } as any;
      expect(processor.isAutoLayout(node)).toBe(false);
    });

    it("should return false for undefined layoutMode", () => {
      const node = {} as any;
      expect(processor.isAutoLayout(node)).toBeFalsy();
    });
  });

  describe("processor.calculatePosition()", () => {
    it("should return null when parent is null", () => {
      const node = { id: "node1", type: "FRAME", name: "Node", children: [], styles: { base: {} } };
      const data = createMockData();

      const result = processor.calculatePosition(node, null, data);

      expect(result).toBeNull();
    });

    it("should return null when parent is auto-layout", () => {
      const node = { id: "child", type: "FRAME", name: "Child", children: [], styles: { base: {} } };
      const parent = { id: "parent", type: "FRAME", name: "Parent", children: [], styles: { base: {} } };
      const data = createMockData({
        child: { absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 50 } },
        parent: {
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      });

      const result = processor.calculatePosition(node, parent, data);

      expect(result).toBeNull();
    });

    it("should calculate absolute position for non-auto-layout parent", () => {
      const node = { id: "child", type: "FRAME", name: "Child", children: [], styles: { base: {} } };
      const parent = { id: "parent", type: "FRAME", name: "Parent", children: [], styles: { base: {} } };
      const data = createMockData({
        child: { absoluteBoundingBox: { x: 50, y: 30, width: 20, height: 20 } },
        parent: {
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      });

      const result = processor.calculatePosition(node, parent, data);

      expect(result).not.toBeNull();
      expect(result?.position).toBe("absolute");
      expect(result?.left).toBe("50px");
      expect(result?.top).toBe("30px");
    });
  });

  describe("processor.handleRotatedElement()", () => {
    it("should return unchanged styles for non-rotated element", () => {
      const nodeSpec = { rotation: 0 } as any;
      const styles = { width: "100px", height: "50px" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result).toEqual(styles);
    });

    it("should return unchanged styles for undefined rotation", () => {
      const nodeSpec = {} as any;
      const styles = { width: "100px", height: "50px" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result).toEqual(styles);
    });

    it("should remove transform and update size for 90 degree rotation", () => {
      const nodeSpec = {
        rotation: Math.PI / 2, // 90 degrees
        absoluteRenderBounds: { width: 50, height: 100 },
      } as any;
      const styles = { transform: "rotate(90deg)", width: "100px", height: "50px" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result.transform).toBeUndefined();
      expect(result.width).toBe("50px");
      expect(result.height).toBe("100px");
    });

    it("should handle 270 degree rotation", () => {
      const nodeSpec = {
        rotation: (3 * Math.PI) / 2, // 270 degrees
        absoluteRenderBounds: { width: 50, height: 100 },
      } as any;
      const styles = { transform: "rotate(-90deg)" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result.transform).toBeUndefined();
      expect(result.width).toBe("50px");
      expect(result.height).toBe("100px");
    });
  });
});
