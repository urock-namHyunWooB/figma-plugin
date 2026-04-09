import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import FigmaCodeGenerator from "@code-generator2";
import buttonsolid from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid Interaction layer strip", () => {
  it("merged tree contains zero Interaction-named FRAME nodes", () => {
    const dm = new DataManager(buttonsolid as any);
    const tb = new TreeBuilder(dm);
    const tree = tb.buildInternalTreeDebug((buttonsolid as any).info.document);

    let interactionFrameCount = 0;
    const walk = (n: any) => {
      if (n?.name === "Interaction" && n?.type === "FRAME") {
        interactionFrameCount++;
      }
      for (const c of n?.children ?? []) walk(c);
    };
    walk(tree);
    expect(interactionFrameCount).toBe(0);
  });

  it("compiled React code has no solidInteractionCss CSS variables", async () => {
    const compiler = new FigmaCodeGenerator(buttonsolid as any);
    const code = await compiler.compile();
    expect(code).not.toBeNull();
    // Interaction 관련 CSS 변수가 0개여야 함 (이전엔 solidInteractionCss, solidInteractionLoadingCss 등 4-5개)
    const interactionCssMatches = code!.match(/solidInteraction\w*Css/g) ?? [];
    expect(interactionCssMatches.length).toBe(0);
  }, 60_000);

  it("compiled code is shorter than 21845 chars (pre-strip baseline)", async () => {
    const compiler = new FigmaCodeGenerator(buttonsolid as any);
    const code = await compiler.compile();
    expect(code).not.toBeNull();
    // Pre-strip baseline: ~21845 chars (관찰값). Strip 후 적어도 10% 줄어야 함.
    expect(code!.length).toBeLessThan(21845 * 0.9);
  }, 60_000);
});
