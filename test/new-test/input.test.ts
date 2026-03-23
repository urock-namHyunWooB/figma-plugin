import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";
import { typeCheckCode } from "@frontend/ui/services/typeChecker";
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
      /interface Input(?:Own)?Props \{([\s\S]*?)\}/
    )?.[1];
    expect(interfaceBlock).toBeDefined();

    const propNames = [...interfaceBlock!.matchAll(/^\s+(\w+)\??:/gm)].map(
      (m) => m[1]
    );

    // 필수 props
    expect(propNames).toContain("size");
    expect(propNames).toContain("placeholder");
    expect(propNames).toContain("value");

    // onChange는 OwnProps에 없어야 함 (native InputHTMLAttributes에서 상속)
    expect(propNames).not.toContain("onChange");
    expect(propNames).not.toContain("onChangeValue");

    // boolean으로 생성되면 안 됨
    expect(interfaceBlock).not.toMatch(/customPlaceholder\??\s*:\s*boolean/);
  });

  test("placeholder는 string 타입이어야 한다", () => {
    expect(code).toMatch(/placeholder\??\s*:\s*string/);
  });

  test("value는 string 타입이어야 한다", () => {
    expect(code).toMatch(/value\??\s*:\s*string/);
  });

  test("onChange는 native restProps로 전달되어야 한다", () => {
    // OwnProps에 custom onChange가 없고 restProps spread로 전달
    expect(code).toMatch(/\{\.\.\.restProps\}/);
    expect(code).not.toMatch(/onChangeValue\??:/);
  });

  test("size prop에 의한 동적 스타일이 생성되어야 한다", () => {
    // size별 padding (root)
    expect(code).toMatch(/padding:\s*0\s+10px/); // default
    expect(code).toMatch(/padding:\s*0\s+8px/);  // small
    expect(code).toMatch(/padding:\s*0\s+12px/); // large

    // size별 height (input)
    expect(code).toMatch(/height:\s*32px/); // default
    expect(code).toMatch(/height:\s*28px/); // small
    expect(code).toMatch(/height:\s*36px/); // large
  });

  test("value 텍스트 색상과 ::placeholder 색상이 분리되어야 한다", () => {
    // value 텍스트: dark color (base)
    expect(code).toMatch(/color:\s*var\(--Dark-gray-2,\s*#424242\)/);
    // placeholder 텍스트: ::placeholder pseudo
    expect(code).toMatch(/&::placeholder\s*\{[^}]*color:\s*var\(--Light,\s*#757575\)/);
  });

  test("타입 체커에서 implicit any 에러가 없어야 한다", () => {
    const result = typeCheckCode(code, "Input.tsx");
    const implicitAnyErrors = result.errors.filter(e =>
      e.message.includes("implicitly has an 'any' type")
    );
    expect(implicitAnyErrors).toEqual([]);
  });
});
