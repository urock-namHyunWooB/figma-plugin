import { describe, test, expect } from "vitest";
import any07 from "../fixtures/any/any-07.json";
import type { FigmaNodeData } from "@code-generator2";
import {
  extractFigmaLayout,
  compareLayout,
  compareLayouts,
  type LayoutData,
} from "@code-generator/utils/layoutComparison";

describe("레이아웃 비교 유틸리티", () => {
  describe("extractFigmaLayout", () => {
    test("Figma 노드 데이터에서 레이아웃 정보를 추출한다", () => {
      const data = any07 as unknown as FigmaNodeData;
      const layouts = extractFigmaLayout(data);
      
      expect(layouts.length).toBeGreaterThan(0);
      
      // 루트 노드 확인
      const root = layouts.find(l => l.id === "15:129");
      expect(root).toBeDefined();
      expect(root?.x).toBe(0);  // 루트는 상대좌표 0,0
      expect(root?.y).toBe(0);
      expect(root?.width).toBe(264);
      expect(root?.height).toBe(264);
    });

    test("자식 노드의 상대 좌표가 올바르게 계산된다", () => {
      const data = any07 as unknown as FigmaNodeData;
      const layouts = extractFigmaLayout(data);
      
      // Yellow bright (첫 번째 아이템)
      const yellowBright = layouts.find(l => l.id === "15:131");
      expect(yellowBright).toBeDefined();
      expect(yellowBright?.x).toBe(0);
      expect(yellowBright?.y).toBe(0);
      expect(yellowBright?.width).toBe(264);  // FILL 컨테이너라서 부모와 같은 너비
      expect(yellowBright?.height).toBe(40);
    });

    test("모든 노드가 id를 가진다", () => {
      const data = any07 as unknown as FigmaNodeData;
      const layouts = extractFigmaLayout(data);
      
      for (const layout of layouts) {
        expect(layout.id).toBeDefined();
        expect(layout.id.length).toBeGreaterThan(0);
      }
    });
  });

  describe("compareLayout", () => {
    test("두 레이아웃이 일치하면 차이가 0이다", () => {
      const layout1: LayoutData = { id: "1", name: "A", x: 0, y: 0, width: 100, height: 50 };
      const layout2: LayoutData = { id: "1", name: "A", x: 0, y: 0, width: 100, height: 50 };
      
      const diff = compareLayout(layout1, layout2);
      
      expect(diff.xDiff).toBe(0);
      expect(diff.yDiff).toBe(0);
      expect(diff.widthDiff).toBe(0);
      expect(diff.heightDiff).toBe(0);
      expect(diff.isMatch).toBe(true);
    });

    test("두 레이아웃이 다르면 차이가 계산된다", () => {
      const layout1: LayoutData = { id: "1", name: "A", x: 0, y: 0, width: 100, height: 50 };
      const layout2: LayoutData = { id: "1", name: "A", x: 5, y: 10, width: 95, height: 40 };
      
      const diff = compareLayout(layout1, layout2);
      
      expect(diff.xDiff).toBe(5);
      expect(diff.yDiff).toBe(10);
      expect(diff.widthDiff).toBe(5);
      expect(diff.heightDiff).toBe(10);
      expect(diff.isMatch).toBe(false);
    });

    test("허용 오차 내의 차이는 일치로 판단한다", () => {
      const layout1: LayoutData = { id: "1", name: "A", x: 0, y: 0, width: 100, height: 50 };
      const layout2: LayoutData = { id: "1", name: "A", x: 1, y: 1, width: 99, height: 49 };
      
      // 기본 허용 오차: 2px
      const diff = compareLayout(layout1, layout2, { tolerance: 2 });
      
      expect(diff.isMatch).toBe(true);
    });
  });

  describe("compareLayouts", () => {
    test("전체 레이아웃 비교 결과를 반환한다", () => {
      const figmaLayouts: LayoutData[] = [
        { id: "1", name: "Root", x: 0, y: 0, width: 100, height: 100 },
        { id: "2", name: "Child1", x: 10, y: 10, width: 80, height: 40 },
        { id: "3", name: "Child2", x: 10, y: 60, width: 80, height: 30 },
      ];
      
      const domLayouts: LayoutData[] = [
        { id: "1", name: "", x: 0, y: 0, width: 100, height: 100 },
        { id: "2", name: "", x: 10, y: 10, width: 80, height: 40 },
        // id: "3" 누락
      ];
      
      const result = compareLayouts(figmaLayouts, domLayouts);
      
      expect(result.totalNodes).toBe(3);
      expect(result.matchedNodes).toBe(2);
      expect(result.mismatchedNodes).toBe(0);
      expect(result.missingInDom).toContain("3");
    });

    test("불일치 노드를 정확히 감지한다", () => {
      const figmaLayouts: LayoutData[] = [
        { id: "1", name: "Root", x: 0, y: 0, width: 100, height: 100 },
      ];
      
      const domLayouts: LayoutData[] = [
        { id: "1", name: "", x: 0, y: 0, width: 100, height: 0 },  // height 다름
      ];
      
      const result = compareLayouts(figmaLayouts, domLayouts);
      
      expect(result.matchedNodes).toBe(0);
      expect(result.mismatchedNodes).toBe(1);
      expect(result.diffs[0].heightDiff).toBe(100);
    });
  });
});
