import { describe, it } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import { writeFileSync } from "fs";

describe("InternalTree Merge Inspection", () => {
  it("should save merge result to file for inspection", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const internalTree = treeBuilder.buildInternalTreeDebug(
      airtableButton as any
    );

    // 병합 결과를 JSON 파일로 저장
    const result = {
      rootName: internalTree.name,
      rootType: internalTree.type,
      rootId: internalTree.id,
      mergedNodesCount: internalTree.mergedNodes?.length,
      mergedNodes: internalTree.mergedNodes?.map((m) => ({
        id: m.id,
        name: m.name,
        variantName: m.variantName,
      })),
      childrenCount: internalTree.children.length,
      children: internalTree.children.map((child) => ({
        name: child.name,
        type: child.type,
        id: child.id,
        mergedNodesCount: child.mergedNodes?.length,
        mergedNodes: child.mergedNodes?.map((m) => ({
          id: m.id,
          name: m.name,
          variantName: m.variantName,
        })),
        // 더 깊은 레벨 확인
        childrenCount: child.children.length,
        firstChild: child.children[0]
          ? {
              name: child.children[0].name,
              type: child.children[0].type,
              mergedNodesCount: child.children[0].mergedNodes?.length,
            }
          : null,
      })),
      // 원본 variant 개수
      totalVariantsInFixture:
        (airtableButton.info.document as any).children?.length || 0,
    };

    writeFileSync(
      "test/tree-builder/merge-result.json",
      JSON.stringify(result, null, 2)
    );

    console.log("Merge result saved to test/tree-builder/merge-result.json");
  });
});
