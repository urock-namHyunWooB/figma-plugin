import { describe, test, expect } from "vitest";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import RefineProps from "@compiler/core/componentSetNode/RefineProps";
import CreateAstTree from "@compiler/core/componentSetNode/ast-tree/CreateAstTree";
import CreateSuperTree from "@compiler/core/componentSetNode/super-tree/CreateSuperTree";
import { FinalAstTree, SuperTreeNode } from "@compiler";

// Vite의 import.meta.glob으로 모든 JSON 파일 동적 로드
// @ts-ignore
const fixtures = import.meta.glob("../../fixtures/button/*.json", {
  eager: true,
  import: "default",
}) as Record<string, any>;

// { "../../fixtures/button/xxx.json": data } → [["xxx", data], ...]
const fixtureEntries = Object.entries(fixtures).map(([path, data]) => {
  const fileName = path.split("/").pop()!.replace(".json", "");
  return [fileName, data] as const;
});

function countNodesByType(
  node: SuperTreeNode | FinalAstTree,
  type: string
): number {
  let count = node.type === type ? 1 : 0;
  for (const child of node.children) {
    if (child) {
      count += countNodesByType(child, type);
    }
  }
  return count;
}

function collectNodesByType(node: SuperTreeNode | FinalAstTree, type: string) {
  const nodes: SuperTreeNode[] | FinalAstTree[] = [];
  if (node.type === type) {
    nodes.push(node as any);
  }
  for (const child of node.children) {
    if (child) {
      nodes.push(...(collectNodesByType(child, type) as any));
    }
  }
  return nodes;
}

describe.each(fixtureEntries)("Button: %s", (fileName, mockData) => {
  const specDataManager = new SpecDataManager(mockData as any);
  const renderTree = specDataManager.getRenderTree();
  const matcher = new NodeMatcher(specDataManager);
  const createSuperTree = new CreateSuperTree(
    renderTree,
    specDataManager,
    matcher
  );
  const refineProps = new RefineProps(renderTree, specDataManager);

  const createFinalAstTree = new CreateAstTree(
    specDataManager,
    createSuperTree.getSuperTree(),
    refineProps.refinedProps
  );

  test("에러 없이 처리되어야 한다", () => {
    expect(() => {
      new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );
    }).not.toThrow();
  });

  test("finalAstTree가 생성되어야 한다", () => {
    expect(createFinalAstTree.finalAstTree).toBeDefined();
    expect(createFinalAstTree.finalAstTree.id).toBeDefined();
  });

  test("TEXT 노드는 children이 비어있어야 한다", () => {
    const textNodes = collectNodesByType(
      createFinalAstTree.finalAstTree,
      "TEXT"
    );

    textNodes.forEach((node) => {
      expect(node.children.length).toBe(0);
    });
  });

  test("props에 state는 없어야 한다.", () => {
    const rootProps = createFinalAstTree.finalAstTree.props;
    expect(rootProps).not.toHaveProperty("state");
    expect(rootProps).not.toHaveProperty("State");
  });

  test("props의 키는 카멜케이스로 유효한 형태여야 한다.", () => {
    const rootProps = createFinalAstTree.finalAstTree.props;
    const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;

    Object.keys(rootProps).forEach((key) => {
      expect(key).toMatch(camelCaseRegex);
    });
  });

  test("children중에 Text는 1개", () => {
    const textNodes = countNodesByType(createFinalAstTree.finalAstTree, "TEXT");
    expect(textNodes).toBe(1);
  });
});
