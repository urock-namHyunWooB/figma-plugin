import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import urockButton from "../fixtures/button/urockButton.json";
import { writeFileSync } from "fs";

describe("Visibility Deep Validation", () => {
  it("should create detailed visibility tree for taptapButton", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(taptapButton as any);

    const extractVisibility = (node: any, depth = 0): any => {
      return {
        name: node.name,
        type: node.type,
        depth,
        visibleCondition: node.visibleCondition,
        mergedNodesCount: node.mergedNodes?.length,
        children: node.children?.map((child: any) =>
          extractVisibility(child, depth + 1)
        ),
      };
    };

    const tree = extractVisibility(uiTree.root);

    writeFileSync(
      "test/tree-builder/visibility-tree-taptap.json",
      JSON.stringify(tree, null, 2)
    );

    console.log("Full visibility tree saved");

    // Frame 안의 Icon들 확인
    if (uiTree.root.type === "container") {
      const frame = uiTree.root.children.find(
        (c) => c.name === "Frame 427318163"
      );
      if (frame && frame.type === "container") {
        console.log("Frame children count:", frame.children.length);
        frame.children.forEach((child: any) => {
          console.log(
            `- ${child.name}: ${child.visibleCondition ? "HAS condition" : "NO condition"}`
          );
        });
      }
    }
  });

  it("should validate Icon node visibility in taptapButton", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(taptapButton as any);

    if (uiTree.root.type === "container") {
      const frame = uiTree.root.children.find(
        (c) => c.name === "Frame 427318163"
      );

      if (frame && frame.type === "container") {
        // Left Icon 찾기
        const leftIcon = frame.children.find((c: any) =>
          c.name.includes("Left")
        );
        if (leftIcon) {
          console.log("Left Icon condition:", leftIcon.visibleCondition);
          expect(leftIcon.visibleCondition).toBeDefined();
        }

        // Right Icon 찾기
        const rightIcon = frame.children.find((c: any) =>
          c.name.includes("Right")
        );
        if (rightIcon) {
          console.log("Right Icon condition:", rightIcon.visibleCondition);
          expect(rightIcon.visibleCondition).toBeDefined();
        }
      }
    }
  });

  it("should create detailed visibility tree for airtableButton", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(airtableButton as any);

    const extractVisibility = (node: any, depth = 0): any => {
      return {
        name: node.name,
        type: node.type,
        depth,
        visibleCondition: node.visibleCondition,
        mergedNodesCount: node.mergedNodes?.length,
        children: node.children?.map((child: any) =>
          extractVisibility(child, depth + 1)
        ),
      };
    };

    const tree = extractVisibility(uiTree.root);

    writeFileSync(
      "test/tree-builder/visibility-tree-airtable.json",
      JSON.stringify(tree, null, 2)
    );

    console.log("Airtable visibility tree saved");
  });

  it("should create detailed visibility tree for urockButton", () => {
    const dataManager = new DataManager(urockButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(urockButton as any);

    const extractVisibility = (node: any, depth = 0): any => {
      return {
        name: node.name,
        type: node.type,
        depth,
        visibleCondition: node.visibleCondition,
        mergedNodesCount: node.mergedNodes?.length,
        children: node.children?.map((child: any) =>
          extractVisibility(child, depth + 1)
        ),
      };
    };

    const tree = extractVisibility(uiTree.root);

    writeFileSync(
      "test/tree-builder/visibility-tree-urock.json",
      JSON.stringify(tree, null, 2)
    );

    console.log("Urock visibility tree saved");
  });

  it("should handle nested visibility conditions correctly", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(taptapButton as any);

    // 모든 노드를 순회하면서 visibleCondition 수집
    const collectConditions = (
      node: any,
      path: string = ""
    ): Array<{ path: string; condition: any }> => {
      const currentPath = path ? `${path}/${node.name}` : node.name;
      const result: Array<{ path: string; condition: any }> = [];

      if (node.visibleCondition) {
        result.push({ path: currentPath, condition: node.visibleCondition });
      }

      if (node.children) {
        for (const child of node.children) {
          result.push(...collectConditions(child, currentPath));
        }
      }

      return result;
    };

    const conditions = collectConditions(uiTree.root);

    writeFileSync(
      "test/tree-builder/visibility-all-conditions.json",
      JSON.stringify(conditions, null, 2)
    );

    console.log(`Found ${conditions.length} nodes with visibility conditions`);
    conditions.forEach(({ path, condition }) => {
      console.log(`${path}:`, JSON.stringify(condition));
    });

    expect(conditions.length).toBeGreaterThan(0);
  });

  it("should verify mergedNodes count matches visibility logic", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(airtableButton as any);

    const rootMergedCount = (uiTree.root as any).mergedNodes?.length || 0;
    console.log("Root merged nodes:", rootMergedCount);

    const checkNode = (node: any, path: string = ""): void => {
      const currentPath = path ? `${path}/${node.name}` : node.name;
      const mergedCount = node.mergedNodes?.length || 0;

      if (mergedCount > 0) {
        if (mergedCount === rootMergedCount) {
          // 모든 variant에 존재 → visibleCondition 없어야 함
          expect(node.visibleCondition).toBeUndefined();
          console.log(`✓ ${currentPath}: ${mergedCount}/${rootMergedCount} - NO condition (correct)`);
        } else {
          // 일부 variant에만 존재 → visibleCondition 있어야 함
          expect(node.visibleCondition).toBeDefined();
          console.log(`✓ ${currentPath}: ${mergedCount}/${rootMergedCount} - HAS condition (correct)`);
        }
      }

      if (node.children) {
        for (const child of node.children) {
          checkNode(child, currentPath);
        }
      }
    };

    checkNode(uiTree.root);
  });
});
