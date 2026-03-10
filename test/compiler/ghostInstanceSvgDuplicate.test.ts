import { describe, expect, test } from "vitest";
import ghostMockData from "../fixtures/any/Ghost.json";

import FigmaCodeGenerator from "@code-generator2";

/**
 * Ghost 컴포넌트 SVG 중복 렌더링 회귀 테스트
 *
 * 문제: INSTANCE 노드가 외부 컴포넌트로 렌더링될 때,
 * INSTANCE 내부의 VECTOR 노드가 추가로 렌더링되어 SVG가 2번 나타남
 *
 * 해결 (v1): 외부 컴포넌트가 내부 노드를 포함하므로 children 제외
 * 해결 (v2): vector-only 의존 컴포넌트는 merged SVG로 인라인
 */
describe("Ghost INSTANCE SVG 중복 렌더링 회귀 테스트", () => {
  test("SVG가 정확히 1번만 렌더링되어야 한다 (중복 없음)", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Ghost 컴포넌트의 return 부분 추출
    const ghostMatch = code!.match(
      /function Ghost\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\}/
    );
    expect(ghostMatch).not.toBeNull();

    const ghostReturn = ghostMatch![1];

    // vector-only dependency가 인라인되므로 SVG 또는 dangerouslySetInnerHTML 포함
    const svgMatches = ghostReturn.match(/<svg[^>]*>|dangerouslySetInnerHTML/g);
    expect(svgMatches).not.toBeNull();

    // SVG가 정확히 1번만 나타나야 함 (중복 렌더링 방지)
    expect(svgMatches!.length).toBe(1);
  });

  test("Plus 의존 컴포넌트가 인라인 SVG로 렌더링되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Ghost 컴포넌트의 return 부분 추출
    const ghostMatch = code!.match(
      /function Ghost\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\}/
    );
    expect(ghostMatch).not.toBeNull();

    const ghostReturn = ghostMatch![1];

    // Ghost 내부에 <Plus /> 참조 대신 인라인 SVG가 있어야 함
    expect(ghostReturn).not.toMatch(/<Plus[^>]*\/?>/);

    // SVG가 직접 포함되어야 함
    expect(ghostReturn).toMatch(/<svg[^>]*>|dangerouslySetInnerHTML/);
  });

  test("SVG 관련 요소가 wrapper 내부에서 중복되지 않아야 한다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // Ghost 컴포넌트의 return 부분에서 <svg> 태그 수 확인
    const ghostMatch = code!.match(
      /function Ghost\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\}/
    );
    expect(ghostMatch).not.toBeNull();

    const ghostReturn = ghostMatch![1];

    // dangerouslySetInnerHTML 또는 <svg> 중 하나만 사용
    const svgCount = (ghostReturn.match(/<svg[^>]*>/g) || []).length;
    const innerHtmlCount = (ghostReturn.match(/dangerouslySetInnerHTML/g) || []).length;

    // SVG 렌더링 방식이 1번만 사용되어야 함
    expect(svgCount + innerHtmlCount).toBeLessThanOrEqual(1);
  });
});
