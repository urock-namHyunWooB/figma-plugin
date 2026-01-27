import { describe, it, expect } from "vitest";
import { VariantProcessor, calculateIouFromRoot } from "./VariantProcessor";

const processor = new VariantProcessor();

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

describe("SquashByIou", () => {
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
