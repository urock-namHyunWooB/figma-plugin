import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";
import inputFixture from "../fixtures/any/Input.json";

describe("Input 컴포넌트 코드 생성", () => {
  let code: string;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(
      inputFixture as unknown as FigmaNodeData
    );
    code = (await compiler.compile())!;
  });

  test("컴파일이 성공해야 한다", () => {
    expect(code).toBeTruthy();
  });

  test("InputProps에 올바른 props가 생성되어야 한다", () => {
    const interfaceBlock = code.match(
      /export interface InputProps \{([\s\S]*?)\}/
    )?.[1];
    expect(interfaceBlock).toBeDefined();

    const propNames = [...interfaceBlock!.matchAll(/^\s+(\w+)\??:/gm)].map(
      (m) => m[1]
    );

    // 필수 props
    expect(propNames).toContain("size");
    expect(propNames).toContain("placeholder");
    expect(propNames).toContain("value");
    expect(propNames).toContain("onChange");

    // boolean으로 생성되면 안 됨
    expect(interfaceBlock).not.toMatch(/customPlaceholder\??\s*:\s*boolean/);
  });

  test("placeholder는 string 타입이어야 한다", () => {
    expect(code).toMatch(/placeholder\??\s*:\s*string/);
  });

  test("value는 string 타입이어야 한다", () => {
    expect(code).toMatch(/value\??\s*:\s*string/);
  });

  test("onChange는 함수 타입이어야 한다", () => {
    // (value: string) => void 또는 유사한 함수 시그니처
    expect(code).toMatch(/onChange\??:\s*\(/);
  });
});
