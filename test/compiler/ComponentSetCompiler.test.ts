import { describe, expect } from "vitest";
import taptapButtonSampleMockData from "../fixtures/button/taptapButton_sample.json";
import tadaButtonMockData from "../fixtures/button/tadaButton.json";
import awsButtonMockData from "../fixtures/button/awsButton.json";

import NodeMatcher from "@compiler/core/NodeMatcher";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { SuperTreeNode } from "@compiler";
import CreateFinalAstTree from "@compiler/core/componentSetNode/CreateFinalAstTree";
import CreateSuperTree from "@compiler/core/componentSetNode/CreateSuperTree";
import RefineProps from "@compiler/core/componentSetNode/RefineProps";

function countNodesByType(node: SuperTreeNode, type: string): number {
  let count = node.type === type ? 1 : 0;
  for (const child of node.children) {
    if (child) {
      count += countNodesByType(child, type);
    }
  }
  return count;
}

describe("ComponentSetCompiler", () => {
  describe("tempAstTree (중간트리) 테스트", () => {
    describe("taptapButton_sample", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const RefindProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateFinalAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        RefindProps.refinedProps
      );

      test("taptapButton_sample.json의 children중에 LINE 타입은 하나여야 한다.", () => {
        const lineNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "LINE"
        );
        expect(lineNodes).toBe(1);
      });

      test("taptapButton_sample.json의 children중에 Text 타입은 1개 이상", () => {
        const textNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        );
        expect(textNodes).toBeGreaterThanOrEqual(1);
      });

      test("taptapButton_sample.json의 children중에 ICON 타입은 두개여야 한다.", () => {
        const iconNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        );
        expect(iconNodes).toBe(2);
      });
    });

    describe("tadaButton", () => {
      const specDataManager = new SpecDataManager(tadaButtonMockData as any);
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const RefindProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateFinalAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        RefindProps.refinedProps
      );

      test("children중에 Text 타입은 하나여야 한다.", () => {
        const textNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        );
        expect(textNodes).toBe(1);
      });

      test("children중에 ICON 타입은 두개여야 한다.", () => {
        const iconNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        );
        expect(iconNodes).toBe(2);
      });
    });

    describe("awsButton", () => {
      const specDataManager = new SpecDataManager(awsButtonMockData as any);
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const RefindProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateFinalAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        RefindProps.refinedProps
      );

      test("children중에 Text 타입은 하나여야 한다.", () => {
        const textNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        );
        expect(textNodes).toBe(1);
      });

      test("children중에 ICON 타입은 두개여야 한다.", () => {
        const iconNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        );
        expect(iconNodes).toBe(2);
      });
    });
  });
});
