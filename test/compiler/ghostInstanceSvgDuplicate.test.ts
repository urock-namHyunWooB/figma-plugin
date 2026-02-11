import { describe, expect, test } from "vitest";
import ghostMockData from "../fixtures/any/Ghost.json";

import FigmaCodeGenerator from "@code-generator";

/**
 * Ghost 컴포넌트 SVG 중복 렌더링 회귀 테스트
 *
 * 문제: INSTANCE 노드가 외부 컴포넌트로 렌더링될 때,
 * INSTANCE 내부의 VECTOR 노드가 추가로 렌더링되어 SVG가 2번 나타남
 *
 * 원인: NodeConverter에서 외부 컴포넌트 wrapper 생성 시
 * children을 함께 포함했기 때문
 *
 * 해결: 외부 컴포넌트가 내부 노드를 포함하므로 children 제외
 */
describe("Ghost INSTANCE SVG 중복 렌더링 회귀 테스트", () => {
  test("외부 컴포넌트(Plus)만 렌더링되고 내부 VECTOR는 중복되지 않아야 한다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.getGeneratedCode();

    expect(code).toBeDefined();

    // Ghost 컴포넌트의 return 부분 추출
    const ghostMatch = code!.match(
      /function Ghost\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\}/
    );
    expect(ghostMatch).not.toBeNull();

    const ghostReturn = ghostMatch![1];

    // Plus 컴포넌트 사용은 1번이어야 함
    const plusUsageMatches = ghostReturn.match(/<Plus[^>]*\/?>/g);
    expect(plusUsageMatches).not.toBeNull();
    expect(plusUsageMatches!.length).toBe(1);

    // Ghost 내부에 직접적인 <svg> 태그가 없어야 함 (Plus가 SVG를 포함)
    // Plus wrapper 내부에 svg가 직접 있으면 안 됨
    const svgInGhost = ghostReturn.match(/<svg[^>]*>/g);
    expect(svgInGhost).toBeNull();
  });

  test("Plus 의존 컴포넌트가 SVG를 내부에 포함해야 한다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // dependencies에 Plus 컴포넌트가 있어야 함 (키는 componentSetId)
    const depKeys = Object.keys(result.dependencies);
    expect(depKeys.length).toBeGreaterThan(0);

    // Plus 컴포넌트 코드에 svg가 포함되어야 함
    const plusDep = Object.values(result.dependencies)[0];
    expect(plusDep.code).toContain("<svg");
    expect(plusDep.code).toContain("<path");
  });

  test("wrapper 내부에 externalComponent와 svg가 동시에 존재하면 안 된다", async () => {
    const compiler = new FigmaCodeGenerator(ghostMockData as any);
    const code = await compiler.getGeneratedCode();

    expect(code).toBeDefined();

    // Plus_wrapper 스타일이 적용된 span 내부 확인
    // wrapper 안에 <Plus ... />와 <svg>가 동시에 있으면 안 됨
    const wrapperPattern = /<span[^>]*Plus_wrapper[^>]*>([\s\S]*?)<\/span>/g;
    const wrapperMatches = [...code!.matchAll(wrapperPattern)];

    for (const match of wrapperMatches) {
      const wrapperContent = match[1];
      const hasPlusComponent = /<Plus[^>]*\/?>/g.test(wrapperContent);
      const hasSvgElement = /<svg[^>]*>/g.test(wrapperContent);

      // Plus 컴포넌트가 있으면 svg가 직접 있으면 안 됨
      if (hasPlusComponent) {
        expect(hasSvgElement).toBe(false);
      }
    }
  });
});
