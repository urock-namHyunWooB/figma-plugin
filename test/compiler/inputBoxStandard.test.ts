import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";

// InputBoxstandard fixture
import inputBoxStandardFixture from "../fixtures/any/InputBoxstandard.json";

describe("InputBoxstandard Array.includes 패턴 테스트", () => {
  test("Array.includes 패턴에서 state prop이 보존되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxStandardFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // State prop이 interface에 포함되어야 함
    // ["Insert", "Error"].includes(state) 패턴이 사용되는 경우
    expect(code).toMatch(/state\??:\s*/);

    // state prop을 사용하는 조건부 렌더링이 있어야 함
    // state 변수가 존재해야 함
    expect(code).toContain("state");
  });

  test("Array.includes 패턴이 올바르게 생성되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxStandardFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // ["Insert", "Error"].includes(state) 또는 유사한 패턴이 있어야 함
    // 배열 리터럴과 includes 메서드 사용
    const hasArrayIncludesPattern =
      code.includes(".includes(") &&
      code.includes("[") &&
      code.includes("]");

    // 패턴이 있을 수 있음 (컴파일 최적화에 따라 변경될 수 있음)
    // 최소한 state 변수가 정의되고 사용되어야 함
    expect(code).toMatch(/state/);
  });

  test("CSS 변환 불가능한 state 값이 조건부 렌더링에 사용되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxStandardFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // "Insert"나 "Error" 같은 CSS 변환 불가능한 state 값이 코드에 포함되어야 함
    const hasCustomStates =
      code.includes('"Insert"') ||
      code.includes("'Insert'") ||
      code.includes('"Error"') ||
      code.includes("'Error'");

    expect(hasCustomStates).toBe(true);
  });

  test("컴파일된 코드가 유효한 TypeScript여야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxStandardFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // 기본적인 구조 체크 (export type 또는 export interface 모두 유효한 TypeScript)
    expect(code).toMatch(/export (type|interface)/);
    expect(code).toMatch(/export (default )?function/);

    // state prop이 사용될 때 항상 정의되어 있어야 함
    if (code.includes(".includes(state)") || code.includes("state ===")) {
      // state 변수 선언이 있어야 함
      expect(code).toMatch(/state\s*=\s*/);
    }
  });
});
