import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Mask Visibility: loading overlay 패턴 (Buttonsolid)", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/failing/Buttonsolid.json"
  );

  it("should hide content with visibility:hidden when loading is true", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();
    const mainCode = result.mainCode;

    expect(mainCode).toMatch(/visibility/i);
  });
});

describe("Mask Visibility: loading overlay 패턴 (Buttonbutton)", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/failing/Buttonbutton.json"
  );

  it("should hide content with visibility:hidden when loading is true", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();
    const mainCode = result.mainCode;

    expect(mainCode).toMatch(/visibility/i);
  });
});
