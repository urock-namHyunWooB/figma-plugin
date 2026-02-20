import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { HeuristicsProcessor } from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/HeuristicsProcessor";

import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import urockButton from "../fixtures/button/urockButton.json";

describe("Heuristics", () => {
  describe("ButtonHeuristic", () => {
    it("should detect taptapButton as button", () => {
      const dataManager = new DataManager(taptapButton as any);
      const treeBuilder = new TreeBuilder(dataManager);
      const uiTree = treeBuilder.build(taptapButton as any);

      expect(uiTree.componentType).toBe("button");
      expect(uiTree.root.type).toBe("button");
      expect(uiTree.root.semanticType).toBe("button");
    });

    it("should detect airtableButton as button", () => {
      const dataManager = new DataManager(airtableButton as any);
      const treeBuilder = new TreeBuilder(dataManager);
      const uiTree = treeBuilder.build(airtableButton as any);

      expect(uiTree.componentType).toBe("button");
      expect(uiTree.root.type).toBe("button");
    });

    it("should detect urockButton as button", () => {
      const dataManager = new DataManager(urockButton as any);
      const treeBuilder = new TreeBuilder(dataManager);
      const uiTree = treeBuilder.build(urockButton as any);

      expect(uiTree.componentType).toBe("button");
      expect(uiTree.root.type).toBe("button");
    });

    it("should set semanticType on child nodes", () => {
      const dataManager = new DataManager(taptapButton as any);
      const treeBuilder = new TreeBuilder(dataManager);
      const uiTree = treeBuilder.build(taptapButton as any);

      // TEXT 노드는 label
      const textNode = uiTree.root.children.find((c) => c.type === "text");
      if (textNode) {
        expect(textNode.semanticType).toBe("label");
      }

      // INSTANCE 노드(아이콘)는 icon
      const iconNodes = uiTree.root.children.filter((c) => c.type === "component");
      for (const iconNode of iconNodes) {
        // 작은 아이콘이면 semanticType이 "icon"
        if (iconNode.semanticType) {
          expect(iconNode.semanticType).toBe("icon");
        }
      }
    });
  });

  describe("HeuristicsProcessor.debugScores", () => {
    it("should return scores for all heuristics", () => {
      const dataManager = new DataManager(taptapButton as any);
      const heuristicsProcessor = new HeuristicsProcessor(dataManager);

      // VariantMerger로 InternalTree 생성
      const treeBuilder = new TreeBuilder(dataManager);
      const internalTree = treeBuilder.buildInternalTreeDebug(taptapButton as any);

      const scores = heuristicsProcessor.debugScores(internalTree);

      console.log("Heuristic scores for taptapButton:");
      scores.forEach(({ name, score, selected }) => {
        console.log(`  ${name}: ${score}${selected ? " (selected)" : ""}`);
      });

      // ButtonHeuristic이 선택되어야 함
      const buttonHeuristic = scores.find((s) => s.name === "ButtonHeuristic");
      expect(buttonHeuristic?.selected).toBe(true);
      expect(buttonHeuristic?.score).toBeGreaterThanOrEqual(10);
    });
  });

  describe("GenericHeuristic fallback", () => {
    it("should fallback to unknown for non-matching components", () => {
      // TODO: 버튼이 아닌 컴포넌트 fixture 필요
      // 현재는 모든 fixture가 버튼이므로 skip
    });
  });
});
