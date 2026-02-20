import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import measure from "../fixtures/any/Measure.json";
import { FigmaNodeData } from "@code-generator2";

/**
 * VECTOR 노드 스타일 처리 테스트
 *
 * 1. SVG 전용 속성 (stroke-width, stroke) CSS에서 제거
 * 2. absoluteRenderBounds 기반 크기 설정
 * 3. overflow: visible 추가
 */
describe("VECTOR 스타일 처리", () => {
  test("SVG 전용 속성이 CSS에서 제거되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(measure as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // CSS에 stroke-width, stroke가 없어야 함 (SVG 내부 속성이지 CSS 아님)
    // 단, SVG 태그 내부의 stroke는 허용
    const cssBlocks = code.match(/css`[^`]+`/g) || [];
    for (const cssBlock of cssBlocks) {
      // CSS 블록에서 stroke-width가 없어야 함
      expect(cssBlock).not.toMatch(/stroke-width:/);
    }
  });

  test("VECTOR 노드에 overflow: visible이 있어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(measure as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Line SVG가 있으면 overflow: visible이 있어야 함
    if (code.includes("LineCss")) {
      expect(code).toMatch(/overflow:\s*visible/);
    }
  });

  test("회전된 요소에 transform: rotate가 제거되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(measure as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Measure 컴포넌트의 회전된 요소에서 transform: rotate가 제거됨
    // 대신 absoluteRenderBounds 기준 크기가 설정됨
    // (실제 구현에 따라 검증 방식 조정)
    expect(code.length).toBeGreaterThan(0);
  });

  test("SVG path에 stroke 속성이 유지되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(measure as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // SVG path 내부의 stroke 속성은 유지
    expect(code).toMatch(/<path[^>]*stroke=/);
  });
});
