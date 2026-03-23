import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";
import fixture from "../fixtures/failing/SegmentedControl.json";

describe("SegmentedControl 컴포넌트 코드 생성", () => {
  let code: string;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(
      fixture as unknown as FigmaNodeData
    );
    code = (await compiler.compile())!;
  });

  test("컴파일이 성공해야 한다", () => {
    expect(code).toBeTruthy();
  });

  test("SegmentedControlProps에 올바른 props가 생성되어야 한다", () => {
    // interface 블록 추출 (중첩 브레이스 처리)
    const interfaceStart = code.search(/interface SegmentedControl(?:Own)?Props \{/);
    expect(interfaceStart).toBeGreaterThan(-1);
    let depth = 0;
    let interfaceEnd = interfaceStart;
    for (let i = interfaceStart; i < code.length; i++) {
      if (code[i] === "{") depth++;
      if (code[i] === "}") { depth--; if (depth === 0) { interfaceEnd = i; break; } }
    }
    const interfaceBlock = code.slice(interfaceStart, interfaceEnd + 1);

    const propNames = [...interfaceBlock.matchAll(/^\s+(\w+)\??:/gm)].map(
      (m) => m[1]
    );

    // 필수 props
    expect(propNames).toContain("size");
    expect(propNames).toContain("options");
    expect(propNames).toContain("selectedValue");
    expect(propNames).toContain("onValueChange");

    // dead prop이 없어야 함
    expect(propNames).not.toContain("labelText");
  });

  test("options는 배열 타입이어야 한다 (variant 아님)", () => {
    // "2 options" | "3 options" 같은 variant 타입이면 안 됨
    expect(code).not.toMatch(/options\?\s*:\s*"2 options"/);
    // Array<{ label: string; value: string }> 형태여야 함
    expect(code).toMatch(/options\?\s*:\s*Array</);
  });

  test("options 기본값은 빈 배열이어야 한다", () => {
    expect(code).toMatch(/options\s*=\s*\[\]/);
  });

  test("onChange는 함수 타입이어야 한다", () => {
    expect(code).toMatch(/onValueChange\?\s*:\s*\(/);
  });

  test("options.map()으로 루프 렌더링해야 한다", () => {
    expect(code).toMatch(/\.map\s*\(/);
  });

  test("루프 안에서 item.label을 렌더링해야 한다", () => {
    // option.label 또는 item.label 형태
    expect(code).toMatch(/\.\s*label/);
  });

  test("onClick에서 onChange를 호출해야 한다", () => {
    expect(code).toMatch(/onClick.*onValueChange/s);
  });

  test("size에 따른 동적 스타일이 보존되어야 한다", () => {
    // size별 height가 있어야 함
    expect(code).toMatch(/height:\s*24px/); // default
    expect(code).toMatch(/height:\s*20px/); // small
    expect(code).toMatch(/height:\s*28px/); // large
  });

  test("onClick에서 선택된 option의 value가 onChange로 전달되어야 한다", () => {
    // onChange?.(option.value) 또는 onChange?.(item.value) 형태
    expect(code).toMatch(/onValueChange\?\.\(\s*\w+\.value\s*\)/);
  });

  test("label의 원본 스타일이 보존되어야 한다", () => {
    // Label TEXT 노드의 스타일: font-size 13px, text-align center
    expect(code).toMatch(/font-size:\s*13px/);
    expect(code).toMatch(/text-align:\s*center/);
  });
});
