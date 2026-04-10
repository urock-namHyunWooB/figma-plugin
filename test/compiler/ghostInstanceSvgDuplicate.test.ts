import { describe, expect, test } from "vitest";
import ghostMockData from "../fixtures/any/Ghost.json";

import FigmaCodeGenerator from "@code-generator2";

/**
 * Ghost 컴포넌트 SVG 중복 렌더링 회귀 테스트
 *
 * 문제: INSTANCE 노드가 외부 컴포넌트로 렌더링될 때,
 * INSTANCE 내부의 VECTOR 노드가 추가로 렌더링되어 SVG가 2번 나타남
 *
 * 해결: vector-only 의존 컴포넌트도 컴포넌트 참조로 렌더링.
 * 서브 컴포넌트 정의에만 SVG가 1번 존재하고,
 * 메인 컴포넌트에서는 <Plus /> 참조만 사용.
 */
describe("Ghost INSTANCE SVG 중복 렌더링 회귀 테스트", () => {
  test("메인 컴포넌트에서 SVG가 인라인되지 않아야 한다 (컴포넌트 참조 사용)", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Ghost 컴포넌트의 return 부분 추출
    const ghostMatch = code!.match(
      /function Ghost\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\}/
    );
    expect(ghostMatch).not.toBeNull();

    const ghostReturn = ghostMatch![1];

    // Ghost 내부에 인라인 SVG가 아닌 <Plus /> 참조가 있어야 함
    expect(ghostReturn).toMatch(/<Plus/);

    // Ghost return에는 인라인 SVG가 없어야 함 (SVG는 Plus 서브 컴포넌트에만 존재)
    expect(ghostReturn).not.toMatch(/<svg/);
  });

  test("Plus 서브 컴포넌트가 컴포넌트 참조로 렌더링되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Plus 서브 컴포넌트 정의가 있어야 함 (function declaration - default)
    expect(code).toMatch(/function\s+Plus\s*\(/);

    // Plus 정의 안에 SVG가 있어야 함
    const plusMatch = code!.match(
      /function\s+Plus\s*\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\);\s*\}/
    );
    expect(plusMatch).not.toBeNull();
    expect(plusMatch![1]).toMatch(/<svg/);
  });

  test("SVG 관련 요소가 메인 컴포넌트에서 중복되지 않아야 한다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Ghost 컴포넌트의 return 부분에서 <svg> 태그 수 확인
    const ghostMatch = code!.match(
      /function Ghost\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\}/
    );
    expect(ghostMatch).not.toBeNull();

    const ghostReturn = ghostMatch![1];

    // Ghost return에 SVG가 0개 (서브 컴포넌트에만 존재)
    const svgCount = (ghostReturn.match(/<svg[^>]*>/g) || []).length;
    expect(svgCount).toBe(0);
  });
});
