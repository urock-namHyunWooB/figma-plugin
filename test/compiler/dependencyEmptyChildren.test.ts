import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";
import type { FigmaNodeData } from "@code-generator2";

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
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Colorgnbhomen 컴포넌트에 실제 children이 렌더링되어야 함 (v2는 arrow function)
    expect(result).toContain("Colorgnbhomen:");

    // RatioVertical, ColorBlank 등 자식 요소가 있어야 함
    // 변수명 단축 전략: 마지막 3개 노드의 마지막 단어 사용
    expect(result).toMatch(/verticalCss|blankCss/i);

    // children prop만 렌더링되면 안됨 (실제 콘텐츠가 있어야 함)
    const colorgnbhomenMatch = result?.match(
      /const Colorgnbhomen[\s\S]*?return[\s\S]*?<\/div>[\s\S]*?;[\s\S]*?\}/
    );
    if (colorgnbhomenMatch) {
      // SVG 또는 다른 실제 요소가 포함되어야 함
      expect(colorgnbhomenMatch[0]).toMatch(/<svg|<div css=/);
    }
  });

  it("error-02: 원래 children이 있으면 I... 노드 삭제", async () => {
    const fixture = JSON.parse(fs.readFileSync(error02FixturePath, "utf-8")) as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });

    // compile() 번들에서는 filterReferencedDependencies가 미참조 dep을 제거하므로
    // MonoResponsive가 번들에 포함되지 않을 수 있음.
    // generate() 레벨에서 dep 코드를 직접 검증한다.
    const generated = await compiler.generate();

    // Main 컴포넌트에서 I... 노드로 인한 ColorCss는 생성되면 안됨
    expect(generated.main.code).not.toContain("globalMonoResponsiveColorCss");

    // MonoResponsive dep은 generate() 레벨에서 올바르게 컴파일되어야 함
    const depCodes = [...generated.dependencies.values()].map((d) => d.code);
    const monoCode = depCodes.find(
      (d) => d.includes("MonoResponsiveProps") || d.includes("function MonoResponsive")
    );
    if (monoCode) {
      // I... 노드가 삭제되어 정당한 Color 노드에서 responsiveColorCss가 생성됨
      expect(monoCode).toContain("responsiveColorCss");
      expect(monoCode).not.toContain("globalMonoResponsiveColorCss");
    }
  });

  it("Gnb: 아이콘 요소가 SVG로 렌더링됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 아이콘 요소의 CSS가 생성되어야 함
    // 변수명 단축 전략으로 인해 BlankCss 같은 짧은 이름이 됨
    expect(result).toMatch(/blankCss|BlankCss/i);

    // vectorSvgs가 전달되어 SVG로 렌더링됨
    expect(result).toContain("<svg");
  });

  it("Gnb: 의존 컴포넌트들이 정상 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 주요 의존 컴포넌트들이 생성되어야 함
    const expectedComponents = [
      "Colorgnbhomen",
      "Colorgnbstationn",
      "Colorgnbwalletn",
      "Colorgnbsettingn",
    ];

    for (const comp of expectedComponents) {
      // v2는 arrow function 사용 (const Comp: function declaration)
      expect(result).toContain(`${comp}:`);
    }
  });
});
