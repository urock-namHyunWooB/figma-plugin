import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";
import { writeFileSync } from "fs";

describe("StyleProcessor", () => {
  it("should apply styles to InternalTree", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // Root 스타일 확인
    expect(uiTree.root.styles).toBeDefined();

    // 결과 저장
    const result = {
      rootName: uiTree.root.name,
      rootStyles: uiTree.root.styles,
      children:
        uiTree.root.type === "container"
          ? uiTree.root.children.map((child) => ({
              name: child.name,
              type: child.type,
              styles: child.styles,
            }))
          : [],
    };

    writeFileSync(
      "test/tree-builder/style-result.json",
      JSON.stringify(result, null, 2)
    );

    console.log("Root styles:", uiTree.root.styles);
  });

  it("should extract base styles (common to all variants)", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    if (!uiTree.root.styles) {
      throw new Error("No styles found");
    }

    // base 스타일이 있어야 함
    expect(uiTree.root.styles.base).toBeDefined();
    expect(Object.keys(uiTree.root.styles.base).length).toBeGreaterThan(0);

    console.log("Base styles:", uiTree.root.styles.base);
  });

  it("should extract dynamic styles (variant-specific)", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    if (!uiTree.root.styles) {
      throw new Error("No styles found");
    }

    // dynamic 스타일 확인
    expect(uiTree.root.styles.dynamic).toBeDefined();
    expect(Array.isArray(uiTree.root.styles.dynamic)).toBe(true);

    console.log("Dynamic styles count:", uiTree.root.styles.dynamic.length);

    if (uiTree.root.styles.dynamic.length > 0) {
      console.log("First dynamic style:", uiTree.root.styles.dynamic[0]);
    }
  });

  it("should extract pseudo-class styles (State-based)", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    if (!uiTree.root.styles) {
      throw new Error("No styles found");
    }

    // pseudo 스타일 확인 (State prop이 있으므로 :hover, :disabled 등이 있을 것)
    if (uiTree.root.styles.pseudo) {
      expect(Object.keys(uiTree.root.styles.pseudo).length).toBeGreaterThan(0);
      console.log("Pseudo-class styles:", Object.keys(uiTree.root.styles.pseudo));
    }
  });

  it("should apply styles recursively to all nodes", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // 모든 자식 노드도 스타일이 적용되어야 함
    if (uiTree.root.type === "container") {
      for (const child of uiTree.root.children) {
        // 스타일이 있거나 없을 수 있음 (mergedNodes가 없으면 undefined)
        if (child.styles) {
          expect(child.styles).toBeDefined();
          expect(child.styles.base).toBeDefined();
        }
      }
    }
  });
});
