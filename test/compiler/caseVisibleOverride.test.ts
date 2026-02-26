import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Case.json visible override 이슈", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/any/Case.json"
  );

  it("should generate showInteraction prop for Large dependency", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // Large dependency에 showInteraction prop이 있어야 함
    const deps = result.dependencies || {};
    let largeCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      if (dep.code.includes("function Large")) {
        largeCode = dep.code;
      }
    }

    // Large dependency에 showInteraction props가 있어야 함
    expect(largeCode).toContain("showInteraction");
    expect(largeCode).toMatch(/showInteraction\?:\s*boolean/);
  });

  it("should not pass showInteraction when visible is not overridden", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // 메인 코드 확인 (v2 형식)
    const mainCode = result.mainCode;

    // fixture에서 Interaction 노드의 visible override가 없으므로
    // showInteraction prop이 전달되지 않아야 함
    // (opacity override만 있음: decorateInteractiveOpacity)
    expect(mainCode).not.toContain("showInteraction={true}");
    expect(mainCode).toContain("decorateInteractiveOpacity");
  });

  it("should apply correct styles to Large dependency (position: relative)", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    const deps = result.dependencies || {};
    let largeCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      if (dep.code.includes("function Large")) {
        largeCode = dep.code;
      }
    }

    // Large 컴포넌트에 position: relative (absolute 자식이 있을 때)
    expect(largeCode).toMatch(/position:\s*relative/);

    // Interaction 노드 CSS가 존재해야 함
    expect(largeCode).toMatch(/InteractionCss/i);

    // TODO: hidden variant 노드의 width 스타일 병합 구현 후 활성화
    // expect(largeCode).toMatch(/width:\s*343px/);
  });

  it("should apply transparent background to Decorateinteractive", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // v2: Decorateinteractive는 별도 dependency로 분리됨
    const deps = result.dependencies || {};
    let diCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      // 변수명 단축 전략으로 인해 interactiveCss가 됨
      if (dep.code.includes("Decorateinteractive") && dep.code.includes("interactiveCss")) {
        diCode = dep.code;
      }
    }

    // Decorateinteractive에 background: transparent (makeRootFlexible 확인)
    expect(diCode).toMatch(/background:\s*transparent/);
  });

  it("should apply decorateInteractiveOpacity prop to Large dependency", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    const deps = result.dependencies || {};
    let largeCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      if (dep.code.includes("function Large")) {
        largeCode = dep.code;
      }
    }

    // decorateInteractiveOpacity prop이 존재해야 함 (wrapper에서 opacity 제어)
    expect(largeCode).toMatch(/decorateInteractiveOpacity/);
    // prop의 기본값이 설정됨 (Figma 원본: ~0.08)
    expect(largeCode).toMatch(/decorateInteractiveOpacity\s*=\s*"0\.0[78]/);
    // CSS에도 opacity 값이 있어야 함
    expect(largeCode).toMatch(/opacity:\s*0\.08/);
  });
});
