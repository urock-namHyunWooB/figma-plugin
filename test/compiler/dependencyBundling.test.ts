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

    // deps 함수가 번들에 포함됨 (Iconsicons는 slot 승격으로 dependency에서 제외)
    expect(code).toMatch(/function\s+Circularcircular\s*\(/);
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

  it("import 모드: dependency 코드 없이 import 문만 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
    const gen = new FigmaCodeGenerator(fixture, {
      styleStrategy: { type: "tailwind" },
      dependencyMode: "import",
      importBasePath: "@/components/",
    });
    const code = await gen.compile();

    // dependency 함수가 인라인되지 않음 (Iconsicons는 slot 승격으로 dependency에서 제외)
    expect(code).not.toMatch(/function\s+Circularcircular\s*\(/);

    // import 문이 생성됨
    expect(code).toContain("import { Circularcircular }");
    expect(code).toContain("@/components/");
  });

  it("import 모드 + 상대경로: ./ prefix로 import 생성됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
    const gen = new FigmaCodeGenerator(fixture, {
      styleStrategy: { type: "tailwind" },
      dependencyMode: "import",
      importBasePath: "./",
    });
    const code = await gen.compile();

    // Iconsicons는 slot 승격으로 dependency에서 제외
    expect(code).toContain('from "./Circularcircular"');
  });

  it("bundle 모드 (기본): 기존 동작 유지", async () => {
    const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
    const gen = new FigmaCodeGenerator(fixture, {
      styleStrategy: { type: "tailwind" },
    });
    const code = await gen.compile();

    // dependency가 인라인 번들됨
    expect(code).toMatch(/function\s+Circularcircular\s*\(/);
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
