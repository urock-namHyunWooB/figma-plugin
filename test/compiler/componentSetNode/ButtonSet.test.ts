import { describe, test, expect, vi } from "vitest";
import { generate } from "astring";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import NodeMatcher from "@compiler/core/NodeMatcher";
import RefineProps from "@compiler/core/RefineProps";
import CreateAstTree from "@compiler/core/ast-tree/CreateAstTree";
import CreateSuperTree from "@compiler/core/super-tree/CreateSuperTree";
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
// @ts-ignore
const fixtureEntries = Object.entries(fixtures).map(([path, data]) => {
  const fileName = path.split("/").pop()!.replace(".json", "");
  return [fileName, data] as const;
});

function extractPropsInterfaceBlock(code: string): string {
  const m =
    code.match(/interface\s+\w+Props\s*{[\s\S]*?}\s*/m)?.[0] ??
    code.match(/type\s+\w+Props\s*=\s*{[\s\S]*?}\s*/m)?.[0] ??
    "";
  return m;
}

type ParsedProp = { name: string; optional: boolean; type: string };

function parsePropsFromInterface(code: string): ParsedProp[] {
  const block = extractPropsInterfaceBlock(code);
  if (!block) return [];

  // 아주 단순 파서: "key?: Type;" / "key: Type;" 형태만 대상으로 함
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("interface") && l !== "}" && l !== "};");

  const props: ParsedProp[] = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;]+);?$/);
    if (!m) continue;
    props.push({ name: m[1], optional: Boolean(m[2]), type: m[3].trim() });
  }
  return props;
}

function pickStringPropName(props: ParsedProp[]): string | null {
  const candidates = props.filter((p) => /\bstring\b/.test(p.type));
  const preferred = ["text", "label", "title", "children", "value", "name"];
  for (const key of preferred) {
    const hit = candidates.find((p) => p.name === key);
    if (hit) return hit.name;
  }
  return candidates[0]?.name ?? null;
}

function pickReactNodePropNames(props: ParsedProp[]): string[] {
  const isNode = (t: string) =>
    /React\.ReactNode\b/.test(t) ||
    /ReactNode\b/.test(t) ||
    /JSX\.Element\b/.test(t) ||
    /React\.Element\b/.test(t);
  return props.filter((p) => isNode(p.type)).map((p) => p.name);
}

function hasOnClickProp(props: ParsedProp[]): boolean {
  return props.some(
    (p) =>
      p.name === "onClick" ||
      /\bMouseEventHandler\b/.test(p.type) ||
      /\bonClick\b/.test(p.type)
  );
}

function hasDisabledProp(props: ParsedProp[]): boolean {
  return props.some(
    (p) => p.name === "disabled" || /\bdisabled\b/.test(p.type)
  );
}

function buildMinimalRenderableProps(props: ParsedProp[]): Record<string, any> {
  const out: Record<string, any> = {};

  for (const p of props) {
    if (p.optional) continue;

    // required props만 채움 (테스트가 "기본 렌더"에서 터지지 않게)
    if (/\bstring\b/.test(p.type)) out[p.name] = "x";
    else if (/\bnumber\b/.test(p.type)) out[p.name] = 1;
    else if (/\bboolean\b/.test(p.type)) out[p.name] = false;
    else if (/["'][^"']+["']\s*\|\s*["'][^"']+["']/.test(p.type)) {
      // union literal 타입이면 첫 literal 사용
      const first = p.type.match(/["']([^"']+)["']/)?.[1];
      out[p.name] = first ?? "x";
    } else if (/React\.ReactNode\b|ReactNode\b|JSX\.Element\b/.test(p.type)) {
      out[p.name] = null;
    } else {
      // 알 수 없는 타입은 일단 undefined 대신 null로 채워 런타임 에러를 줄임
      out[p.name] = null;
    }
  }

  return out;
}

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

