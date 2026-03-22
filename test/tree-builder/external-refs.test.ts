import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import { writeFileSync } from "fs";

describe("ExternalRefsProcessor", () => {
  it("should set refId for INSTANCE nodes", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // Icon 노드 찾기 (INSTANCE 타입)
    if (uiTree.root.type === "container") {
      const iconNode = uiTree.root.children.find((c) => c.name === "Icon");

      expect(iconNode).toBeDefined();
      expect(iconNode?.type).toBe("component");

      if (iconNode?.type === "component") {
        expect(iconNode.refId).toBeDefined();
        expect(iconNode.refId).toBeTruthy();

        console.log("Icon refId:", iconNode.refId);
      }
    }
  });

  it("should create detailed external refs tree", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    const extractRefs = (node: any, depth = 0): any => {
      return {
        name: node.name,
        type: node.type,
        depth,
        refId: node.type === "component" ? node.refId : undefined,
        children: node.children?.map((child: any) =>
          extractRefs(child, depth + 1)
        ),
      };
    };

    const tree = extractRefs(uiTree.root);

    writeFileSync(
      "test/tree-builder/external-refs-tree.json",
      JSON.stringify(tree, null, 2)
    );

    console.log("External refs tree saved");
  });

  it("should handle nodes without external refs", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // Label은 TEXT 타입이므로 refId가 없어야 함
    if (uiTree.root.type === "container") {
      const labelNode = uiTree.root.children.find((c) => c.name === "Label");

      expect(labelNode).toBeDefined();
      expect(labelNode?.type).toBe("text");

      if (labelNode?.type === "text") {
        // TextNode에는 refId가 없음
        expect((labelNode as any).refId).toBeUndefined();
      }
    }
  });

  it("should keep component refId for vector-only dependencies", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // vector-only 의존 컴포넌트도 컴포넌트 참조로 유지
    const collectComponentNodes = (
      node: any,
      path: string = ""
    ): Array<{ path: string; refId: string }> => {
      const currentPath = path ? `${path}/${node.name}` : node.name;
      const result: Array<{ path: string; refId: string }> = [];

      if (node.type === "component" && node.refId) {
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

    // vector-only여도 refId 유지 → 컴포넌트 참조로 렌더링
    expect(componentNodes.length).toBeGreaterThan(0);
  });

  it("should verify refId format", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    if (uiTree.root.type === "container") {
      const iconNode = uiTree.root.children.find((c) => c.name === "Icon");

      if (iconNode?.type === "component" && iconNode.refId) {
        // refId는 Figma ID 형식이어야 함 (숫자:숫자)
        expect(iconNode.refId).toMatch(/^\d+:\d+$/);
        console.log("RefId format validated:", iconNode.refId);
      }
    }
  });
});
