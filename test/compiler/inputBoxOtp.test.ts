import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";

// InputBoxotp fixture
import inputBoxotpFixture from "../fixtures/any/InputBoxotp.json";

describe("InputBoxotp 컴파일 테스트", () => {
  test("숫자로 시작하는 노드 이름이 올바른 식별자로 변환되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxotpFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();
    expect(code).toBeTruthy();

    // 숫자로 시작하는 식별자가 없어야 함 (063112 같은)
    // JavaScript 식별자는 숫자로 시작할 수 없음
    const invalidIdentifiers = code.match(/(?<![a-zA-Z_$])0[0-9]+(?=\s*[=:?])/g);
    expect(invalidIdentifiers).toBeNull();

    // _063112 또는 유사한 형태로 변환되어야 함
    // 숫자로 시작하는 이름은 앞에 _가 붙어야 함
    if (code.includes("063112")) {
      expect(code).toContain("_063112");
    }
  });

  test("CSS 변환 불가능한 State prop이 보존되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxotpFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // State prop이 interface에 포함되어야 함
    // state?: State (타입 별칭) 또는 state?: "Normal" | "Error" (문자열 리터럴) 형태
    expect(code).toMatch(/state\?:\s*(?:State|["'][^"']+["'])/);

    // 기본값이 설정되어야 함 (state = "Normal" 또는 state = "Error" 등)
    expect(code).toMatch(/state\s*=\s*["'][^"']+["']/);

    // state prop을 사용하는 동적 스타일이 있어야 함
    // 패턴 1: StateStyles[state] (객체 인덱싱)
    // 패턴 2: Css(state) (함수 호출)
    // 패턴 3: state === "Error" (조건부 렌더링)
    const hasStateUsage =
      /StateStyles\[state\]/.test(code) ||
      /Css\(state\)/.test(code) ||
      /state\s*===\s*["']/.test(code);
    expect(hasStateUsage).toBe(true);
  });

  test("State 조건부 visible이 올바르게 처리되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxotpFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // CSS 변환 가능한 state (Default, Hover 등)는 CSS pseudo-class로 처리
    // CSS 변환 불가능한 state (Error, Insert, Press 등)는 동적 스타일로 처리
    // StateStyles 객체에 Error, Insert, Press 키가 있어야 함
    const hasErrorStyle = /Error:\s*css\(/.test(code) || /["']Error["']:/.test(code);
    const hasInsertStyle = /Insert:\s*css\(/.test(code) || /["']Insert["']:/.test(code);
    const hasPressStyle = /Press:\s*css\(/.test(code) || /["']Press["']:/.test(code);

    // Error, Insert, Press 중 최소 하나는 동적 스타일로 처리되어야 함
    expect(hasErrorStyle || hasInsertStyle || hasPressStyle).toBe(true);
  });
});
