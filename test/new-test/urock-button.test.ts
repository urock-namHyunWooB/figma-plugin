import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

/**
 * urock-button 컴파일 테스트
 *
 * 기대 스펙:
 * - props에는 타입값이 적용되어 있어야 한다.
 * - iconLeft는 하나만 있어야 한다.
 * - iconRight는 하나만 있어야 한다.
 * - text prop은 하나여야 한다.
 * - btnCss_customTypeStyles 스타일이 적용되어야 한다.
 * - btnCss_customTypeStyles에 variant 값 받아서 적용되어야 한다.
 * - 사용되지 않을 불필요한 style은 생성되지 않아야 한다.
 */
describe("urock-button", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/button/urockButton.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("props에는 타입값이 적용되어 있어야 한다", async () => {
    const result = await compileFixture();

    // size는 union type이어야 함
    expect(result).toMatch(/size\?:\s*"L"\s*\|\s*"M"\s*\|\s*"S"/);

    // customType은 union type이어야 함
    expect(result).toMatch(/customType\?:/);
    expect(result).toMatch(/"filled"/);
    expect(result).toMatch(/"outlined_black"/);
    expect(result).toMatch(/"outlined_blue"/);
    expect(result).toMatch(/"text"/);

    // iconLeft, iconRight는 React.ReactNode
    expect(result).toMatch(/iconLeft\?:\s*React\.ReactNode/);
    expect(result).toMatch(/iconRight\?:\s*React\.ReactNode/);
  });

  it("iconLeft는 JSX에서 하나만 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // JSX 영역에서 {iconLeft} 출현 횟수 카운트
    const iconLeftMatches = result.match(/\{iconLeft\}/g);
    expect(iconLeftMatches).toBeTruthy();
    expect(iconLeftMatches!.length).toBe(1);
  });

  it("iconRight는 JSX에서 하나만 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // JSX 영역에서 {iconRight} 출현 횟수 카운트
    const iconRightMatches = result.match(/\{iconRight\}/g);
    expect(iconRightMatches).toBeTruthy();
    expect(iconRightMatches!.length).toBe(1);
  });

  it("text prop은 하나여야 한다", async () => {
    const result = await compileFixture();

    // interface에서 text 관련 prop 추출
    const interfaceMatch = result.match(
      /interface\s+\w+Props\s*\{([^}]+)\}/s
    );
    expect(interfaceMatch).toBeTruthy();

    const interfaceBody = interfaceMatch![1];

    // text 또는 buttonText 중 하나만 있어야 함 (둘 다 있으면 안 됨)
    const textProps = interfaceBody.match(/\b\w*[Tt]ext\w*\?:/g) || [];
    expect(textProps.length).toBe(1);
  });

  it("btnCss_customTypeStyles 스타일이 JSX에 적용되어야 한다", async () => {
    const result = await compileFixture();

    // btnCss_customTypeStyles가 정의되어야 함
    expect(result).toMatch(/btnCss_customTypeStyles/);

    // JSX에서 customTypeStyles가 사용되어야 함
    expect(result).toMatch(/btnCss_customTypeStyles\[customType\]/);
  });

  it("btnCss_customTypeStyles에 customType variant 키들이 있어야 한다", async () => {
    const result = await compileFixture();

    // customTypeStyles 객체에 각 variant 키가 있어야 함
    const customTypeStylesMatch = result.match(
      /btnCss_customTypeStyles\s*=\s*\{([\s\S]*?)\n\};/
    );
    expect(customTypeStylesMatch).toBeTruthy();

    const stylesBody = customTypeStylesMatch![1];
    expect(stylesBody).toMatch(/filled:/);
    expect(stylesBody).toMatch(/outlined_black:/);
    expect(stylesBody).toMatch(/outlined_blue:/);
    expect(stylesBody).toMatch(/\btext:/);
    expect(stylesBody).toMatch(/"text-black":/);
  });

  it("사용되지 않는 불필요한 style 변수가 생성되지 않아야 한다", async () => {
    const result = await compileFixture();

    // JSX return 부분 추출
    const jsxMatch = result.match(/return\s*\(([\s\S]*)\);\s*\}$/m);
    expect(jsxMatch).toBeTruthy();
    const jsx = jsxMatch![1];

    // 정의된 모든 const 스타일 변수 추출
    const styleVarDefs = result.match(/const\s+(\w+)\s*=\s*(?:css`|\{)/g) || [];
    const definedVars = styleVarDefs.map((m) => m.match(/const\s+(\w+)/)![1]);

    // 각 정의된 변수가 JSX에서 참조되는지 확인
    const unusedVars = definedVars.filter((v) => !jsx.includes(v));
    expect(unusedVars).toEqual([]);
  });
});
