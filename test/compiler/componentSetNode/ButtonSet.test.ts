import { describe, test, expect } from "vitest";
import { generate } from "astring";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import RefineProps from "@compiler/core/componentSetNode/RefineProps";
import CreateAstTree from "@compiler/core/componentSetNode/ast-tree/CreateAstTree";
import CreateSuperTree from "@compiler/core/componentSetNode/super-tree/CreateSuperTree";
import { FinalAstTree, SuperTreeNode } from "@compiler";
import { traverseBFS } from "@compiler/utils/traverse";
import { FigmaCompiler } from "@compiler/FigmaCompiler";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";

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

  test("props에 state는 없어야 하고 모든노드에서 바인딩 된 state도 삭제 되어야 한다.", () => {
    const rootProps = createFinalAstTree.finalAstTree.props;

    // 1. 루트 props에서 state 키 없어야 함
    expect(rootProps).not.toHaveProperty("state");
    expect(rootProps).not.toHaveProperty("State");
    expect(rootProps).not.toHaveProperty("States");
    expect(rootProps).not.toHaveProperty("states");

    // 2. 모든 노드의 visible.condition에서 state 참조 없어야 함
    const statePattern = /props\.(state|State|States|states)\b/i;

    traverseBFS(createFinalAstTree.finalAstTree, (node) => {
      if (node.visible.type === "condition") {
        const conditionStr = generate(node.visible.condition);
        expect(conditionStr).not.toMatch(statePattern);
      }
    });
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

  describe("렌더링 테스트", () => {
    test("생성된 코드가 실제로 렌더링되어야 한다", async () => {
      // 1. FigmaCompiler로 컴파일러 생성
      const compiler = new FigmaCompiler(mockData);

      // 2. 코드 생성
      const code = compiler.getGeneratedCode("Button");
      expect(code).toBeTruthy();
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);

      // 3. 컴포넌트로 컴파일
      const Component = await renderReactComponent(code);
      expect(Component).toBeDefined();
      expect(typeof Component).toBe("function");

      // 4. 렌더링
      const { container } = render(React.createElement(Component));
      expect(container).toBeInTheDocument();
    });

    test("props를 전달하여 렌더링할 수 있어야 한다", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = compiler.getGeneratedCode("Button");
      const Component = await renderReactComponent(code);

      // props 전달하여 렌더링
      const { container } = render(React.createElement(Component));

      // 기본적으로 렌더링이 성공해야 함
      expect(container).toBeInTheDocument();
    });

    test("생성된 코드는 유효한 TypeScript/TSX 코드여야 한다", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = compiler.getGeneratedCode("Button");

      // 기본적인 코드 구조 검증
      expect(code).toContain("function Button");
      expect(code).toContain("return");
      expect(code).toContain("React");
    });

    test("props로 text를 넘기면 text가 렌더링 되어야 한다.", () => {});

    test("Text는 무조건 하나 있어야 한다.", () => {});

    test("Props에 Icon을 넣을 수 있으면 Icon 넣고 렌더링이 되어야 한다.", () => {});
  });
});
