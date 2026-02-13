import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator";
import fs from "fs";

describe("SelectButtons debug", () => {
  it("shows compiled code with option text props", async () => {
    const fixture = JSON.parse(
      fs.readFileSync("./test/fixtures/failing/SelectButtons.json", "utf-8")
    );
    const compiler = new FigmaCodeGenerator(fixture);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // 결과 저장
    fs.writeFileSync("/tmp/selectbuttons-result.json", JSON.stringify(result, null, 2));

    const code = result.mainComponent.code;

    // option1Text, option2Text props가 있어야 함
    expect(code).toMatch(/option1Text/);
    expect(code).toMatch(/option2Text/);

    // labelText={option1Text} 형태로 전달되어야 함
    expect(code).toMatch(/labelText\s*=\s*\{\s*option1Text\s*\}/);
  });
});
