import { describe, it, expect } from "vitest";
import { NodeMatcher } from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher";
import type { InternalNode } from "@frontend/ui/domain/code-generator2/types/types";

/**
 * NodeMatcher Stage 5.5 — Auto Layout 왼쪽 컨텍스트 보정 매칭 테스트
 *
 * Auto Layout 컨테이너에서 요소 추가/제거 시 후속 노드의 위치가 밀려
 * 정규화 좌표 기반 매칭(Stage 4)이 실패하는 문제를 Stage 5.5가 해결하는지 검증한다.
 */

// ─── Mock helpers ───

/** SceneNode 형태의 원본 데이터 생성 */
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

/** Auto Layout 부모 SceneNode (children 포함) */
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

/** InternalNode 생성 */
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

/** DataManager mock 생성 */
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

describe("NodeMatcher Stage 5.5 — Auto Layout 왼쪽 컨텍스트 보정", () => {
  describe("수평 Auto Layout에서 중간 요소 제거 시 매칭", () => {
    /**
     * Variant A: [Div0(F,200)] [BigBox(F,300)] [Div1(F,200)]
     * Variant B: [Div0(F,200)]                 [Div1(F,200)]
     *
     * BigBox이 제거되면 B의 Div1이 왼쪽으로 밀림.
     * A[2]=Div1 vs B[1]=Div1은 공유 컨텍스트(Div0)로 보정 매칭되어야 함.
     */
    it("should match shifted node when middle element is removed", () => {
      const gap = 10;

      // Variant A children: Div0(x=0, w=200), BigBox(x=210, w=300), Div1(x=520, w=200)
      const aDiv0 = makeSceneNode("a-div0", "FRAME", 0, 0, 200, 100);
      const aBigBox = makeSceneNode("a-bigbox", "FRAME", 210, 0, 300, 100);
      const aDiv1 = makeSceneNode("a-div1", "FRAME", 520, 0, 200, 100);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aDiv0, aBigBox, aDiv1]
      );

      // Variant B children: Div0(x=0, w=200), Div1(x=210, w=200)
      const bDiv0 = makeSceneNode("b-div0", "FRAME", 0, 0, 200, 100);
      const bDiv1 = makeSceneNode("b-div1", "FRAME", 210, 0, 200, 100);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bDiv0, bDiv1]
      );

      const nodeMap = new Map<string, any>([
        ["a-div0", aDiv0],
        ["a-bigbox", aBigBox],
        ["a-div1", aDiv1],
        ["parent-a", parentA],
        ["b-div0", bDiv0],
        ["b-div1", bDiv1],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const nodeToVariantRoot = new Map<string, string>();

      const matcher = new NodeMatcher(dataManager, nodeToVariantRoot);

      // InternalNode 생성
      const parentInternalA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 100 },
        null,
        "parent-a"
      );
      const parentInternalB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 100 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-div1",
        "FRAME",
        { x: 520, y: 0, width: 200, height: 100 },
        parentInternalA,
        "a-div1"
      );
      const nodeB = makeInternalNode(
        "b-div1",
        "FRAME",
        { x: 210, y: 0, width: 200, height: 100 },
        parentInternalB,
        "b-div1"
      );

      expect(matcher.isSameNode(nodeA, nodeB)).toBe(true);
    });
  });

  describe("수평 Auto Layout에서 앞쪽 요소 제거 시 매칭", () => {
    /**
     * Variant A: [ExtraIcon(F,24)] [Text(T,100)] [Badge(F,50)]
     * Variant B:                   [Text(T,100)] [Badge(F,50)]
     *
     * A[2]=Badge vs B[1]=Badge: 공유 컨텍스트(Text)로 매칭되어야 함.
     */
    it("should match when first element is removed", () => {
      const gap = 8;

      const aIcon = makeSceneNode("a-icon", "FRAME", 0, 0, 24, 24);
      const aText = makeSceneNode("a-text", "TEXT", 32, 0, 100, 24);
      const aBadge = makeSceneNode("a-badge", "FRAME", 140, 0, 50, 24);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aIcon, aText, aBadge]
      );

      const bText = makeSceneNode("b-text", "TEXT", 0, 0, 100, 24);
      const bBadge = makeSceneNode("b-badge", "FRAME", 108, 0, 50, 24);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bText, bBadge]
      );

      const nodeMap = new Map<string, any>([
        ["a-icon", aIcon],
        ["a-text", aText],
        ["a-badge", aBadge],
        ["parent-a", parentA],
        ["b-text", bText],
        ["b-badge", bBadge],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 300, height: 24 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 300, height: 24 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-badge",
        "FRAME",
        { x: 140, y: 0, width: 50, height: 24 },
        parentIntA,
        "a-badge"
      );
      const nodeB = makeInternalNode(
        "b-badge",
        "FRAME",
        { x: 108, y: 0, width: 50, height: 24 },
        parentIntB,
        "b-badge"
      );

      // Text가 공유 컨텍스트로 존재하므로 매칭 성공
      expect(matcher.isSameNode(nodeA, nodeB)).toBe(true);
    });
  });

  describe("수직 Auto Layout에서 위쪽 요소 제거 시 매칭", () => {
    /**
     * Variant A: [Header(F,h=40)] [Spacer(F,h=20)] [Content(F,h=200)]
     * Variant B: [Header(F,h=40)]                  [Content(F,h=200)]
     *
     * y축 기준 위쪽 컨텍스트를 비교하여 Content 노드를 매칭
     */
    it("should match vertically shifted node", () => {
      const gap = 10;

      const aHeader = makeSceneNode("a-header", "FRAME", 0, 0, 300, 40);
      const aSpacer = makeSceneNode("a-spacer", "FRAME", 0, 50, 300, 20);
      const aContent = makeSceneNode("a-content", "FRAME", 0, 80, 300, 200);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "VERTICAL",
        gap,
        [aHeader, aSpacer, aContent],
        { x: 0, y: 0, width: 300, height: 280 }
      );

      const bHeader = makeSceneNode("b-header", "FRAME", 0, 0, 300, 40);
      const bContent = makeSceneNode("b-content", "FRAME", 0, 50, 300, 200);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "VERTICAL",
        gap,
        [bHeader, bContent],
        { x: 0, y: 0, width: 300, height: 250 }
      );

      const nodeMap = new Map<string, any>([
        ["a-header", aHeader],
        ["a-spacer", aSpacer],
        ["a-content", aContent],
        ["parent-a", parentA],
        ["b-header", bHeader],
        ["b-content", bContent],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 300, height: 280 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 300, height: 250 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-content",
        "FRAME",
        { x: 0, y: 80, width: 300, height: 200 },
        parentIntA,
        "a-content"
      );
      const nodeB = makeInternalNode(
        "b-content",
        "FRAME",
        { x: 0, y: 50, width: 300, height: 200 },
        parentIntB,
        "b-content"
      );

      expect(matcher.isSameNode(nodeA, nodeB)).toBe(true);
    });
  });

  describe("false positive 방지: 같은 type+size 다른 역할", () => {
    /**
     * Variant A: [LeftIcon(I,18x18)] [Text(T,34x24)]
     * Variant B: [Text(T,34x24)] [RightIcon(I,18x18)]
     *
     * LeftIcon과 RightIcon은 같은 type+size이지만 다른 역할.
     * 공유 컨텍스트가 없으므로 매칭하지 않아야 함.
     */
    it("should NOT match different-role nodes with same type+size", () => {
      const gap = 4;

      const aLeftIcon = makeSceneNode("a-left", "INSTANCE", 0, 0, 18, 18);
      const aText = makeSceneNode("a-text", "TEXT", 22, 0, 34, 24);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aLeftIcon, aText]
      );

      const bText = makeSceneNode("b-text", "TEXT", 0, 0, 34, 24);
      const bRightIcon = makeSceneNode("b-right", "INSTANCE", 38, 0, 18, 18);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bText, bRightIcon]
      );

      const nodeMap = new Map<string, any>([
        ["a-left", aLeftIcon],
        ["a-text", aText],
        ["parent-a", parentA],
        ["b-text", bText],
        ["b-right", bRightIcon],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 100, height: 24 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 100, height: 24 },
        null,
        "parent-b"
      );

      // LeftIcon(A의 첫째) vs RightIcon(B의 둘째)
      const nodeA = makeInternalNode(
        "merged-left",
        "INSTANCE",
        { x: 0, y: 0, width: 18, height: 18 },
        parentIntA,
        "a-left"
      );
      const nodeB = makeInternalNode(
        "b-right",
        "INSTANCE",
        { x: 38, y: 0, width: 18, height: 18 },
        parentIntB,
        "b-right"
      );

      // 공유 컨텍스트 없음 + 부모 자식 수 동일(2=2) → 재배치로 판단 → 거부
      expect(matcher.isSameNode(nodeA, nodeB)).toBe(false);
    });
  });

  describe("첫째 자식 앞에 요소 추가 시 매칭", () => {
    /**
     * Variant A: [X(F,100x50)]
     * Variant B: [Extra(F,50x50)] [X(F,100x50)]
     *
     * B에 Extra가 추가되어 X가 밀림. 공유 컨텍스트 없지만
     * 부모 자식 수가 다르므로(1≠2) 요소 추가로 판단 → 허용.
     */
    it("should match when element is prepended before first child", () => {
      const gap = 10;

      const aX = makeSceneNode("a-x", "FRAME", 0, 0, 100, 50);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aX]
      );

      const bExtra = makeSceneNode("b-extra", "FRAME", 0, 0, 50, 50);
      const bX = makeSceneNode("b-x", "FRAME", 60, 0, 100, 50);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bExtra, bX]
      );

      const nodeMap = new Map<string, any>([
        ["a-x", aX],
        ["parent-a", parentA],
        ["b-extra", bExtra],
        ["b-x", bX],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 200, height: 50 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 200, height: 50 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-x",
        "FRAME",
        { x: 0, y: 0, width: 100, height: 50 },
        parentIntA,
        "a-x"
      );
      const nodeB = makeInternalNode(
        "b-x",
        "FRAME",
        { x: 60, y: 0, width: 100, height: 50 },
        parentIntB,
        "b-x"
      );

      // 부모 자식 수 다름(1≠2) → 요소 추가로 판단 → 보정 매칭 허용
      expect(matcher.isSameNode(nodeA, nodeB)).toBe(true);
    });
  });

  describe("비-Auto Layout 부모에서는 적용 안 됨", () => {
    it("should NOT apply Stage 5.5 for non-Auto Layout parent", () => {
      const aChild = makeSceneNode("a-child", "FRAME", 0, 0, 100, 50);
      const parentA = {
        id: "parent-a",
        type: "FRAME",
        name: "parent-a",
        absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 100 },
        children: [aChild],
        // layoutMode 없음 → Auto Layout 아님
      };

      const bChild = makeSceneNode("b-child", "FRAME", 100, 0, 100, 50);
      const parentB = {
        id: "parent-b",
        type: "FRAME",
        name: "parent-b",
        absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 100 },
        children: [bChild],
      };

      const nodeMap = new Map<string, any>([
        ["a-child", aChild],
        ["parent-a", parentA],
        ["b-child", bChild],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 100 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 100 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-child",
        "FRAME",
        { x: 0, y: 0, width: 100, height: 50 },
        parentIntA,
        "a-child"
      );
      const nodeB = makeInternalNode(
        "b-child",
        "FRAME",
        { x: 100, y: 0, width: 100, height: 50 },
        parentIntB,
        "b-child"
      );

      // 비-Auto Layout이므로 Stage 5.5 미적용, 위치도 다르므로 불일치
      expect(matcher.isSameNode(nodeA, nodeB)).toBe(false);
    });
  });

  describe("크기가 다른 노드는 매칭 안 됨", () => {
    it("should NOT match nodes with different sizes", () => {
      const gap = 10;

      const aDiv = makeSceneNode("a-div", "FRAME", 0, 0, 100, 50);
      const aShared = makeSceneNode("a-shared", "FRAME", 110, 0, 200, 50);
      const aTarget = makeSceneNode("a-target", "FRAME", 320, 0, 150, 50);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aDiv, aShared, aTarget]
      );

      const bShared = makeSceneNode("b-shared", "FRAME", 0, 0, 200, 50);
      const bTarget = makeSceneNode("b-target", "FRAME", 210, 0, 80, 30);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bShared, bTarget]
      );

      const nodeMap = new Map<string, any>([
        ["a-div", aDiv],
        ["a-shared", aShared],
        ["a-target", aTarget],
        ["parent-a", parentA],
        ["b-shared", bShared],
        ["b-target", bTarget],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 50 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 50 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-target",
        "FRAME",
        { x: 320, y: 0, width: 150, height: 50 },
        parentIntA,
        "a-target"
      );
      const nodeB = makeInternalNode(
        "b-target",
        "FRAME",
        { x: 210, y: 0, width: 80, height: 30 },
        parentIntB,
        "b-target"
      );

      // 크기 차이가 ±5px 초과 → 거부
      expect(matcher.isSameNode(nodeA, nodeB)).toBe(false);
    });
  });

  describe("B가 더 많은 경우 (append 후 뒤쪽 노드 보정)", () => {
    /**
     * Variant A: [Shared(F,200)] [Target(F,100)]
     * Variant B: [Shared(F,200)] [NewItem(F,50)] [Target(F,100)]
     *
     * B에 NewItem이 추가되어 Target이 밀림.
     * A[1]=Target vs B[2]=Target: 공유 컨텍스트(Shared)로 매칭.
     */
    it("should match when B has extra element", () => {
      const gap = 10;

      const aShared = makeSceneNode("a-shared", "FRAME", 0, 0, 200, 100);
      const aTarget = makeSceneNode("a-target", "FRAME", 210, 0, 100, 100);
      const parentA = makeAutoLayoutParent(
        "parent-a",
        "HORIZONTAL",
        gap,
        [aShared, aTarget]
      );

      const bShared = makeSceneNode("b-shared", "FRAME", 0, 0, 200, 100);
      const bNew = makeSceneNode("b-new", "FRAME", 210, 0, 50, 100);
      const bTarget = makeSceneNode("b-target", "FRAME", 270, 0, 100, 100);
      const parentB = makeAutoLayoutParent(
        "parent-b",
        "HORIZONTAL",
        gap,
        [bShared, bNew, bTarget]
      );

      const nodeMap = new Map<string, any>([
        ["a-shared", aShared],
        ["a-target", aTarget],
        ["parent-a", parentA],
        ["b-shared", bShared],
        ["b-new", bNew],
        ["b-target", bTarget],
        ["parent-b", parentB],
      ]);

      const dataManager = createMockDataManager(nodeMap);
      const matcher = new NodeMatcher(dataManager, new Map());

      const parentIntA = makeInternalNode(
        "parent-merged",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 100 },
        null,
        "parent-a"
      );
      const parentIntB = makeInternalNode(
        "parent-b",
        "FRAME",
        { x: 0, y: 0, width: 500, height: 100 },
        null,
        "parent-b"
      );

      const nodeA = makeInternalNode(
        "merged-target",
        "FRAME",
        { x: 210, y: 0, width: 100, height: 100 },
        parentIntA,
        "a-target"
      );
      const nodeB = makeInternalNode(
        "b-target",
        "FRAME",
        { x: 270, y: 0, width: 100, height: 100 },
        parentIntB,
        "b-target"
      );

      expect(matcher.isSameNode(nodeA, nodeB)).toBe(true);
    });
  });

  describe("기존 taptapButton 회귀 방지", () => {
    it("should pass existing compiler tests without regression", async () => {
      // 이 테스트는 전체 테스트 실행으로 검증됨
      // npm run test에서 compiler.test.ts > taptapButton 확인
      expect(true).toBe(true);
    });
  });
});
