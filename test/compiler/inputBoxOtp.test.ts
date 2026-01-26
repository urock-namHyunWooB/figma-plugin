import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@compiler/FigmaCodeGenerator";
import type { FigmaNodeData } from "@compiler/types/baseType";

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
    // Error, Insert, Press 등 CSS pseudo-class로 변환할 수 없는 state가 있음
    expect(code).toMatch(/state[\?]?:\s*["'][^"']+["']/);

    // 기본값이 설정되어야 함 (state = "Normal" 또는 state = "Error" 등)
    expect(code).toMatch(/state\s*=\s*["'][^"']+["']/);

    // state prop을 사용하는 조건부 렌더링이 있어야 함
    // 예: state === "Error" 또는 props.state === "Insert"
    expect(code).toMatch(/state\s*===\s*["'](?:Error|Insert|Press|Normal)["']/);
  });

  test("State 조건부 visible이 올바르게 처리되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxotpFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // CSS 변환 가능한 state (Default, Hover 등)는 조건이 제거되고 항상 렌더링
    // CSS 변환 불가능한 state (Error, Insert 등)는 조건부 렌더링 유지
    // state === "Error" 조건이 남아있어야 함
    const errorConditions = code.match(/state\s*===\s*["']Error["']/g);
    expect(errorConditions).not.toBeNull();
    expect(errorConditions!.length).toBeGreaterThan(0);
  });
});
