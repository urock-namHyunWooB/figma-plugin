import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Popup 시각적 스타일 제거 검증", () => {
  const popupFixturePath = path.join(__dirname, "../fixtures/any/Popup.json");

  it("Large dependency에서 background/border-radius가 제거되어야 한다", async () => {
    const popup = JSON.parse(fs.readFileSync(popupFixturePath, "utf8"));
    const compiler = new FigmaCodeGenerator(popup, { strategy: "emotion" });
    const result = await compiler.compile();

    // v2: Large 컴포넌트 CSS 추출 (Large_largeCss 패턴)
    const largeCssMatch = result.match(/const Large_largeCss = css`([^`]+)`/);
    expect(largeCssMatch).toBeTruthy();

    const largeCss = largeCssMatch![1];

    // 원래 background 색상이 제거되었는지 확인 (transparent는 허용)
    // wrapper가 시각적 스타일을 담당하므로, dependency에서는 원래 background가 제거됨
    expect(largeCss).not.toMatch(/background:\s*#[0-9A-Fa-f]+/);
    expect(largeCss).not.toMatch(/background:\s*var\(/);

    // border-radius가 제거되었는지 확인
    expect(largeCss).not.toContain("border-radius");
  });

  it("wrapper(largeWrapper)에는 background가 있어야 한다", async () => {
    const popup = JSON.parse(fs.readFileSync(popupFixturePath, "utf8"));
    const compiler = new FigmaCodeGenerator(popup, { strategy: "emotion" });
    const result = await compiler.compile();

    // v2: Wrapper CSS는 largeWrapper_ID 패턴 (INSTANCE ID별)
    const wrapperMatches = result.match(/const largeWrapper_\w+ = css`([^`]+)`/g);
    expect(wrapperMatches).toBeTruthy();
    expect(wrapperMatches!.length).toBeGreaterThanOrEqual(2);

    // wrapper에 background가 있어야 함 (원본 색상이 wrapper로 이동)
    const wrapperBgColors: string[] = [];
    for (const wrapper of wrapperMatches!) {
      const cssContent = wrapper.match(/css`([^`]+)`/)?.[1] || "";
      expect(cssContent).toContain("background");
      wrapperBgColors.push(cssContent);
    }

    // 구체적 색상값 확인: Neutral(#595b5e)과 Primary(#0050ff)가 wrapper에 있어야 함
    const allWrapperCss = wrapperBgColors.join("\n").toLowerCase();
    expect(allWrapperCss).toContain("#595b5e");
    expect(allWrapperCss).toMatch(/#0050ff|--primary-normal/);
  });
});
