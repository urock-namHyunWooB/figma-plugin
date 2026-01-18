import { describe, it, expect } from "vitest";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";
import fs from "fs";
import path from "path";

/**
 * Popup 컴포넌트 중첩 의존성 렌더링 테스트
 *
 * Popup.json 케이스:
 * - Popup/Bottom 의존 컴포넌트가 Large(버튼) INSTANCE를 포함
 * - Large INSTANCE의 children이 I... 형태 ID를 가짐
 * - updateCleanupNodes에서 I... 노드가 삭제되지 않아야 함
 * - Popupbottom 컴포넌트에서 Large 버튼이 실제로 렌더링되어야 함
 *
 * 관련 이슈:
 * - INSTANCE children (I... ID)이 updateCleanupNodes에서 삭제됨
 * - _enrichedFromEmptyChildren 플래그가 설정되지 않아 I... 노드가 삭제됨
 * - ArraySlot이 visible: false INSTANCE를 잘못 포함하여 감지
 */
describe("Popup 중첩 의존성 렌더링", () => {
  const popupFixturePath = path.join(__dirname, "../fixtures/any/Popup.json");

  it("Popup: Popupbottom 의존 컴포넌트가 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Popupbottom 컴포넌트가 생성되어야 함
    expect(result).toContain("function Popupbottom");
  });

  it("Popup: Popupbottom에 Large 버튼이 렌더링됨 (children만 있으면 안됨)", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Popupbottom 함수 추출
    const popupbottomMatch = result?.match(
      /function Popupbottom[\s\S]*?return[\s\S]*?(?=\nfunction\s|\nexport\s|$)/
    );

    expect(popupbottomMatch).not.toBeNull();

    if (popupbottomMatch) {
      const popupbottomCode = popupbottomMatch[0];

      // Large 컴포넌트가 렌더링되어야 함 (버튼)
      expect(popupbottomCode).toMatch(/<Large/);

      // {children}만 있으면 안됨 - 실제 컴포넌트가 렌더링되어야 함
      // (이전 버그: Popupbottom이 {children}만 렌더링하고 Large 버튼을 렌더링하지 않음)
      expect(popupbottomCode).not.toMatch(
        /return\s*\(\s*<PopupbottomCss[^>]*>\s*\{children\}\s*<\/PopupbottomCss>\s*\)/
      );
    }
  });

  it("Popup: Large 버튼 컴포넌트가 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Large 컴포넌트가 생성되어야 함
    expect(result).toContain("function Large");
  });

  it("Popup: 버튼 텍스트가 렌더링됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Log out 텍스트가 렌더링되어야 함 (버튼 내부 텍스트)
    expect(result).toContain("Log out");
  });

  it("Popup: ArraySlot이 visible: false INSTANCE를 잘못 포함하지 않음", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Left Button + Right Button이 ArraySlot으로 잘못 감지되지 않아야 함
    // (Left Button은 visible: false이므로 ArraySlot 조건에서 제외되어야 함)
    // Item이라는 이름의 컴포넌트가 생성되면 안됨 (ArraySlot 잘못 감지 시 생성됨)
    expect(result).not.toMatch(/function Item\(/);
    expect(result).not.toMatch(/\.map\(\s*\(\s*item\s*\)/);
  });

  it("Popup: 모든 주요 의존 컴포넌트가 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 주요 의존 컴포넌트들이 생성되어야 함
    const expectedComponents = [
      "Popuptop",
      "Popupbottom",
      "Large",
    ];

    for (const comp of expectedComponents) {
      expect(result).toContain(`function ${comp}`);
    }
  });

  it("Popup: Popupbottom이 I... 노드를 올바르게 유지함", async () => {
    const fixture = JSON.parse(fs.readFileSync(popupFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Popupbottom 함수 추출
    const popupbottomMatch = result?.match(
      /function Popupbottom[\s\S]*?return[\s\S]*?(?=\nfunction\s|\nexport\s|$)/
    );

    expect(popupbottomMatch).not.toBeNull();

    if (popupbottomMatch) {
      const popupbottomCode = popupbottomMatch[0];

      // css={...Css} 스타일이 사용되어야 함 (실제 콘텐츠가 있다는 증거)
      expect(popupbottomCode).toMatch(/css=\{.*Css\}/);

      // RightButton 또는 Button 같은 실제 요소가 렌더링되어야 함
      expect(popupbottomCode).toMatch(/RightButtonCss|ButtonCss/);

      // Large 컴포넌트가 내부에 렌더링되어야 함
      expect(popupbottomCode).toContain("<Large");
    }
  });
});