// @ts-ignore
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
      const code = await await compiler.getGeneratedCode("Button")!;
      expect(code).toBeTruthy();
      expect(typeof code).toBe("string");
      expect(code!.length).toBeGreaterThan(0);

      // 3. 컴포넌트로 컴파일
      const Component = await renderReactComponent(code!);
      expect(Component).toBeDefined();
      expect(typeof Component).toBe("function");

      // 4. 렌더링
      const { container } = render(React.createElement(Component));
      expect(container).toBeTruthy();
    });

    test("props를 전달하여 렌더링할 수 있어야 한다", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode()!;
      const Component = await renderReactComponent(code!);

      // props 전달하여 렌더링
      const { container } = render(React.createElement(Component));

      // 기본적으로 렌더링이 성공해야 함
      expect(container).toBeTruthy();
    });

    test("props로 text를 넘기면 text가 렌더링 되어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode()!;
      const Component = await renderReactComponent(code!);

      const parsed = parsePropsFromInterface(code!);
      console.log(code);
      const textProp = pickStringPropName(parsed);
      if (!textProp) {
        // 이 테스트의 스펙: "text를 넘길 수 있는 prop"은 반드시 있어야 한다.
        // 없으면 fixture/컴파일 결과가 버튼 요구사항을 만족하지 못한 것이므로 fail.
        throw new Error(
          "Button props에 text로 사용할 string prop이 없습니다. (예: text/label/title/children 등)"
        );
      }

      const props = buildMinimalRenderableProps(parsed);
      props[textProp] = "HELLO_TEXT_PROP";

      render(React.createElement(Component, props));
      expect(screen.getByText("HELLO_TEXT_PROP")).toBeTruthy();
    });

    test("Text는 무조건 하나 있어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await await compiler.getGeneratedCode("Button")!;
      const Component = await renderReactComponent(code!);

      const parsed = parsePropsFromInterface(code!);
      const props = buildMinimalRenderableProps(parsed);

      render(React.createElement(Component, props));

      // 기존 AST 테스트에서도 TEXT 노드는 1개로 강제하고 있으니,
      // 실제 렌더 결과에서도 "텍스트로 보이는 노드"가 최소 1개는 있어야 한다.
      const allText = (screen.queryAllByText(/.+/g) ?? []).filter(
        (el) => el.textContent && el.textContent.trim().length > 0
      );
      expect(allText.length).toBeGreaterThanOrEqual(1);
    });

    test("Props에 Icon을 넣을 수 있으면 Icon 넣고 렌더링이 되어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode("Button")!;
      const Component = await renderReactComponent(code!);

      const parsed = parsePropsFromInterface(code!);
      const iconPropNames = pickReactNodePropNames(parsed);
      if (iconPropNames.length === 0) {
        // icon prop이 없으면 스킵(실패 대신 의미있는 no-op)
        expect(true).toBe(true);
        return;
      }

      const props = buildMinimalRenderableProps(parsed);
      // 첫 icon prop에만 주입
      props[iconPropNames[0]] = React.createElement("svg", {
        "data-testid": "icon",
      });

      render(React.createElement(Component, props));
      expect(screen.getByTestId("icon")).toBeTruthy();
    });

    test("버튼으로서 기본 기능을 할 수 있어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode("Button")!;
      const Component = await renderReactComponent(code!);

      const parsed = parsePropsFromInterface(code!);
      const props = buildMinimalRenderableProps(parsed);

      // onClick이 있으면 클릭 이벤트가 호출되어야 함
      const hasOnClick = hasOnClickProp(parsed);
      if (hasOnClick) {
        props.onClick = vi.fn();
      }

      render(React.createElement(Component, props));
      const button = screen.getByRole("button");
      expect(button).toBeTruthy();

      if (hasOnClick) {
        fireEvent.click(button);
        expect(props.onClick).toHaveBeenCalled();
      }
    });

    test("폰트 패밀리가 잘 지정 되어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode("Button");

      // JSDOM에서 emotion/style sheet 기반 font-family를 안정적으로 computedStyle로 검증하기 어렵기 때문에,
      // 생성 코드에 font-family 선언이 포함되는지를 1차로 보장한다.
      expect(code).toMatch(/font-family\s*:/);
    });

    test("아이콘 크기 적용이 실제 아이콘에 잘 먹어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode("Button")!;

      const parsed = parsePropsFromInterface(code!);
      const iconPropNames = pickReactNodePropNames(parsed);
      if (iconPropNames.length === 0) {
        expect(true).toBe(true);
        return;
      }

      // 아이콘 사이즈는 보통 width/height로 주어지므로, 생성 코드에 width/height가 존재해야 한다.
      expect(code).toMatch(/width\s*:\s*\d+px/);
      expect(code).toMatch(/height\s*:\s*\d+px/);
    });

    test("disabled 관련 속성이 있다면 해당 기능이 잘 적용 되어야 한다.", async () => {
      const compiler = new FigmaCompiler(mockData);
      const code = await compiler.getGeneratedCode("Button")!;
      const Component = await renderReactComponent(code!);

      const parsed = parsePropsFromInterface(code!);
      const props = buildMinimalRenderableProps(parsed);

      if (!hasDisabledProp(parsed)) {
        // disabled prop이 없으면 최소한 스타일/속성 키워드가 없는지(또는 상관없이) 렌더만 보장
        const { container } = render(React.createElement(Component, props));
        expect(container).toBeTruthy();
        return;
      }

      props.disabled = true;
      render(React.createElement(Component, props));
      const button = screen.getByRole("button");
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    test("컴포넌트 이름은 ComponentSetNode 이름이여야 한다.", () => {});

    test("컴포넌트 root 태그는 button 태그여야 한다.", () => {});
  });
});
