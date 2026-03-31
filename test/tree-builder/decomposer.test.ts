import { describe, it, expect } from "vitest";
import { DynamicStyleDecomposer } from "@code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";
import type { ConditionNode } from "@code-generator2/types/types";
import buttonFixture from "../fixtures/failing/Button.json";

/**
 * DynamicStyleDecomposer 단위 테스트
 *
 * prop 역추론이 정확한지 검증:
 * - CSS 속성별로 어떤 prop(또는 compound)이 제어하는지 올바르게 판정
 * - 불필요한 prop이 compound에 포함되지 않음
 * - entry 수 변화에 안정적
 */

// ─── Helper ───

function and(...conditions: Array<{ prop: string; value: string }>): ConditionNode {
  if (conditions.length === 1) {
    return { type: "eq", prop: conditions[0].prop, value: conditions[0].value };
  }
  return {
    type: "and",
    conditions: conditions.map((c) => ({ type: "eq" as const, prop: c.prop, value: c.value })),
  };
}

function eq(prop: string, value: string) {
  return { prop, value };
}

/** decompose 결과에서 특정 CSS property의 owner를 찾음 */
function findOwner(result: Map<string, any>, cssKey: string): string | null {
  for (const [propName, valueMap] of result) {
    for (const [, dv] of valueMap) {
      if (cssKey in dv.style) return propName;
    }
  }
  return null;
}

// ─── Tests ───

