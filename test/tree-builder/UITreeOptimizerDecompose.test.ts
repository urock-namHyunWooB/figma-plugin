import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import taptapButtonMockData from "../fixtures/button/taptapButton.json";

describe("UITreeOptimizer — FD decomposition", () => {
  it("dynamic 엔트리가 단일 prop 조건으로 분해되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(taptapButtonMockData as any);
    const { main } = compiler.buildUITree();

    // root 노드의 dynamic 조건 확인
    const dynamic = main.root.styles?.dynamic;
    expect(dynamic).toBeDefined();
    expect(dynamic!.length).toBeGreaterThan(0);

    // 모든 dynamic 엔트리의 condition이 AND 폭발이 아닌 단일 prop이어야 함
    for (const entry of dynamic!) {
      const { condition } = entry;

      if (condition.type === "and") {
        // compound prop인 경우에만 AND 허용 — 하지만 AND 내부에 같은 prop이 반복되면 안 됨
        const props = new Set<string>();
        for (const sub of condition.conditions) {
          if (sub.type === "eq") props.add(sub.prop);
          if (sub.type === "truthy") props.add(sub.prop);
          if (sub.type === "not" && sub.condition.type === "truthy")
            props.add(sub.condition.prop);
        }
        // AND 내의 prop이 모두 다른 이름이어야 함 (compound FD)
        expect(props.size).toBe(condition.conditions.length);
      }
      // 단일 조건 (eq, truthy, not) — 정상
    }
  });

  it("분해 전보다 dynamic 엔트리 수가 줄어야 한다", () => {
    const compiler = new FigmaCodeGenerator(taptapButtonMockData as any);
    const { main } = compiler.buildUITree();

    const dynamic = main.root.styles?.dynamic;
    expect(dynamic).toBeDefined();

    // taptapButton은 원래 9개 AND 폭발 엔트리 → FD 분해 후 훨씬 적어야 함
    expect(dynamic!.length).toBeLessThan(9);
  });

  it("분해 후에도 생성 코드가 정상이어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(taptapButtonMockData as any);
    const code = await compiler.compile();

    expect(code).toBeDefined();
    expect(code).toContain("size");
    // padding이 size별로 다른 값으로 생성되어야 함
    expect(code).toContain("padding");
  });

  it("children 노드도 재귀적으로 분해되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(taptapButtonMockData as any);
    const { main } = compiler.buildUITree();

    // 모든 노드를 순회하면서 AND 폭발이 없는지 확인
    function checkNode(node: any) {
      if (node.styles?.dynamic) {
        for (const entry of node.styles.dynamic) {
          if (entry.condition.type === "and") {
            // compound인 경우 내부 prop이 모두 다른 이름
            const props = new Set<string>();
            for (const sub of entry.condition.conditions) {
              if (sub.type === "eq") props.add(sub.prop);
              if (sub.type === "truthy") props.add(sub.prop);
              if (sub.type === "not" && sub.condition?.type === "truthy")
                props.add(sub.condition.prop);
            }
            expect(props.size).toBe(entry.condition.conditions.length);
          }
        }
      }
      if (node.children) {
        for (const child of node.children) {
          checkNode(child);
        }
      }
    }

    checkNode(main.root);
  });
});
