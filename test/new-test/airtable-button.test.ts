import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

/**
 * airtable-button 컴파일 테스트
 *
 * 기대 스펙:
 * - prop은 size, variant, icon, labelText만 존재한다.
 * - size: small, default, large
 * - variant: default, primary, danger, secondary
 * - icon은 React.ReactNode
 * - labelText는 string
 */
describe("airtable-button", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/button/airtableButton.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("props는 size, variant, icon, labelText만 존재해야 한다", async () => {
    const result = await compileFixture();

    // interface에 size, variant, icon, labelText가 있어야 함
    expect(result).toMatch(/size\?:/);
    expect(result).toMatch(/variant\?:/);
    expect(result).toMatch(/icon\?:/);
    expect(result).toMatch(/labelText\?:/);

    // secondaryText는 prop으로 존재하면 안 됨
    expect(result).not.toMatch(/secondaryText\?:/);
  });

  it("size는 small, default, large 옵션을 가져야 한다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/size\?:.*"default"/);
    expect(result).toMatch(/size\?:.*"large"/);
    expect(result).toMatch(/size\?:.*"small"/);
  });

  it("variant는 default, primary, danger, secondary 옵션을 가져야 한다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/variant\?:.*"default"/);
    expect(result).toMatch(/variant\?:.*"primary"/);
    expect(result).toMatch(/variant\?:.*"danger"/);
    expect(result).toMatch(/variant\?:.*"secondary"/);
  });

  it("icon은 React.ReactNode 타입이어야 한다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/icon\?:\s*React\.ReactNode/);
  });

  it("button 태그로 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/<button\s/);
    expect(result).toMatch(/<\/button>/);
  });

  it("variant별 스타일이 분리되어야 한다", async () => {
    const result = await compileFixture();

    // variant별 CSS 스타일 객체가 존재해야 함
    expect(result).toMatch(/variantStyles/);
    // 고유 배경색이 있는 variant만 스타일에 포함 (secondary는 base와 동일하여 미포함)
    expect(result).toMatch(/default:\s*css`/);
    expect(result).toMatch(/primary:\s*css`/);
    expect(result).toMatch(/danger:\s*css`/);
  });

  it("size별 스타일이 분리되어야 한다", async () => {
    const result = await compileFixture();

    // size별 CSS 스타일 객체가 존재해야 함
    expect(result).toMatch(/sizeStyles/);
  });
});
