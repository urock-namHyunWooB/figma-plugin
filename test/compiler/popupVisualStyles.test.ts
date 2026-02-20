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

    // Large 컴포넌트 CSS 추출
    const largeCssMatch = result.match(/const LargeCss = css`([^`]+)`/);
    expect(largeCssMatch).toBeTruthy();

    const largeCss = largeCssMatch![1];

    // 원래 background 색상이 제거되었는지 확인 (transparent는 허용)
    // wrapper가 시각적 스타일을 담당하므로, dependency에서는 원래 background가 제거됨
    // 단, 브라우저 기본 배경을 무력화하기 위해 background: transparent는 추가될 수 있음
    expect(largeCss).not.toMatch(/background:\s*#[0-9A-Fa-f]+/);
    expect(largeCss).not.toMatch(/background:\s*var\(/);

    // border-radius가 제거되었는지 확인
    expect(largeCss).not.toContain("border-radius");
  });

  it("wrapper(LeftButton_wrapperCss, RightButton_wrapperCss)에는 background가 있어야 한다", async () => {
    const popup = JSON.parse(fs.readFileSync(popupFixturePath, "utf8"));
    const compiler = new FigmaCodeGenerator(popup, { strategy: "emotion" });
    const result = await compiler.compile();

    // Wrapper CSS 확인 (wrapper 노드는 _wrapperCss suffix)
    const leftBtnMatch = result.match(/const LeftButton_wrapperCss = css`([^`]+)`/);
    const rightBtnMatch = result.match(/const RightButton_wrapperCss = css`([^`]+)`/);

    expect(leftBtnMatch).toBeTruthy();
    expect(rightBtnMatch).toBeTruthy();

    // Left Button: Neutral (#595B5E)
    expect(leftBtnMatch![1]).toContain("background");
    expect(leftBtnMatch![1].toLowerCase()).toContain("#595b5e");

    // Right Button: Primary (#0050FF)
    expect(rightBtnMatch![1]).toContain("background");
    expect(rightBtnMatch![1].toLowerCase()).toMatch(/#0050ff|--primary-normal/);
  });
});
