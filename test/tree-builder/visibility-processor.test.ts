import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import taptapButton from "../fixtures/button/taptapButton.json";
import { writeFileSync } from "fs";

describe("VisibilityProcessor", () => {
  it("should apply visibility conditions to nodes", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // 결과 저장
    const result = {
      rootName: uiTree.root.name,
      rootVisibleCondition: uiTree.root.visibleCondition,
      children:
        uiTree.root.type === "container"
          ? uiTree.root.children.map((child) => ({
              name: child.name,
              type: child.type,
              visibleCondition: child.visibleCondition,
            }))
          : [],
    };

    writeFileSync(
      "test/tree-builder/visibility-result.json",
      JSON.stringify(result, null, 2)
    );

    console.log("Visibility result:", result);
  });

  it("should not add visibleCondition to nodes that exist in all variants", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // 루트는 모든 variant에 존재하므로 visibleCondition이 없어야 함
    expect(uiTree.root.visibleCondition).toBeUndefined();

    // Label은 모든 variant에 존재하므로 visibleCondition이 없어야 함
    if (uiTree.root.type === "container") {
      const labelNode = uiTree.root.children.find((c) => c.name === "Label");
      expect(labelNode).toBeDefined();
      expect(labelNode?.visibleCondition).toBeUndefined();
    }
  });

  it("should add visibleCondition to nodes that exist only in some variants", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // Icon은 Icon=true인 variant에만 존재하므로 visibleCondition이 있어야 함
    if (uiTree.root.type === "container") {
      const iconNode = uiTree.root.children.find((c) => c.name === "Icon");
      expect(iconNode).toBeDefined();
      expect(iconNode?.visibleCondition).toBeDefined();

      console.log("Icon visibleCondition:", iconNode?.visibleCondition);

      // Icon=true 조건이어야 함
      if (iconNode?.visibleCondition) {
        expect(iconNode.visibleCondition.type).toBe("truthy");
        if (iconNode.visibleCondition.type === "truthy") {
          expect(iconNode.visibleCondition.prop).toBe("icon");
        }
      }
    }
  });

  it("should handle taptapButton visibility", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    const result = {
      rootName: uiTree.root.name,
      children:
        uiTree.root.type === "container"
          ? uiTree.root.children.map((child) => ({
              name: child.name,
              type: child.type,
              visibleCondition: child.visibleCondition,
            }))
          : [],
    };

    writeFileSync(
      "test/tree-builder/visibility-taptap.json",
      JSON.stringify(result, null, 2)
    );

    console.log("TaptapButton visibility:", result);
  });

  it("should exclude State/states from visibility conditions", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // 모든 노드의 visibleCondition을 확인
    const checkNoStateProp = (node: any): void => {
      if (node.visibleCondition) {
        const conditionStr = JSON.stringify(node.visibleCondition);
        expect(conditionStr.toLowerCase()).not.toContain('"state"');
        expect(conditionStr.toLowerCase()).not.toContain('"states"');
      }

      if (node.children) {
        node.children.forEach(checkNoStateProp);
      }
    };

    checkNoStateProp(uiTree.root);
  });

  it("should create correct condition nodes for visibility", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    if (uiTree.root.type === "container") {
      const iconNode = uiTree.root.children.find((c) => c.name === "Icon");

      if (iconNode?.visibleCondition) {
        console.log(
          "Icon visibleCondition:",
          JSON.stringify(iconNode.visibleCondition, null, 2)
        );

        // prop 이름이 camelCase인지 확인
        const checkPropName = (condition: any): void => {
          if (condition.prop) {
            expect(condition.prop).toMatch(/^[a-z][a-zA-Z0-9]*$/);
          }
          if (condition.conditions) {
            condition.conditions.forEach(checkPropName);
          }
          if (condition.condition) {
            checkPropName(condition.condition);
          }
        };

        checkPropName(iconNode.visibleCondition);
      }
    }
  });
});
