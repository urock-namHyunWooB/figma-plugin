import { describe, it, expect } from "vitest";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";
import fs from "fs";
import path from "path";

/**
 * 의존 컴포넌트 children이 비어있을 때 I... 노드 유지 테스트
 *
 * Gnb.json 케이스:
 * - dependencies의 info.document.children이 비어있음
 * - enrichVariantWithInstanceChildren으로 INSTANCE children 주입
 * - 주입된 children의 ID가 I... 형태 (3+ segments)
 * - 이 경우 I... 노드를 삭제하면 안됨 (실제 콘텐츠)
 *
 * error-02.json 케이스:
 * - dependencies의 info.document.children이 이미 존재
 * - enrichment가 발생해도 I... 노드는 삭제되어야 함
 */
describe("의존 컴포넌트 children 처리", () => {
  const gnbFixturePath = path.join(__dirname, "../fixtures/any/Gnb.json");
  const error02FixturePath = path.join(
    __dirname,
    "../fixtures/any/error-02.json"
  );

  it("Gnb: 원래 children이 비어있으면 I... 노드 유지", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Colorgnbhomen 컴포넌트에 실제 children이 렌더링되어야 함
    expect(result).toContain("function Colorgnbhomen");

    // RatioVertical, ColorBlank 등 자식 요소가 있어야 함
    expect(result).toMatch(/RatioVerticalCss|ColorBlankCss/);

    // children prop만 렌더링되면 안됨 (실제 콘텐츠가 있어야 함)
    const colorgnbhomenMatch = result?.match(
      /function Colorgnbhomen[\s\S]*?return[\s\S]*?<\/div>[\s\S]*?;[\s\S]*?\}/
    );
    if (colorgnbhomenMatch) {
      // SVG 또는 다른 실제 요소가 포함되어야 함
      expect(colorgnbhomenMatch[0]).toMatch(/<svg|<div css=/);
    }
  });

  it("error-02: 원래 children이 있으면 I... 노드 삭제", async () => {
    const fixture = JSON.parse(fs.readFileSync(error02FixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // MonoResponsive 컴포넌트에서 ColorCss가 생성되면 안됨
    // (I...로 시작하는 Color 노드가 삭제되어야 함)
    expect(result).not.toContain("ColorCss");
  });

  it("Gnb: 아이콘 요소가 SVG로 렌더링됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Rectangle CSS가 생성되어야 함 (아이콘 요소)
    expect(result).toMatch(/Rectangle\d+Css/);

    // vectorSvgs가 전달되어 SVG로 렌더링됨
    expect(result).toContain("<svg");
  });

  it("Gnb: 의존 컴포넌트들이 정상 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 주요 의존 컴포넌트들이 생성되어야 함
    const expectedComponents = [
      "Colorgnbhomen",
      "Colorgnbstationn",
      "Colorgnbwalletn",
      "Colorgnbsettingn",
    ];

    for (const comp of expectedComponents) {
      expect(result).toContain(`function ${comp}`);
    }
  });
});
