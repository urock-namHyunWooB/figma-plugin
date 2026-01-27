import { describe, it, expect } from "vitest";
import {
  VariantProcessor as VariantMerger,
  calculateIoU,
  getRelativeBounds,
} from "./VariantProcessor";

const processor = new VariantMerger();

// Mock PreparedDesignData
const createMockData = (nodes: Record<string, any> = {}) => ({
  getNodeById: (id: string) => nodes[id] || null,
} as any);

// Mock SceneNode
const createMockSceneNode = (
  id: string,
  type: string,
  children: any[] = [],
  bounds?: { x: number; y: number; width: number; height: number }
): any => ({
  id,
  type,
  name: id,
  children,
  absoluteBoundingBox: bounds,
});

describe("VariantMerger", () => {
  describe("processor.convertToInternalNode()", () => {
    it("should convert SceneNode to InternalNode", () => {
      const sceneNode = createMockSceneNode("node1", "FRAME", [], {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const data = createMockData();

      const result = processor.convertToInternalNode(sceneNode, null, "Variant1", data);

      expect(result.id).toBe("node1");
      expect(result.type).toBe("FRAME");
      expect(result.name).toBe("node1");
      expect(result.parent).toBeNull();
      expect(result.mergedNode).toHaveLength(1);
      expect(result.mergedNode[0].variantName).toBe("Variant1");
    });

    it("should convert children recursively", () => {
      const child = createMockSceneNode("child1", "TEXT");
      const parent = createMockSceneNode("parent1", "FRAME", [child]);
      const data = createMockData();

      const result = processor.convertToInternalNode(parent, null, "Variant1", data);

      expect(result.children).toHaveLength(1);
      expect(result.children[0].id).toBe("child1");
      expect(result.children[0].parent).toBe(result);
    });
  });

  describe("VariantMerger class", () => {
    it("should have isSameNode method that works with SceneNodes", () => {
      const merger = new VariantMerger();
      const node1 = createMockSceneNode("same-id", "FRAME", [], {
        x: 0, y: 0, width: 100, height: 100
      });
      const node2 = createMockSceneNode("same-id", "FRAME", [], {
        x: 0, y: 0, width: 100, height: 100
      });

      expect(merger.isSameNode(node1, node2)).toBe(true);
    });

    it("should return false for different types", () => {
      const merger = new VariantMerger();
      const node1 = createMockSceneNode("node1", "FRAME", [], {
        x: 0, y: 0, width: 100, height: 100
      });
      const node2 = createMockSceneNode("node2", "TEXT", [], {
        x: 0, y: 0, width: 100, height: 100
      });

      expect(merger.isSameNode(node1, node2)).toBe(false);
    });

    it("should calculate IoU correctly with DOMRect", () => {
      const merger = new VariantMerger();
      const rect1 = { x: 0, y: 0, width: 100, height: 100 } as DOMRect;
      const rect2 = { x: 0, y: 0, width: 100, height: 100 } as DOMRect;

      expect(merger.calculateIoU(rect1, rect2)).toBe(1);
    });
  });

  describe("calculateIoU()", () => {
    it("should return 1 for identical boxes", () => {
      const box = { x: 0, y: 0, width: 100, height: 100 };
      expect(calculateIoU(box, box)).toBe(1);
    });

    it("should return 0 for non-overlapping boxes", () => {
      const box1 = { x: 0, y: 0, width: 100, height: 100 };
      const box2 = { x: 200, y: 200, width: 100, height: 100 };
      expect(calculateIoU(box1, box2)).toBe(0);
    });

    it("should return correct IoU for overlapping boxes", () => {
      const box1 = { x: 0, y: 0, width: 100, height: 100 };
      const box2 = { x: 50, y: 50, width: 100, height: 100 };
      // Intersection: 50x50 = 2500
      // Union: 10000 + 10000 - 2500 = 17500
      // IoU: 2500 / 17500 ≈ 0.143
      const iou = calculateIoU(box1, box2);
      expect(iou).toBeGreaterThan(0);
      expect(iou).toBeLessThan(1);
    });
  });

  describe("getRelativeBounds()", () => {
    it("should calculate relative position", () => {
      const nodeBounds = { x: 50, y: 50, width: 100, height: 100 };
      const parentBounds = { x: 0, y: 0, width: 200, height: 200 };

      const result = getRelativeBounds(nodeBounds, parentBounds);

      expect(result.x).toBe(50);
      expect(result.y).toBe(50);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });
  });
});
