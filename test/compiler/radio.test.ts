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

  test("status prop이 생성되지 않아야 한다", () => {
    expect(code).not.toMatch(/status\?\s*:/);
    expect(code).not.toMatch(/"Normal"\s*\|\s*"Hover\/Pressed"/);
  });

  test("text?: string prop이 생성되어야 한다", () => {
    expect(code).toMatch(/text\?\s*:\s*string/);
  });

  test("checked?: boolean prop이 생성되어야 한다", () => {
    expect(code).toMatch(/checked\?\s*:\s*boolean/);
  });

  test("disable?: boolean prop이 생성되어야 한다", () => {
    expect(code).toMatch(/disable\?\s*:\s*boolean/);
  });
});
