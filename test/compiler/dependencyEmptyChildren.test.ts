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

  it("Gnb: dependency 컴포넌트가 참조로 렌더링됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Colorgnbhomen 컴포넌트 정의가 존재해야 함 (function declaration - default)
    expect(result).toMatch(/function\s+Colorgnbhomen\s*\(/);

    // 메인 컴포넌트에서 <Colorgnbhomen /> 참조로 렌더링되어야 함
    expect(result).toContain("<Colorgnbhomen");

    // component 노드의 children CSS가 메인에 orphaned로 생성되면 안됨
    // (dependency 내부 구현은 dependency 자체 코드에서 처리)
    const generated = await compiler.generate();
    const mainCode = generated.main.code;
    // 메인 코드에 dependency 내부 노드의 CSS가 없어야 함
    expect(mainCode).not.toMatch(/verticalCss|blankCss/i);
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
      // Color 노드는 ABSOLUTE 풀커버 RECTANGLE이므로 부모에 background로 흡수됨
      // responsiveColorCss 대신 부모의 responsiveCss에 background가 포함됨
      expect(monoCode).toContain("background");
      expect(monoCode).not.toContain("globalMonoResponsiveColorCss");
    }
  });

  it("Gnb: SVG 벡터 dependency는 generate()에서 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(gnbFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.generate();

    // SVG는 같은 이름("Gnb") dependency에 포함되어 있지만,
    // 메인/다른 deps가 JSX 태그로 참조하지 않으므로 bundle에서는 제외됨.
    // generate() 레벨에서 dependency가 올바르게 생성되는지만 검증.
    const gnbDep = [...result.dependencies.values()].find(
      (d) => d.componentName === "Gnb" && d.code.includes("<svg")
    );
    expect(gnbDep).toBeDefined();
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
      // default는 function declaration
      expect(result).toMatch(new RegExp(`function\\s+${comp}\\s*\\(`));
    }
  });
});
