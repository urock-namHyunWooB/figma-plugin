import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Profile", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/urock/Profile.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as string;
  };

  it("should compile without states prop", async () => {
    const result = await compileFixture();

    // states prop이 제거되어야 함
    expect(result).not.toMatch(/states\?.*"default".*"dimmed".*"none"/);
    expect(result).not.toMatch(/states\s*=/);

    // text는 string이어야 함 (boolean 아님)
    expect(result).toMatch(/text\?\s*:\s*string/);
    expect(result).toMatch(/text\s*=\s*"홍"/);

    // imageSrc는 optional string (no default)
    expect(result).toMatch(/imageSrc\?\s*:\s*string/);

    // size prop은 유지
    expect(result).toMatch(/size\?/);
  });

  it("should have hover effect with ::after overlay", async () => {
    const result = await compileFixture();

    // ::after overlay
    expect(result).toMatch(/&::after/);
    expect(result).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.25\)/);

    // hover shows overlay and text
    expect(result).toMatch(/&:hover::after/);
    expect(result).toMatch(/&:hover\s*>\s*span/);
  });

  it("should render text as {text} not hardcoded", async () => {
    const result = await compileFixture();

    // {text} 렌더링 (하드코딩 "홍" 아님)
    expect(result).toMatch(/\{text\}/);
  });

  it("should show placeholder when imageSrc is not provided", async () => {
    const result = await compileFixture();

    // !imageSrc 조건
    expect(result).toMatch(/!imageSrc/);
  });

  it("should have inline backgroundImage binding", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/backgroundImage.*imageSrc.*url/);
  });

});
