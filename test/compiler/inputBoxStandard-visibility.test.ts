import { describe, test, expect } from "vitest";
import type { FigmaNodeData } from "@code-generator2";
import FigmaCodeGenerator from "@code-generator2";

import inputBoxStandardFixture from "../fixtures/any/InputBoxstandard.json";

/**
 * InputBoxstandard 복합 조건 visibility 테스트
 *
 * 이슈: Text 노드가 State=Error, Guide Text=False variant에서만 존재하는데,
 *       복합 조건(state === "Error" && guideText === "False")에서
 *       state 부분이 제거되어 Normal state에서도 렌더링되는 문제
 *
 * 해결: _FinalAstTree에서 CSS 변환 불가능한 state(Error, Insert 등)를
 *       포함한 복합 조건을 유지하도록 수정
 */
describe("InputBoxstandard 복합 조건 visibility 테스트", () => {
  test("Text 노드는 state=Error에서만 렌더링되어야 함", async () => {
    const fixture = inputBoxStandardFixture as unknown as FigmaNodeData;
    const generator = new FigmaCodeGenerator(fixture);
    const code = await generator.compile();

    expect(code).toBeTruthy();

    // Text 노드의 렌더링 조건이 state === "Error"를 포함해야 함
    const hasErrorStateCondition =
      code.includes('state === "Error"') || code.includes("state === 'Error'");
    expect(
      hasErrorStateCondition,
      'Text should have state === "Error" condition'
    ).toBe(true);

    // text prop이 존재하고 Error 조건과 함께 사용되어야 함
    expect(code).toContain("text");
  });

  test("Rectangle(svg) 노드는 state=Press에서만 렌더링되어야 함", async () => {
    const fixture = inputBoxStandardFixture as unknown as FigmaNodeData;
    const generator = new FigmaCodeGenerator(fixture);
    const code = await generator.compile();

    expect(code).toBeTruthy();

    // Rectangle의 렌더링 조건이 state === "Press"를 포함해야 함
    const hasPressStateCondition =
      code.includes('state === "Press"') || code.includes("state === 'Press'");
    expect(
      hasPressStateCondition,
      'Rectangle should have state === "Press" condition'
    ).toBe(true);
  });

  test("Normal state(기본값)에서 variant-specific 요소가 조건부로 렌더링됨", async () => {
    const fixture = inputBoxStandardFixture as unknown as FigmaNodeData;
    const generator = new FigmaCodeGenerator(fixture);
    const code = await generator.compile();

    expect(code).toBeTruthy();

    // state의 기본값이 "Normal"이어야 함
    expect(code).toMatch(/state\s*=\s*["']Normal["']/);

    // Normal state에서는:
    // - text가 조건부 렌더링됨 (Error에서만)
    // - Rectangle이 조건부 렌더링됨 (Press에서만)

    // Error와 Press state 조건이 모두 코드에 존재해야 함
    const hasErrorCondition = /state\s*===\s*["']Error["']/.test(code);
    const hasPressCondition = /state\s*===\s*["']Press["']/.test(code);

    expect(hasErrorCondition, "Error state condition must exist").toBe(true);
    expect(hasPressCondition, "Press state condition must exist").toBe(true);
  });

  test("CSS 변환 불가능한 state가 복합 조건에서 유지되어야 함", async () => {
    const fixture = inputBoxStandardFixture as unknown as FigmaNodeData;
    const generator = new FigmaCodeGenerator(fixture);
    const code = await generator.compile();

    expect(code).toBeTruthy();

    // "Error"는 CSS pseudo-class로 변환할 수 없으므로 런타임 조건으로 유지되어야 함
    // 잘못된 동작: state 조건이 제거되고 guideText 조건만 남음
    // 올바른 동작: state === "Error" && !guideText && text 형태로 유지

    // Error는 CSS 변환 불가 → 조건에 유지되어야 함
    const errorConditionPresent =
      code.includes('state === "Error"') || code.includes("state === 'Error'");
    expect(
      errorConditionPresent,
      'CSS-unconvertible state "Error" must be preserved in conditions'
    ).toBe(true);

    // Press도 CSS 변환 불가 → 조건에 유지되어야 함
    const pressConditionPresent =
      code.includes('state === "Press"') || code.includes("state === 'Press'");
    expect(
      pressConditionPresent,
      'CSS-unconvertible state "Press" must be preserved in conditions'
    ).toBe(true);
  });
});
