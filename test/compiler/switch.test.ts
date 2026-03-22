import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import * as fs from "fs";
import * as path from "path";

describe("Switch 컴포넌트 코드 생성", () => {
  let code: string;

  beforeAll(async () => {
    const fixturePath = path.join(
      __dirname,
      "../fixtures/failing/Switch.json"
    );
    const figmaData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(figmaData);
    code = (await compiler.compile())!;
  });

  test("컴파일이 성공해야 한다", () => {
    expect(code).toBeTruthy();
  });

  describe("WAI-ARIA 접근성", () => {
    test('role="switch"가 있어야 한다', () => {
      expect(code).toMatch(/role=\{?"switch"\}?/);
    });

    test("aria-checked가 active prop에 바인딩되어야 한다", () => {
      expect(code).toMatch(/aria-checked=\{active\}/);
    });
  });
});
