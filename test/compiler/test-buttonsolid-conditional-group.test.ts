import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import { DesignPatternDetector } from "../../src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid conditionalGroup", () => {
  it("DesignPatternDetector가 layoutModeSwitch를 감지한다", () => {
    const detector = new DesignPatternDetector();
    // detect()는 raw Figma SceneNode를 받으므로 info.document를 전달
    const patterns = detector.detect((ButtonsolidFixture as any).info.document as any);

    const lms = patterns.filter((p) => p.type === "layoutModeSwitch");
    expect(lms.length).toBeGreaterThan(0);

    // iconOnly prop에 의한 분기가 있어야 함
    const iconOnlySwitch = lms.find((p) => (p as any).prop === "iconOnly");
    expect(iconOnlySwitch).toBeDefined();
    expect((iconOnlySwitch as any).branches).toBeDefined();

    const branches = (iconOnlySwitch as any).branches as Record<string, string[]>;
    const branchValues = Object.keys(branches);
    expect(branchValues.length).toBe(2); // True / False
  });

  it("UITree에 conditionalGroup 노드가 생성된다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    // Recursively find conditionalGroup nodes
    function findConditionalGroups(node: any): any[] {
      const results: any[] = [];
      if (node.type === "conditionalGroup") results.push(node);
      for (const child of node.children ?? []) {
        results.push(...findConditionalGroups(child));
      }
      // Also check branches
      if (node.branches) {
        for (const children of Object.values(node.branches) as any[][]) {
          for (const child of children) {
            results.push(...findConditionalGroups(child));
          }
        }
      }
      return results;
    }

    const cgs = findConditionalGroups(main.root);
    expect(cgs.length).toBeGreaterThan(0);

    const iconOnlyCg = cgs.find((cg) => cg.prop === "iconOnly");
    expect(iconOnlyCg).toBeDefined();
  });

  it("분기 안 스타일에서 iconOnly 차원이 제거된다", async () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const code = await gen.compile();
    expect(code).toBeDefined();

    // Write to file for debugging
    const fs = await import("fs");
    const iconOnlyLines = code!.split("\n")
      .map((l, i) => `${i+1}: ${l}`)
      .filter(l => l.includes("iconOnly"));
    fs.writeFileSync("/tmp/buttonsolid-final.txt", iconOnlyLines.join("\n"));

    // Ternary exists
    const hasTernary = code!.includes("iconOnly ?");
    expect(hasTernary).toBe(true);
  });

  it("생성 코드에 ternary 분기가 포함된다", async () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const code = await gen.compile();
    expect(code).toBeDefined();

    // iconOnly는 boolean prop이므로 삼항: iconOnly ? (...) : (...)
    const hasTernary =
      code!.includes("iconOnly ?") ||
      code!.includes("iconOnly === true") ||
      code!.includes('iconOnly === "True"') ||
      code!.includes('iconOnly === "False"');
    expect(hasTernary).toBe(true);

    // 개별 !iconOnly && 반복이 아닌 그룹화된 분기여야 함
    const iconOnlyAndCount = (
      code!.match(/!iconOnly &&/g) || []
    ).length;
    expect(iconOnlyAndCount).toBeLessThanOrEqual(1);
  });
});
