import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import * as fs from "fs";
import * as path from "path";

describe("Radio 컴포넌트 코드 생성", () => {
  let code: string;

  beforeAll(async () => {
    const fixturePath = path.join(
      __dirname,
      "../fixtures/failing/Radio.json"
    );
    const figmaData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(figmaData);
    code = (await compiler.compile())!;
  });

  test("RadioProps에 정확한 props만 생성되어야 한다", () => {
    // 인터페이스 블록 추출
    const interfaceBlock = code.match(
      /export interface RadioProps \{([\s\S]*?)\}/
    )?.[1];
    expect(interfaceBlock).toBeDefined();

    // prop 이름 추출 (줄 시작의 prop 선언만)
    const propNames = [...interfaceBlock!.matchAll(/^\s+(\w+)\??:/gm)].map(m => m[1]);

    // 정확히 이 props만 존재해야 한다
    expect(propNames).toEqual(
      expect.arrayContaining(["checked", "onChange", "disable", "text"])
    );
    expect(propNames).toHaveLength(4);

    // 생성되면 안 되는 props
    expect(propNames).not.toContain("check");
    expect(propNames).not.toContain("status");
  });

  describe("WAI-ARIA 접근성", () => {
    test('role="radio"가 있어야 한다', () => {
      expect(code).toMatch(/role=\{?"radio"\}?/);
    });

    test("aria-checked가 checked prop에 바인딩되어야 한다", () => {
      expect(code).toMatch(/aria-checked=\{checked\}/);
    });
  });
});
