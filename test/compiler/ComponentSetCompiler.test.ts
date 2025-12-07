import { describe, it, expect, vi, beforeEach } from "vitest";
import taptapButtonSampleMockData from "../fixtures/button/taptapButton_sample.json";
import ComponentSetCompiler from "@compiler/core/componentSetNode/ComponentSetCompiler";
import NodeMatcher from "@compiler/core/NodeMatcher";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { SuperTreeNode } from "@compiler";

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
  const specManager = new SpecDataManager(taptapButtonSampleMockData as any);
  const renderTree = specManager.getRenderTree();

  const componentSetCompiler = new ComponentSetCompiler(
    renderTree,
    specManager,
    new NodeMatcher(specManager)
  );

  test("taptapButton_sample.json의 children중에 LINE 타입은 하나여야 한다.", () => {
    const lineNodes = countNodesByType(componentSetCompiler.superTree, "LINE");
    expect(lineNodes).toBe(1);
  });

  test("taptapButton_sample.json의 children중에 Text 타입은 하나여야 한다.", () => {
    const textNodes = countNodesByType(componentSetCompiler.superTree, "TEXT");
    expect(textNodes).toBe(1);
  });

  test("taptapButton_sample.json의 children중에 ICON 타입은 두개여야 한다.", () => {
    const iconNodes = countNodesByType(
      componentSetCompiler.superTree,
      "INSTANCE"
    );
    expect(iconNodes).toBe(2);
  });
});
