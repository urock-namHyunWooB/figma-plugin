import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";

describe("SLOT prop 조건부 스타일 처리", () => {
  const headerrootFixturePath = path.join(__dirname, "../fixtures/any/Headerroot.json");

  it("SLOT prop별 조건부 CSS 변수가 생성되어야 한다", async () => {
    const headerroot = JSON.parse(fs.readFileSync(headerrootFixturePath, "utf8"));
    const compiler = new FigmaCompiler(headerroot, { strategy: "emotion" });
    const result = await compiler.compile();

    // rightIcon slot에 대한 With/Without CSS 변수가 생성되어야 함
    expect(result).toContain("HeaderrootWithRightIconCss");
    expect(result).toContain("HeaderrootWithoutRightIconCss");

    // With CSS 추출 (rightIcon이 있을 때)
    const withCssMatch = result.match(/const HeaderrootWithRightIconCss = css`([^`]+)`/);
    expect(withCssMatch).toBeTruthy();
    const withCss = withCssMatch![1];

    // Without CSS 추출 (rightIcon이 없을 때)
    const withoutCssMatch = result.match(/const HeaderrootWithoutRightIconCss = css`([^`]+)`/);
    expect(withoutCssMatch).toBeTruthy();
    const withoutCss = withoutCssMatch![1];

    // 두 CSS가 다른 스타일을 가져야 함
    expect(withCss).not.toEqual(withoutCss);
  });

  it("rightIcon이 있을 때 적절한 레이아웃 스타일이 적용되어야 한다", async () => {
    const headerroot = JSON.parse(fs.readFileSync(headerrootFixturePath, "utf8"));
    const compiler = new FigmaCompiler(headerroot, { strategy: "emotion" });
    const result = await compiler.compile();

    const withCssMatch = result.match(/const HeaderrootWithRightIconCss = css`([^`]+)`/);
    const withCss = withCssMatch![1];

    // rightIcon이 있을 때는 justify-content: center, align-items: flex-start
    // 그리고 gap이 더 크게 설정됨 (245px)
    expect(withCss).toMatch(/justify-content:\s*center/);
    expect(withCss).toMatch(/align-items:\s*flex-start/);
    expect(withCss).toMatch(/gap:\s*245px/);
  });

  it("rightIcon이 없을 때 적절한 레이아웃 스타일이 적용되어야 한다", async () => {
    const headerroot = JSON.parse(fs.readFileSync(headerrootFixturePath, "utf8"));
    const compiler = new FigmaCompiler(headerroot, { strategy: "emotion" });
    const result = await compiler.compile();

    const withoutCssMatch = result.match(/const HeaderrootWithoutRightIconCss = css`([^`]+)`/);
    const withoutCss = withoutCssMatch![1];

    // rightIcon이 없을 때는 align-items: center
    // padding이 오른쪽으로 더 많이 설정됨 (16px 301px 16px 24px)
    expect(withoutCss).toMatch(/align-items:\s*center/);
    expect(withoutCss).toMatch(/padding:\s*16px\s+301px\s+16px\s+24px/);
  });

  it("JSX에서 CSS 배열로 조건부 스타일을 적용해야 한다", async () => {
    const headerroot = JSON.parse(fs.readFileSync(headerrootFixturePath, "utf8"));
    const compiler = new FigmaCompiler(headerroot, { strategy: "emotion" });
    const result = await compiler.compile();

    // css={[HeaderrootCss, rightIcon != null ? ... : ...]} 패턴 확인
    expect(result).toMatch(/css=\{?\[/);
    expect(result).toMatch(/HeaderrootCss/);
    expect(result).toMatch(/rightIcon\s*!=\s*null/);
    expect(result).toMatch(/HeaderrootWithRightIconCss/);
    expect(result).toMatch(/HeaderrootWithoutRightIconCss/);
  });

  it("SLOT prop이 React.ReactNode 타입이어야 한다", async () => {
    const headerroot = JSON.parse(fs.readFileSync(headerrootFixturePath, "utf8"));
    const compiler = new FigmaCompiler(headerroot, { strategy: "emotion" });
    const result = await compiler.compile();

    // Props interface에서 rightIcon이 React.ReactNode 타입인지 확인
    // interface는 extends를 포함할 수 있으므로 더 넓은 범위로 매칭
    const propsMatch = result.match(/interface\s+HeaderrootProps[\s\S]*?\n\}/);
    expect(propsMatch).toBeTruthy();
    const propsInterface = propsMatch![0];

    expect(propsInterface).toMatch(/rightIcon\?:\s*React\.ReactNode/);
  });

  it("Base CSS에는 조건부 스타일이 포함되지 않아야 한다", async () => {
    const headerroot = JSON.parse(fs.readFileSync(headerrootFixturePath, "utf8"));
    const compiler = new FigmaCompiler(headerroot, { strategy: "emotion" });
    const result = await compiler.compile();

    // Base CSS (HeaderrootCss)는 공통 스타일만 포함
    const baseCssMatch = result.match(/const HeaderrootCss = css`([^`]+)`/);
    expect(baseCssMatch).toBeTruthy();
    const baseCss = baseCssMatch![1];

    // Base CSS에는 display: flex 등 공통 스타일만 있어야 함
    expect(baseCss).toMatch(/display:\s*flex/);

    // 조건부 스타일(justify-content: center, gap: 245px)은 Base에 없어야 함
    // 이들은 With/Without CSS에만 있어야 함
    expect(baseCss).not.toMatch(/gap:\s*245px/);
    expect(baseCss).not.toMatch(/justify-content:\s*center/);
  });
});
