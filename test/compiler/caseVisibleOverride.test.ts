import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCompiler from "@compiler/FigmaCompiler";

describe("Case.json visible override 이슈", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/any/Case.json"
  );

  it("should generate showInteraction prop for Large dependency", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCompiler(fixtureData);
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

  it("should pass showInteraction={true} for Pressed button", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCompiler(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // 메인 코드 확인
    const mainCode = result.mainComponent.code;

    // Pressed 버튼 (decorateInteractiveBg prop이 있는 Large)에 showInteraction={true} 확인
    expect(mainCode).toContain("showInteraction={true}");
  });

  it("should apply correct styles to Large dependency (width: 343px, position: relative)", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCompiler(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    const deps = result.dependencies || {};
    let largeCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      if (dep.code.includes("function Large")) {
        largeCode = dep.code;
      }
    }

    // InteractionCss width: 343px (hasHiddenChildren일 때 styleTree 병합 확인)
    expect(largeCode).toMatch(/width:\s*343px/);

    // Large 컴포넌트에 position: relative (absolute 자식이 있을 때)
    expect(largeCode).toMatch(/position:\s*relative/);
  });

  it("should apply transparent background to Decorateinteractive", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCompiler(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    const deps = result.dependencies || {};
    let largeCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      if (dep.code.includes("function Large")) {
        largeCode = dep.code;
      }
    }

    // Decorateinteractive에 background: transparent (makeRootFlexible 확인)
    expect(largeCode).toMatch(/background:\s*transparent/);
  });

  it("should apply correct opacity: 0.24 to DecorateInteractive", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCompiler(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    const deps = result.dependencies || {};
    let largeCode = "";
    for (const [key, dep] of Object.entries(deps)) {
      if (dep.code.includes("function Large")) {
        largeCode = dep.code;
      }
    }

    // DecorateInteractiveCss opacity: 0.24 (0.08이 아님)
    expect(largeCode).toMatch(/opacity:\s*0\.24/);
  });
});
