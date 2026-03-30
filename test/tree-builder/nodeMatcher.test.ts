import { describe, it, expect } from "vitest";
import { NodeMatcher } from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher";
import type { InternalNode } from "@frontend/ui/domain/code-generator2/types/types";

// ─── Mock helpers ───

function makeSceneNode(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Record<string, any> = {}
): any {
  return {
    id,
    type,
    name: id,
    absoluteBoundingBox: { x, y, width, height },
    ...extra,
  };
}

function makeAutoLayoutParent(
  id: string,
  layoutMode: "HORIZONTAL" | "VERTICAL",
  itemSpacing: number,
  children: any[],
  bounds = { x: 0, y: 0, width: 500, height: 100 }
): any {
  return {
    id,
    type: "FRAME",
    name: id,
    layoutMode,
    itemSpacing,
    absoluteBoundingBox: bounds,
    children,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
  };
}

function makeInternalNode(
  id: string,
  type: string,
  bounds: { x: number; y: number; width: number; height: number },
  parent?: InternalNode | null,
  mergedNodeId?: string
): InternalNode {
  return {
    id,
    name: id,
    type,
    parent: parent ?? null,
    children: [],
    bounds,
    mergedNodes: [
      {
        id: mergedNodeId ?? id,
        name: id,
        variantName: "variant",
        variantProps: {},
      },
    ],
  };
}

function createMockDataManager(nodeMap: Map<string, any>) {
  return {
    getById(id: string) {
      return { node: nodeMap.get(id) };
    },
    getAllDependencies() {
      return new Map();
    },
  } as any;
}

// ─── Tests ───

describe("NodeMatcher", () => {
  describe("TEXT 노드는 AL shift 보정 시에도 width 차이로 거부되면 안 된다", () => {
    /**
     * Tagreview 회귀 케이스 (6545ec9):
     *
     * 같은 Size 그룹 내에서 State만 다른 두 variant:
     *   Variant A: [Group897(16x16)] [TEXT "Rejected"(51x18)]    (gap=4)
     *   Variant B: [Group897(16x16)] [TEXT "Under Review"(79x18)] (gap=4)
     *
     * 왼쪽 형제(Group 897)가 동일 → matchLeftContexts에서 sharedCount=1, extra=0
     * → 6545ec9의 새 분기에서 shift를 반환
     * → isSimilarSize 체크: width ratio 79/51=1.55 > 1.3 → 매칭 거부
     *
     * TEXT는 내용 길이에 따라 width가 달라지는 게 정상이므로
     * shift가 있어도 isSimilarSize로 거부하면 안 된다.
     */
    it("같은 부모 내 TEXT는 내용 길이가 달라도 매칭되어야 한다 (isSameNode)", () => {
      const gap = 4;

      // Variant A: Group(16x16) + TEXT "Rejected"(51x18)
      const aGroup = makeSceneNode("a-group", "GROUP", 0, 0, 16, 16);
      const aText = makeSceneNode("a-text", "TEXT", 20, 0, 51, 18);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aGroup, aText],
        { x: 0, y: 0, width: 87, height: 24 }
      );

      // Variant B: Group(16x16) + TEXT "Under Review"(79x18)
      const bGroup = makeSceneNode("b-group", "GROUP", 0, 0, 16, 16);
      const bText = makeSceneNode("b-text", "TEXT", 20, 0, 79, 18);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bGroup, bText],
        { x: 0, y: 0, width: 115, height: 24 }
      );

      const nodeMap = new Map<string, any>([
        ["a-group", aGroup],
        ["a-text", aText],
        ["parent-a", parentA],
        ["b-group", bGroup],
        ["b-text", bText],
        ["parent-b", parentB],
      ]);

      const nodeToVariantRoot = new Map<string, string>([
        ["a-text", "parent-a"],
        ["b-text", "parent-b"],
      ]);
      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, nodeToVariantRoot);

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 87, height: 24 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 115, height: 24 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-text",
        "TEXT",
        { x: 20, y: 0, width: 51, height: 18 },
        parentIntA,
        "a-text"
      );
      const nodeB = makeInternalNode(
        "b-text",
        "TEXT",
        { x: 20, y: 0, width: 79, height: 18 },
        parentIntB,
        "b-text"
      );

      expect(matcher.isSameNode(nodeA, nodeB)).toBe(true);
    });

    it("같은 부모 내 TEXT는 내용 길이가 달라도 매칭되어야 한다 (getPositionCost)", () => {
      const gap = 4;

      const aGroup = makeSceneNode("a-group", "GROUP", 0, 0, 16, 16);
      const aText = makeSceneNode("a-text", "TEXT", 20, 0, 51, 18);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aGroup, aText],
        { x: 0, y: 0, width: 87, height: 24 }
      );

      const bGroup = makeSceneNode("b-group", "GROUP", 0, 0, 16, 16);
      const bText = makeSceneNode("b-text", "TEXT", 20, 0, 79, 18);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bGroup, bText],
        { x: 0, y: 0, width: 115, height: 24 }
      );

      const nodeMap = new Map<string, any>([
        ["a-group", aGroup],
        ["a-text", aText],
        ["parent-a", parentA],
        ["b-group", bGroup],
        ["b-text", bText],
        ["parent-b", parentB],
      ]);

      const nodeToVariantRoot = new Map<string, string>([
        ["a-text", "parent-a"],
        ["b-text", "parent-b"],
      ]);
      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, nodeToVariantRoot);

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 87, height: 24 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 115, height: 24 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-text",
        "TEXT",
        { x: 20, y: 0, width: 51, height: 18 },
        parentIntA,
        "a-text"
      );
      const nodeB = makeInternalNode(
        "b-text",
        "TEXT",
        { x: 20, y: 0, width: 79, height: 18 },
        parentIntB,
        "b-text"
      );

      // Hungarian 경로에서도 유한한 비용이어야 함
      expect(matcher.getPositionCost(nodeA, nodeB)).not.toBe(Infinity);
    });
  });
});
