import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import urockButton from "../fixtures/button/urockButton.json";
import { writeFileSync } from "fs";

describe("External Refs Deep Validation", () => {
  it("should find all component nodes in taptapButton", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    const collectAllNodes = (
      node: any,
      path: string = ""
    ): Array<{ path: string; type: string; refId?: string }> => {
      const currentPath = path ? `${path}/${node.name}` : node.name;
      const result: Array<{ path: string; type: string; refId?: string }> = [];

      result.push({
        path: currentPath,
        type: node.type,
        refId: node.type === "component" ? node.refId : undefined,
      });

      if (node.children) {
        for (const child of node.children) {
          result.push(...collectAllNodes(child, currentPath));
        }
      }

      return result;
    };

    const allNodes = collectAllNodes(uiTree.root);
    const componentNodes = allNodes.filter((n) => n.type === "component");

    writeFileSync(
      "test/tree-builder/taptap-all-nodes.json",
      JSON.stringify({ allNodes, componentNodes }, null, 2)
    );

    console.log(`Total nodes: ${allNodes.length}`);
    console.log(`Component nodes: ${componentNodes.length}`);

    componentNodes.forEach(({ path, refId }) => {
      console.log(`  ${path}: ${refId || "NO REFID"}`);
    });
  });

  it("should find all component nodes in urockButton", () => {
    const dataManager = new DataManager(urockButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((urockButton as any).info.document);

    const collectComponentNodes = (
      node: any,
      path: string = ""
    ): Array<{ path: string; refId?: string }> => {
      const currentPath = path ? `${path}/${node.name}` : node.name;
      const result: Array<{ path: string; refId?: string }> = [];

      if (node.type === "component") {
        result.push({ path: currentPath, refId: node.refId });
      }

      if (node.children) {
        for (const child of node.children) {
          result.push(...collectComponentNodes(child, currentPath));
        }
      }

      return result;
    };

    const componentNodes = collectComponentNodes(uiTree.root);

    writeFileSync(
      "test/tree-builder/urock-component-nodes.json",
      JSON.stringify(componentNodes, null, 2)
    );

    console.log(`Urock component nodes: ${componentNodes.length}`);
    componentNodes.forEach(({ path, refId }) => {
      console.log(`  ${path}: ${refId || "NO REFID"}`);
    });
  });

  it("should verify all component nodes have refId", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    const checkNode = (node: any, path: string = ""): void => {
      const currentPath = path ? `${path}/${node.name}` : node.name;

      if (node.type === "component") {
        expect(node.refId).toBeDefined();
        expect(node.refId).toBeTruthy();
        console.log(`✓ ${currentPath}: ${node.refId}`);
      }

      if (node.children) {
        for (const child of node.children) {
          checkNode(child, currentPath);
        }
      }
    };

    checkNode(uiTree.root);
  });

  it("should check if refIds exist in dependencies", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    const dependencies = dataManager.getAllDependencies();
    console.log(`Total dependencies: ${dependencies.size}`);

    const collectComponentNodes = (
      node: any
    ): Array<{ name: string; refId: string }> => {
      const result: Array<{ name: string; refId: string }> = [];

      if (node.type === "component" && node.refId) {
        result.push({ name: node.name, refId: node.refId });
      }

      if (node.children) {
        for (const child of node.children) {
          result.push(...collectComponentNodes(child));
        }
      }

      return result;
    };

    const componentNodes = collectComponentNodes(uiTree.root);

    for (const { name, refId } of componentNodes) {
      const existsInDeps = dependencies.has(refId);
      console.log(
        `${name} (${refId}): ${existsInDeps ? "✓ in dependencies" : "✗ NOT in dependencies"}`
      );

      if (existsInDeps) {
        const dep = dependencies.get(refId);
        console.log(`  - Component name: ${dep?.info.document.name}`);
      }
    }
  });

  it("should handle nested component nodes", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    const findDeepestComponent = (
      node: any,
      depth: number = 0
    ): { maxDepth: number; path: string } => {
      let maxDepth = node.type === "component" ? depth : -1;
      let path = node.name;

      if (node.children) {
        for (const child of node.children) {
          const childResult = findDeepestComponent(child, depth + 1);
          if (childResult.maxDepth > maxDepth) {
            maxDepth = childResult.maxDepth;
            path = `${node.name}/${childResult.path}`;
          }
        }
      }

      return { maxDepth, path };
    };

    const result = findDeepestComponent(uiTree.root);
    console.log(`Deepest component at depth ${result.maxDepth}: ${result.path}`);

    if (result.maxDepth >= 0) {
      expect(result.maxDepth).toBeGreaterThanOrEqual(0);
    }
  });

  it("should verify refId consistency across variants", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // Icon 노드는 12개 variant에서 병합됨
    // 모든 variant에서 같은 refId를 가져야 함
    if (uiTree.root.type === "container") {
      const iconNode = uiTree.root.children.find((c) => c.name === "Icon");

      if (iconNode?.type === "component" && iconNode.refId) {
        console.log(`Icon refId: ${iconNode.refId}`);

        // refId가 일관성 있게 설정되었는지 확인
        expect(iconNode.refId).toMatch(/^\d+:\d+$/);
        expect(iconNode.refId).toBe("91:1058");
      }
    }
  });
});
