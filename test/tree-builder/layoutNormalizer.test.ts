import { describe, it, expect } from "vitest";
import { LayoutNormalizer } from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/LayoutNormalizer";

function makeNode(
  id: string,
  x: number, y: number, width: number, height: number,
  extra: Record<string, any> = {}
): any {
  return {
    id,
    absoluteBoundingBox: { x, y, width, height },
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    strokeWeight: 0,
    strokesIncludedInLayout: false,
    ...extra,
  };
}

function mockDataManager(nodeMap: Map<string, any>): any {
  return {
    getById(id: string) { return { node: nodeMap.get(id) }; },
  };
}

describe("LayoutNormalizer", () => {
  describe("normalize", () => {
    it("padding 없는 부모에서 center-aligned 자식의 relCenter가 0.5여야 한다", () => {
      const parent = makeNode("p", 0, 0, 100, 100);
      const child = makeNode("c", 25, 25, 50, 50);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos!.relCenterX).toBeCloseTo(0.5);
      expect(pos!.relCenterY).toBeCloseTo(0.5);
      expect(pos!.relWidth).toBeCloseTo(0.5);
      expect(pos!.relHeight).toBeCloseTo(0.5);
    });

    it("padding이 있으면 content box 기준으로 정규화해야 한다", () => {
      const parent = makeNode("p", 0, 0, 100, 100, {
        paddingLeft: 10, paddingRight: 10, paddingTop: 20, paddingBottom: 20,
      });
      // content box: x=10, y=20, w=80, h=60
      // child center: (50, 50) → rel to content: (40, 30) → ratio: (0.5, 0.5)
      const child = makeNode("c", 30, 30, 40, 40);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos!.relCenterX).toBeCloseTo(0.5);
      expect(pos!.relCenterY).toBeCloseTo(0.5);
    });

    it("overflow 노드는 relWidth > 1이어야 한다", () => {
      const parent = makeNode("p", 0, 0, 24, 24);
      const child = makeNode("c", -4, -4, 32, 32);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos!.relWidth).toBeGreaterThan(1);
      expect(pos!.relHeight).toBeGreaterThan(1);
    });

    it("strokesIncludedInLayout이면 stroke 고려해야 한다", () => {
      const parent = makeNode("p", 0, 0, 100, 100, {
        strokesIncludedInLayout: true, strokeWeight: 2,
      });
      // content box after stroke: x=2, y=2, w=96, h=96
      const child = makeNode("c", 26, 26, 48, 48);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos!.relWidth).toBeCloseTo(0.5);
    });

    it("content box 크기가 0이면 null 반환해야 한다", () => {
      const parent = makeNode("p", 0, 0, 0, 0);
      const child = makeNode("c", 0, 0, 10, 10);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos).toBeNull();
    });
  });

  describe("compare", () => {
    it("같은 위치면 cost 0이어야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      const a = { relCenterX: 0.5, relCenterY: 0.5, relWidth: 0.3, relHeight: 0.3 };
      const b = { relCenterX: 0.5, relCenterY: 0.5, relWidth: 0.3, relHeight: 0.3 };
      expect(normalizer.compare(a, b)).toBe(0);
    });

    it("3-way: left-aligned면 center 차이보다 left 차이가 작아야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      // 둘 다 왼쪽 정렬, 크기만 다름
      const a = { relCenterX: 0.15, relCenterY: 0.5, relWidth: 0.3, relHeight: 0.5 };
      const b = { relCenterX: 0.25, relCenterY: 0.5, relWidth: 0.5, relHeight: 0.5 };
      // leftA = 0.15 - 0.15 = 0, leftB = 0.25 - 0.25 = 0 → diff = 0
      const cost = normalizer.compare(a, b);
      expect(cost).toBe(0);
    });

    it("Chips 케이스: 서로 다른 부모에서 center-aligned면 cost ≈ 0", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      // Small Frame(37x16) icon(12x12) @ (0,2)
      const a = { relCenterX: 6/37, relCenterY: 8/16, relWidth: 12/37, relHeight: 12/16 };
      // Large Frame(47x24) icon(14x14) @ (0,5)
      const b = { relCenterX: 7/47, relCenterY: 12/24, relWidth: 14/47, relHeight: 14/24 };
      const cost = normalizer.compare(a, b);
      expect(cost).toBeLessThan(0.1);
    });

    it("완전히 다른 위치면 cost가 높아야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      const a = { relCenterX: 0.1, relCenterY: 0.1, relWidth: 0.2, relHeight: 0.2 };
      const b = { relCenterX: 0.9, relCenterY: 0.9, relWidth: 0.2, relHeight: 0.2 };
      expect(normalizer.compare(a, b)).toBeGreaterThan(0.5);
    });
  });

  describe("compareAvgSize", () => {
    it("reference 크기가 크게 달라도 절대 offset이 비슷하면 cost가 낮아야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      // Dropdown 시나리오: variant root 80 vs 460, list는 같은 위치
      const refA = makeNode("rA", 0, 0, 312, 80);
      const refB = makeNode("rB", 0, 0, 312, 460);
      const targetA = makeNode("tA", 0, 84, 312, 368);
      const targetB = makeNode("tB", 0, 92, 312, 368);
      const cost = normalizer.compareAvgSize(refA, targetA, refB, targetB);
      expect(cost).toBeLessThan(0.1);
    });

    it("reference 크기가 비슷하면 compare와 유사한 결과를 내야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      const refA = makeNode("rA", 0, 0, 100, 100);
      const refB = makeNode("rB", 0, 0, 100, 100);
      const targetA = makeNode("tA", 25, 25, 50, 50);
      const targetB = makeNode("tB", 25, 25, 50, 50);
      const cost = normalizer.compareAvgSize(refA, targetA, refB, targetB);
      expect(cost).toBe(0);
    });

    it("절대 offset이 크게 다르면 cost가 높아야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      const refA = makeNode("rA", 0, 0, 100, 100);
      const refB = makeNode("rB", 0, 0, 100, 100);
      const targetA = makeNode("tA", 0, 0, 20, 20);
      const targetB = makeNode("tB", 80, 80, 20, 20);
      const cost = normalizer.compareAvgSize(refA, targetA, refB, targetB);
      expect(cost).toBeGreaterThan(0.5);
    });
  });
});
