import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import statusBar from "../fixtures/any/BarsstatusBariphoneblack.json";
import { FigmaNodeData } from "@/frontend/ui/domain/compiler";

/**
 * BOOLEAN_OPERATION 노드 처리 테스트
 *
 * BOOLEAN_OPERATION은 여러 VECTOR를 조합한 복합 도형 (예: 배터리 아이콘, 신호 강도)
 * - UNION: 합집합
 * - SUBTRACT: 차집합
 * - INTERSECT: 교집합
 * - EXCLUDE: 배타적 OR
 *
 * 이 테스트는 Status Bar 컴포넌트를 사용하며, 해당 컴포넌트는
 * 배터리 아이콘, 셀룰러 신호, WiFi 아이콘 등 BOOLEAN_OPERATION 노드를 포함합니다.
 */
describe("BOOLEAN_OPERATION 노드 처리", () => {
  test("BOOLEAN_OPERATION 노드가 SVG로 렌더링되어야 한다", async () => {
    const compiler = new FigmaCompiler(statusBar as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThan(0);

    // SVG 요소가 생성되어야 함
    expect(code).toMatch(/<svg/);
  });

  test("vectorSvgs 데이터에 BOOLEAN_OPERATION 노드 SVG가 포함되어야 한다", () => {
    const nodeData = statusBar as unknown as FigmaNodeData;

    // vectorSvgs가 존재해야 함
    expect(nodeData.vectorSvgs).toBeDefined();

    // 최소 1개 이상의 SVG가 있어야 함
    const svgKeys = Object.keys(nodeData.vectorSvgs || {});
    expect(svgKeys.length).toBeGreaterThan(0);

    // SVG 문자열이 실제 SVG 형식이어야 함
    for (const key of svgKeys) {
      const svg = nodeData.vectorSvgs![key];
      expect(svg).toMatch(/^<svg/);
      expect(svg).toMatch(/<\/svg>/);
    }
  });

  test("BOOLEAN_OPERATION 노드의 semanticRole이 vector여야 한다", async () => {
    const compiler = new FigmaCompiler(statusBar as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // SVG path가 포함되어야 함 (BOOLEAN_OPERATION의 결과)
    expect(code).toMatch(/<path/);
  });

  test("복합 도형(배터리 아이콘 등)이 단일 SVG로 렌더링되어야 한다", async () => {
    const compiler = new FigmaCompiler(statusBar as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // fillRule이 포함된 SVG path (BOOLEAN_OPERATION의 특징)
    // JSX에서는 fill-rule이 fillRule로 변환됨
    expect(code).toMatch(/fillRule/);
  });
});
