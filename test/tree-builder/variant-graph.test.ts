import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "@frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";

describe("TreeBuilder - Variant Graph", () => {
  it("should build UITree from COMPONENT_SET", () => {
    const generator = new FigmaCodeGenerator(airtableButton as any);
    const { main, dependencies } = generator.buildUITree();

    // UITree가 생성되었는지 확인
    expect(main).toBeDefined();
    expect(main.root).toBeDefined();
    expect(main.props).toBeDefined();

    // 루트 노드 확인
    console.log("Root node:", JSON.stringify(main.root, null, 2).substring(0, 500));
    console.log("Props:", main.props);
  });

  it("should merge variants successfully", () => {
    const generator = new FigmaCodeGenerator(airtableButton as any);
    const { main } = generator.buildUITree();

    // variant 병합 결과 확인
    // COMPONENT_SET의 children들이 병합되어야 함
    const rootNode = main.root as any;

    console.log("Root node type:", rootNode.type);
    console.log("Children count:", rootNode.children?.length);

    // UITree가 생성되었고, children이 있어야 함
    expect(rootNode.type).toBe("container");
    expect(rootNode.children).toBeDefined();

    // airtable-button은 Label을 가지고 있어야 함
    const hasLabel = rootNode.children.some((child: any) =>
      child.name === "Label"
    );
    expect(hasLabel).toBe(true);
  });

  it("should have correct tree structure", () => {
    const generator = new FigmaCodeGenerator(airtableButton as any);
    const { main } = generator.buildUITree();

    // 트리 구조 확인
    expect(main.root.name).toBe("Button"); // COMPONENT_SET 이름
    expect(main.root.children).toBeDefined();

    console.log("Tree structure:", {
      name: main.root.name,
      type: main.root.type,
      childrenCount: main.root.children?.length || 0,
    });
  });

  it("should merge variants correctly - InternalTree inspection", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const internalTree = treeBuilder.buildInternalTreeDebug(airtableButton as any);

    // InternalTree 구조 확인
    console.log("\n=== InternalTree Inspection ===");
    console.log("Root name:", internalTree.name);
    console.log("Root type:", internalTree.type);
    console.log("Root id:", internalTree.id);
    console.log("Merged nodes count:", internalTree.mergedNodes?.length);
    console.log("Children count:", internalTree.children.length);

    // 각 child의 mergedNodes 확인
    internalTree.children.forEach((child, idx) => {
      console.log(`\nChild ${idx} - ${child.name}:`);
      console.log("  Type:", child.type);
      console.log("  Merged nodes:", child.mergedNodes?.length);
      console.log("  Variant names:", child.mergedNodes?.map(m => m.variantName).slice(0, 3));
    });

    // COMPONENT_SET은 여러 variant를 가지므로
    expect(internalTree.name).toBe("Button");
    expect(internalTree.mergedNodes).toBeDefined();
    expect(internalTree.mergedNodes!.length).toBeGreaterThan(1);

    // airtable-button은 3개 prop (Size, Variant, Icon)
    // Size: 3, Variant: 4, Icon: 2 → 3*4*2 = 24 variants
    // 모든 variant가 병합되어야 함
    const allVariants = airtableButton.info.document.children || [];
    console.log("\nTotal variants in fixture:", allVariants.length);
    console.log("Merged nodes in tree:", internalTree.mergedNodes!.length);

    // mergedNodes에 모든 variant가 포함되어야 함
    expect(internalTree.mergedNodes!.length).toBe(allVariants.length);
  });
});
