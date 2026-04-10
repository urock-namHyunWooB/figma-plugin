import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Dependency 번들링 회귀 테스트
 *
 * 수정된 이슈 3가지:
 * 1. InteractionLayerStripper가 제거한 INSTANCE의 dependency가 dead code로 남던 문제
 * 2. ReactBundler.filterReferencedDependencies가 same-name dep을 false positive로 포함하던 문제
 * 3. ReactEmitter.emit()이 componentName override를 deps에도 적용해 번들링이 깨지던 문제
 */
describe("Dependency 번들링", () => {
  const buttonsolidPath = path.join(
    __dirname,
    "../fixtures/failing/Buttonsolid.json"
  );

  it("componentName override가 있어도 deps는 자기 이름을 유지하고 번들됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
    const gen = new FigmaCodeGenerator(fixture, {
      styleStrategy: { type: "tailwind" },
      naming: { componentName: "Buttonsolid" },
    });
    const code = await gen.compile();

    // deps가 외부 import가 아닌 inline으로 번들됨
    const externalImports = code!
      .split("\n")
      .filter((l) => l.includes('from "./'));
    expect(externalImports).toEqual([]);

    // deps 함수가 번들에 포함됨
    expect(code).toMatch(/function\s+Circularcircular\s*\(/);
    expect(code).toMatch(/function\s+Iconsicons\s*\(/);
  });

  it("same-name dependency가 dead code로 남지 않음", async () => {
    const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
    const gen = new FigmaCodeGenerator(fixture, {
      styleStrategy: { type: "tailwind" },
      naming: { componentName: "Buttonsolid" },
    });
    const code = await gen.compile();

    // _Buttonsolid 같은 renamed dead code가 없어야 함
    expect(code).not.toMatch(/function\s+_Buttonsolid\s*\(/);
    expect(code).not.toContain("_ButtonsolidProps");
  });

  it("Interaction layer dependency가 제거됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
    const gen = new FigmaCodeGenerator(fixture, {
      styleStrategy: { type: "emotion" },
    });
    const result = await gen.generate();

    // Interaction/Strong, Interaction/Normal dependency가 없어야 함
    const depNames = [...result.dependencies.values()].map(
      (d) => d.componentName
    );
    expect(depNames).not.toContain("Interactionstrong");
    expect(depNames).not.toContain("Interactionnormal");
  });
});
