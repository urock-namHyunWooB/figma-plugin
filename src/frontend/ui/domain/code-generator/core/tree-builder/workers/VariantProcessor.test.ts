import { describe, it, expect } from "vitest";
import {
  VariantProcessor,
  calculateIoU,
  getRelativeBounds,
  calculateIouFromRoot,
} from "./VariantProcessor";

const processor = new VariantProcessor();

// ============================================================================
// Test Helpers
// ============================================================================

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

// InternalNode 타입 (테스트용)
interface InternalNode {
  id: string;
  type: string;
  name: string;
  parent: InternalNode | null;
  children: InternalNode[];
  mergedNode: Array<{ id: string; name: string; variantName?: string | null }>;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function createNode(
  id: string,
  type: string,
  parent: InternalNode | null = null
): InternalNode {
  const node: InternalNode = {
    id,
    type,
    name: id,
    parent,
    children: [],
    mergedNode: [{ id, name: id }],
  };
  if (parent) {
    parent.children.push(node);
  }
  return node;
}

// ============================================================================
// VariantMerger Tests
// ============================================================================

describe("VariantProcessor", () => {
  describe("convertToInternalNode()", () => {
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

  describe("isSameNode()", () => {
    it("should return true for same ID", () => {
      const node1 = createMockSceneNode("same-id", "FRAME", [], {
        x: 0, y: 0, width: 100, height: 100
      });
      const node2 = createMockSceneNode("same-id", "FRAME", [], {
        x: 0, y: 0, width: 100, height: 100
      });

      expect(processor.isSameNode(node1, node2)).toBe(true);
    });

    it("should return false for different types", () => {
      const node1 = createMockSceneNode("node1", "FRAME", [], {
        x: 0, y: 0, width: 100, height: 100
      });
      const node2 = createMockSceneNode("node2", "TEXT", [], {
        x: 0, y: 0, width: 100, height: 100
      });

      expect(processor.isSameNode(node1, node2)).toBe(false);
    });
  });

  describe("calculateIoU() (method)", () => {
    it("should calculate IoU correctly with DOMRect", () => {
      const rect1 = { x: 0, y: 0, width: 100, height: 100 } as DOMRect;
      const rect2 = { x: 0, y: 0, width: 100, height: 100 } as DOMRect;

      expect(processor.calculateIoU(rect1, rect2)).toBe(1);
    });
  });

  // ============================================================================
  // SquashByIou Tests
  // ============================================================================

  describe("squashByIou()", () => {
    it("should not squash nodes with low IoU", () => {
      const root = createNode("root", "FRAME");
      const _child1 = createNode("child1", "FRAME", root);
      const _child2 = createNode("child2", "FRAME", root);

      // 겹치지 않는 IoU 반환
      const getIou = () => 0.1;

      const result = processor.squashWithFunction(root, getIou);

      expect(result.children).toHaveLength(2);
    });

    it("should squash nodes with high IoU", () => {
      const root = createNode("root", "FRAME");
      const _child1 = createNode("child1", "FRAME", root);
      const _child2 = createNode("child2", "FRAME", root);

      // 높은 IoU 반환
      const getIou = () => 0.8;

      const result = processor.squashWithFunction(root, getIou);

      // child2가 child1로 병합되어 children이 1개가 됨
      expect(result.children).toHaveLength(1);
      expect(result.children[0].mergedNode).toHaveLength(2);
    });

    it("should not squash nodes of different types", () => {
      const root = createNode("root", "FRAME");
      const _child1 = createNode("child1", "FRAME", root);
      const _child2 = createNode("child2", "TEXT", root);

      const getIou = () => 0.9;

      const result = processor.squashWithFunction(root, getIou);

      // 타입이 다르므로 스쿼시 안 됨
      expect(result.children).toHaveLength(2);
    });

    it("should not squash ancestor-descendant nodes", () => {
      const root = createNode("root", "FRAME");
      const parent = createNode("parent", "FRAME", root);
      const _child = createNode("child", "FRAME", parent);

      const getIou = () => 0.9;

      const result = processor.squashWithFunction(root, getIou);

      // 조상-자손 관계이므로 스쿼시 안 됨
      expect(result.children[0].children).toHaveLength(1);
    });

    it("should not squash when one is INSTANCE child and other is not", () => {
      const root = createNode("root", "FRAME");
      const _child1 = createNode("123:456", "FRAME", root);
      const _child2 = createNode("I123:456;789:012", "FRAME", root);

      const getIou = () => 0.9;

      const result = processor.squashWithFunction(root, getIou);

      // INSTANCE 자식 여부가 다르므로 스쿼시 안 됨
      expect(result.children).toHaveLength(2);
    });
  });

  // ============================================================================
  // Utility Function Tests
  // ============================================================================

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

  describe("calculateIouFromRoot()", () => {
    it("should return null when nodes have no parent", () => {
      const node1 = createNode("node1", "FRAME");
      const node2 = createNode("node2", "FRAME");

      const getRootBounds = () => null;
      const result = calculateIouFromRoot(node1, node2, getRootBounds);

      expect(result).toBeNull();
    });

    it("should calculate IoU for overlapping nodes", () => {
      const root = createNode("root", "FRAME");
      const node1 = createNode("node1", "FRAME", root);
      const node2 = createNode("node2", "FRAME", root);

      // 완전히 겹치는 bounds
      const getRootBounds = (_node: InternalNode) => ({
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
      });

      const result = calculateIouFromRoot(node1, node2, getRootBounds);

      expect(result).toBe(1);
    });

    it("should calculate IoU for non-overlapping nodes", () => {
      const root = createNode("root", "FRAME");
      const node1 = createNode("node1", "FRAME", root);
      const node2 = createNode("node2", "FRAME", root);

      // 겹치지 않는 bounds
      const getRootBounds = (node: InternalNode) =>
        node.id === "node1"
          ? { x1: 0, y1: 0, x2: 0.5, y2: 0.5 }
          : { x1: 0.6, y1: 0.6, x2: 1, y2: 1 };

      const result = calculateIouFromRoot(node1, node2, getRootBounds);

      expect(result).toBe(0);
    });

    it("should calculate partial IoU for partially overlapping nodes", () => {
      const root = createNode("root", "FRAME");
      const node1 = createNode("node1", "FRAME", root);
      const node2 = createNode("node2", "FRAME", root);

      // 부분적으로 겹치는 bounds
      const getRootBounds = (node: InternalNode) =>
        node.id === "node1"
          ? { x1: 0, y1: 0, x2: 0.6, y2: 0.6 }
          : { x1: 0.4, y1: 0.4, x2: 1, y2: 1 };

      const result = calculateIouFromRoot(node1, node2, getRootBounds);

      // 0 < IoU < 1
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });
  });
});
