import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";

describe("Popup 시각적 스타일 제거 검증", () => {
  const popupFixturePath = path.join(__dirname, "../fixtures/any/Popup.json");

  it("Large dependency에서 background/border-radius가 제거되어야 한다", async () => {
    const popup = JSON.parse(fs.readFileSync(popupFixturePath, "utf8"));
    const compiler = new FigmaCompiler(popup, { strategy: "emotion" });
    const result = await compiler.compile();

    // Large 컴포넌트 CSS 추출
    const largeCssMatch = result.match(/const LargeCss = css`([^`]+)`/);
    expect(largeCssMatch).toBeTruthy();

    const largeCss = largeCssMatch![1];

    // background가 제거되었는지 확인
    expect(largeCss).not.toContain("background");

    // border-radius가 제거되었는지 확인
    expect(largeCss).not.toContain("border-radius");
  });

  it("wrapper(LeftButtonCss, RightButtonCss)에는 background가 있어야 한다", async () => {
    const popup = JSON.parse(fs.readFileSync(popupFixturePath, "utf8"));
    const compiler = new FigmaCompiler(popup, { strategy: "emotion" });
    const result = await compiler.compile();

    // Wrapper CSS 확인
    const leftBtnMatch = result.match(/const LeftButtonCss = css`([^`]+)`/);
    const rightBtnMatch = result.match(/const RightButtonCss = css`([^`]+)`/);

    expect(leftBtnMatch).toBeTruthy();
    expect(rightBtnMatch).toBeTruthy();

    // Left Button: Neutral (#595B5E)
    expect(leftBtnMatch![1]).toContain("background");
    expect(leftBtnMatch![1]).toContain("#595B5E");

    // Right Button: Primary (#0050FF)
    expect(rightBtnMatch![1]).toContain("background");
    expect(rightBtnMatch![1]).toMatch(/#0050FF|--Primary-Normal/);
  });
});
