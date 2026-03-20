import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import ButtonFixture from "../fixtures/button/Button.json";

describe("Button (airtable) Tailwind lint", () => {
  it("gap은 size 단독으로 할당되어야 한다", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any);
    const { main } = gen.buildUITree();

    const rootDynamic = (main.root as any).styles?.dynamic || [];
    const gapEntries = rootDynamic.filter((d: any) => "gap" in d.style);

    // gap이 size 단독으로 할당됨 (icon과 compound 아님)
    const hasIconCondition = gapEntries.some((d: any) =>
      JSON.stringify(d.condition).includes('"icon"')
    );
    expect(hasIconCondition).toBe(false);

    // size 조건만 있어야 함
    const hasSizeCondition = gapEntries.some((d: any) =>
      JSON.stringify(d.condition).includes('"size"')
    );
    expect(hasSizeCondition).toBe(true);
  });

  it("near-zero rotation은 제거되어야 한다", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any);
    const { main } = gen.buildUITree();

    const label = (main.root as any).children?.find((c: any) => c.name === "Label");
    const allTransforms = [
      label?.styles?.base?.transform,
      ...(label?.styles?.dynamic || []).map((d: any) => d.style.transform),
    ].filter(Boolean);

    expect(allTransforms).toHaveLength(0);
  });

  it("icon slot wrapper는 span이어야 한다 (인라인 요소)", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any, { styleStrategy: "emotion" });
    const result = await gen.compileWithDiagnostics();

    // icon wrapper가 <span>이어야 함 (div 아님)
    // 멀티라인 JSX이므로 dotAll 플래그 사용
    expect(result.code).toMatch(/<span[\s\S]*?>\s*\{icon\}\s*<\/span>/);
    expect(result.code).not.toMatch(/<div[\s\S]*?>\s*\{icon\}\s*<\/div>/);
  });

  it("Tailwind CVA 출력이 올바르게 생성되어야 한다", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any, { styleStrategy: "tailwind" });
    const result = await gen.compileWithDiagnostics();

    expect(result.code).toBeTruthy();
    // near-zero rotate 없어야 함
    expect(result.code).not.toMatch(/rotate\(\d/);
  });
});