describe("DynamicStyleDecomposer prop 역추론", () => {
  describe("단일 prop 제어", () => {
    it("font-size가 size에만 의존하면 size에 귀속", () => {
      const dynamic = [
        { condition: and(eq("size", "L"), eq("tone", "blue")), style: { "font-size": "18px", color: "#FFF" } },
        { condition: and(eq("size", "M"), eq("tone", "blue")), style: { "font-size": "14px", color: "#FFF" } },
        { condition: and(eq("size", "L"), eq("tone", "red")), style: { "font-size": "18px", color: "#F00" } },
        { condition: and(eq("size", "M"), eq("tone", "red")), style: { "font-size": "14px", color: "#F00" } },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      expect(findOwner(result, "font-size")).toBe("size");
    });

    it("color가 tone에만 의존하면 tone에 귀속", () => {
      const dynamic = [
        { condition: and(eq("size", "L"), eq("tone", "blue")), style: { "font-size": "18px", color: "#00F" } },
        { condition: and(eq("size", "M"), eq("tone", "blue")), style: { "font-size": "14px", color: "#00F" } },
        { condition: and(eq("size", "L"), eq("tone", "red")), style: { "font-size": "18px", color: "#F00" } },
        { condition: and(eq("size", "M"), eq("tone", "red")), style: { "font-size": "14px", color: "#F00" } },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      expect(findOwner(result, "color")).toBe("tone");
    });
  });

  describe("compound prop 제어", () => {
    it("background가 style+tone에 의존하면 style+tone compound에 귀속", () => {
      const dynamic = [
        { condition: and(eq("size", "L"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5", "font-size": "18px" } },
        { condition: and(eq("size", "M"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5", "font-size": "14px" } },
        { condition: and(eq("size", "L"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484", "font-size": "18px" } },
        { condition: and(eq("size", "M"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484", "font-size": "14px" } },
        { condition: and(eq("size", "L"), eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE", "font-size": "18px" } },
        { condition: and(eq("size", "M"), eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE", "font-size": "14px" } },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      expect(findOwner(result, "background")).toBe("style+tone");
    });
  });

  describe("불필요한 prop 거부", () => {
    it("size가 color에 영향 없으면 size를 포함한 compound 거부", () => {
      // color는 tone에만 의존. size+tone compound가 선택되면 안 됨.
      const dynamic = [
        { condition: and(eq("size", "L"), eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("size", "M"), eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("size", "S"), eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("size", "L"), eq("tone", "red")), style: { color: "#F00" } },
        { condition: and(eq("size", "M"), eq("tone", "red")), style: { color: "#F00" } },
        { condition: and(eq("size", "S"), eq("tone", "red")), style: { color: "#F00" } },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      const owner = findOwner(result, "color");
      expect(owner).toBe("tone");
      expect(owner).not.toContain("size");
    });

    it("state가 background에 영향 없으면 state를 포함한 compound 거부", () => {
      // background는 style+tone에만 의존. state+style+tone이 아닌 style+tone이어야 함.
      const dynamic = [
        { condition: and(eq("state", "default"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5" } },
        { condition: and(eq("state", "default"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
        { condition: and(eq("state", "default"), eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE" } },
        { condition: and(eq("state", "loading"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5" } },
        { condition: and(eq("state", "loading"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
        { condition: and(eq("state", "loading"), eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE" } },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      const owner = findOwner(result, "background");
      expect(owner).toBe("style+tone");
      expect(owner).not.toContain("state");
    });
  });

  describe("entry 수 변화 안정성", () => {
    it("중복 entry 제거 후에도 같은 prop에 귀속", () => {
      // 6개 entry (size L/M/S × tone blue/red)
      const full = [
        { condition: and(eq("size", "L"), eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("size", "M"), eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("size", "S"), eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("size", "L"), eq("tone", "red")), style: { color: "#F00" } },
        { condition: and(eq("size", "M"), eq("tone", "red")), style: { color: "#F00" } },
        { condition: and(eq("size", "S"), eq("tone", "red")), style: { color: "#F00" } },
      ];

      // 2개 entry (size 병합됨)
      const reduced = [
        { condition: and(eq("tone", "blue")), style: { color: "#00F" } },
        { condition: and(eq("tone", "red")), style: { color: "#F00" } },
      ];

      const resultFull = DynamicStyleDecomposer.decompose(full);
      const resultReduced = DynamicStyleDecomposer.decompose(reduced);

      expect(findOwner(resultFull, "color")).toBe("tone");
      expect(findOwner(resultReduced, "color")).toBe("tone");
    });

    it("불필요한 prop 제거 후에도 compound 유지", () => {
      // state 제거 전: 6 entry, state+style+tone 조건
      // state가 불필요하므로 style+tone으로 귀속되어야 함
      const withState = [
        { condition: and(eq("state", "default"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5" } },
        { condition: and(eq("state", "default"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
        { condition: and(eq("state", "default"), eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE" } },
        { condition: and(eq("state", "loading"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5" } },
        { condition: and(eq("state", "loading"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
        { condition: and(eq("state", "loading"), eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE" } },
      ];

      const result = DynamicStyleDecomposer.decompose(withState);
      expect(findOwner(result, "background")).toBe("style+tone");
    });
  });

  describe("디자인 피드백 감지", () => {
    it("같은 prop 값인데 CSS가 다르면 불일치 진단", () => {
      // filled+blue가 2개인데 배경색이 다름 (디자인 실수)
      const dynamic = [
        { condition: and(eq("size", "L"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5" } },
        { condition: and(eq("size", "M"), eq("style", "filled"), eq("tone", "blue")), style: { background: "#FF0000" } }, // ← 실수
        { condition: and(eq("size", "L"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
        { condition: and(eq("size", "M"), eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
      ];

      const { diagnostics } = DynamicStyleDecomposer.decomposeWithDiagnostics(dynamic);

      // 불일치가 감지되어야 함
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      // background 속성에 대한 불일치
      const bgDiag = diagnostics.find((d) => d.cssProperty === "background");
      expect(bgDiag).toBeTruthy();
    });

    it("prop 조합 누락 감지 — 특정 조합만 없으면 진단", () => {
      // filled+blue, filled+red, outlined+blue는 있지만 outlined+red 없음
      const dynamic = [
        { condition: and(eq("style", "filled"), eq("tone", "blue")), style: { background: "#628CF5" } },
        { condition: and(eq("style", "filled"), eq("tone", "red")), style: { background: "#FF8484" } },
        { condition: and(eq("style", "outlined"), eq("tone", "blue")), style: { background: "#F7F9FE" } },
        // outlined+red 누락
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);

      // decompose는 성공하지만, style+tone compound의 값이 3개뿐
      // (4개 조합 중 1개 누락)
      const bgOwner = findOwner(result, "background");
      expect(bgOwner).toBeTruthy();

      // outlined+red에 대한 entry가 없어야 함
      const styleToneMap = result.get(bgOwner!);
      if (styleToneMap) {
        expect(styleToneMap.has("outlined+red")).toBe(false);
      }
    });

    it("실제 fixture — Button large+default 배경색 불일치 감지", async () => {
      // Button fixture의 large+default variant에 #f2f2f2와 #6a0000이 섞여 있음
      const compiler = new FigmaCodeGenerator(buttonFixture as unknown as FigmaNodeData);
      const result = await compiler.compileWithDiagnostics();

      // 배경색 불일치 진단이 있어야 함
      const bgDiag = result.diagnostics.filter((d) => d.cssProperty === "background");
      expect(bgDiag.length).toBeGreaterThanOrEqual(1);
    });

    it("어떤 prop으로도 설명 안 되는 CSS — 역추론 실패 시 진단", () => {
      // 모든 entry가 다른 background 값 (어떤 prop도 일관적이지 않음)
      const dynamic = [
        { condition: and(eq("size", "L"), eq("tone", "blue")), style: { background: "#111" } },
        { condition: and(eq("size", "M"), eq("tone", "blue")), style: { background: "#222" } },
        { condition: and(eq("size", "L"), eq("tone", "red")), style: { background: "#333" } },
        { condition: and(eq("size", "M"), eq("tone", "red")), style: { background: "#444" } },
      ];

      const { diagnostics } = DynamicStyleDecomposer.decomposeWithDiagnostics(dynamic);

      // 어떤 prop도 background를 일관적으로 제어하지 못하므로 진단 발생
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      const bgDiag = diagnostics.find((d) => d.cssProperty === "background");
      expect(bgDiag).toBeTruthy();
    });
  });
});
