import { describe, test, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import taptapButtonDSL from "../fixtures/button/taptapButton.json";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { transpile } from "@frontend/ui/domain/transpiler/pipeline/transpiler";
import { compileReactComponent } from "@frontend/ui/utils/component-compiler";

describe("DSL to React Transpiler", () => {
  test("taptapButtonDSL을 리액트 컴포넌트로 변환하고 렌더링", async () => {
    // 1. DSL을 리액트 코드로 변환
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // 2. 생성된 코드가 비어있지 않은지 확인
    expect(tsxCode).toBeTruthy();
    expect(tsxCode.length).toBeGreaterThan(0);
    // export default 또는 export function 형식 모두 허용
    // export default가 별도 줄에 있어도 인식
    expect(
      tsxCode.match(/export\s+(default\s+)?(function|const)/) ||
        tsxCode.match(/export\s+default\s+\w+;?\s*$/)
    ).toBeTruthy();

    // 3. 리액트 컴포넌트로 컴파일
    const Component = await compileReactComponent(tsxCode);
    expect(Component).toBeTruthy();
    expect(typeof Component).toBe("function");

    // 4. 컴포넌트 렌더링
    const { container } = render(<Component />);

    // 5. 렌더링 결과 검증
    expect(container).toBeTruthy();
    expect(container.firstChild).toBeTruthy();
  });

  test("생성된 컴포넌트가 props를 받아서 렌더링", async () => {
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);
    const Component = await compileReactComponent(tsxCode);

    // text prop 전달
    const { container } = render(<Component text="테스트 버튼" />);

    // 컴포넌트가 정상적으로 렌더링되는지 확인
    expect(container).toBeTruthy();
    expect(container.firstChild).toBeTruthy();
  });

  test("생성된 코드가 유효한 TypeScript/JSX 문법", async () => {
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // 기본적인 문법 검증
    expect(tsxCode).not.toContain("undefined");
    expect(tsxCode).toContain("function");
    expect(tsxCode).toContain("return");

    // 괄호 매칭 확인
    const openBraces = (tsxCode.match(/{/g) || []).length;
    const closeBraces = (tsxCode.match(/}/g) || []).length;
    expect(openBraces).toBe(closeBraces);

    // 컴파일 가능한지 확인
    await expect(compileReactComponent(tsxCode)).resolves.toBeTruthy();
  });
});
