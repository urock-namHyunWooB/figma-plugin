import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import ButtonFixture from "../fixtures/button/Button.json";

describe("Button (airtable) Tailwind lint", () => {
  it("gap은 size 단독 조건이어야 한다 (slot prop compound 금지)", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any);
    const { main } = gen.buildUITree();

    const rootDynamic = (main.root as any).styles?.dynamic || [];
    const gapEntries = rootDynamic.filter((d: any) => "gap" in d.style);

    // icon이 포함된 compound 조건이 없어야 함
    const hasIconCondition = gapEntries.some((d: any) =>
      JSON.stringify(d.condition).includes('"icon"')
    );
    expect(hasIconCondition).toBe(false);
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

  it("Tailwind CVA 출력에 size 중복이나 icon 혼입이 없어야 한다", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any, { styleStrategy: "tailwind" });
    const result = await gen.compileWithDiagnostics();

    expect(result.code).toBeTruthy();
    // size 중복 없어야 함
    expect(result.code).not.toMatch(/\{ size,.*size[,\s}]/);
    // icon이 CVA 호출에 없어야 함
    expect(result.code).not.toMatch(/Classes\(\{[^}]*\bicon\b/);
    // near-zero rotate 없어야 함
    expect(result.code).not.toMatch(/rotate\(\d/);
  });
});
