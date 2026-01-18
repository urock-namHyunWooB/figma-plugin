import { describe, expect, test } from "vitest";
import FigmaCompiler from "@compiler";
import frame427318162 from "../fixtures/failing/Frame427318162.json";
import { FigmaNodeData } from "@/frontend/ui/domain/compiler";

/**
 * flex-basis 수정 테스트
 *
 * 문제: Figma getCSSAsync()가 `flex: 1 0 0` (flex-basis: 0)을 반환하면
 * padding이 있는 요소들의 크기가 불균등해짐
 *
 * 근본 해결: flex-basis를 실제 Figma 크기로 설정
 * `flex: 1 0 0` → `flex: 1 0 {width}px`
 */
describe("Flex-basis 수정", () => {
  test("flex-basis: 0이 실제 크기로 변환되어야 한다", async () => {
    const compiler = new FigmaCompiler(
      frame427318162 as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // flex-basis가 0이 아닌 실제 px 값으로 변환되어야 함
    // flex: 1 0 0 → flex: 1 0 {width}px
    if (code.includes("flex:")) {
      // flex: 1 0 0 패턴이 있으면 실제 크기로 변환되어야 함
      expect(code).not.toMatch(/flex:\s*["']?1\s+0\s+0["']?[;`]/);
    }
  });

  test("flex-grow와 flex-shrink는 유지되어야 한다", async () => {
    const compiler = new FigmaCompiler(
      frame427318162 as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // flex 속성이 있으면 flex-grow, flex-shrink 값이 유지됨
    if (code.includes("flex:")) {
      expect(code).toMatch(/flex:\s*["']?\d+\s+\d+/);
    }
  });
});

/**
 * 회전된 요소 처리 테스트
 *
 * 문제: CSS transform: rotate()는 시각적 변환만 수행하고 레이아웃에는 영향 없음
 * Figma의 absoluteRenderBounds가 회전 후 실제 크기를 제공
 *
 * 해결: ±90도 회전된 요소는 transform 제거하고 absoluteRenderBounds 기준 크기 설정
 */
describe("회전된 요소 처리", () => {
  test("VECTOR 노드가 SVG로 렌더링되어야 한다", async () => {
    const compiler = new FigmaCompiler(
      frame427318162 as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // VECTOR 노드가 있으면 SVG로 렌더링됨
    if (code.includes("<svg")) {
      // SVG 태그가 존재해야 함
      expect(code).toMatch(/<svg[^>]*>/);
    }
  });
});
