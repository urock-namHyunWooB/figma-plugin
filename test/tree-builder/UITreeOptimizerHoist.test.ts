import { describe, it, expect } from "vitest";
import { UITreeOptimizer } from "@code-generator2/layers/tree-manager/post-processors/UITreeOptimizer";
import type { UITree, UINode, ConditionNode } from "@code-generator2/types/types";

function makeContainer(
  id: string,
  children: UINode[],
  visibleCondition?: ConditionNode
): UINode {
  return {
    type: "container" as const,
    id,
    name: id,
    children,
    ...(visibleCondition ? { visibleCondition } : {}),
  };
}

function makeText(
  id: string,
  visibleCondition?: ConditionNode
): UINode {
  return {
    type: "text" as const,
    id,
    name: id,
    textSegments: [{ text: "hello" }],
    ...(visibleCondition ? { visibleCondition } : {}),
  };
}

function makeTree(root: UINode, props: any[] = []): UITree {
  return {
    root: root as any,
    props,
    arraySlotNames: [],
    dependencies: [],
  };
}

describe("UITreeOptimizer.hoistSharedChildConditions", () => {
  const optimizer = new UITreeOptimizer();

  it("모든 자식이 동일한 조건을 가지면 부모로 끌어올리고 자식에서 제거", () => {
    const sharedCondition: ConditionNode = {
      type: "not",
      condition: { type: "truthy", prop: "iconOnly" },
    };

    const root = makeContainer("root", [
      makeContainer(
        "Leading Icon",
        [makeText("Icons", { ...sharedCondition })],
        { type: "truthy", prop: "leadingIcon" }
      ),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const leadingIcon = (root as any).children[0];
    expect(leadingIcon.visibleCondition).toEqual({
      type: "and",
      conditions: [
        { type: "truthy", prop: "leadingIcon" },
        sharedCondition,
      ],
    });
    expect(leadingIcon.children[0].visibleCondition).toBeUndefined();
  });

  it("부모에 기존 조건이 없으면 공통 조건만 부모에 설정", () => {
    const sharedCondition: ConditionNode = {
      type: "truthy",
      prop: "showContent",
    };

    const root = makeContainer("root", [
      makeContainer("wrapper", [
        makeText("child1", { ...sharedCondition }),
        makeText("child2", { ...sharedCondition }),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const wrapper = (root as any).children[0];
    expect(wrapper.visibleCondition).toEqual(sharedCondition);
    expect(wrapper.children[0].visibleCondition).toBeUndefined();
    expect(wrapper.children[1].visibleCondition).toBeUndefined();
  });

  it("자식 조건이 서로 다르면 끌어올리지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("wrapper", [
        makeText("child1", { type: "truthy", prop: "a" }),
        makeText("child2", { type: "truthy", prop: "b" }),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const wrapper = (root as any).children[0];
    expect(wrapper.visibleCondition).toBeUndefined();
    expect(wrapper.children[0].visibleCondition).toEqual({
      type: "truthy",
      prop: "a",
    });
    expect(wrapper.children[1].visibleCondition).toEqual({
      type: "truthy",
      prop: "b",
    });
  });

  it("일부 자식에만 조건이 있으면 끌어올리지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("wrapper", [
        makeText("child1", { type: "truthy", prop: "a" }),
        makeText("child2"),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const wrapper = (root as any).children[0];
    expect(wrapper.visibleCondition).toBeUndefined();
  });

  it("자식이 0개면 아무것도 하지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("empty", []),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const empty = (root as any).children[0];
    expect(empty.visibleCondition).toBeUndefined();
  });

  it("중첩된 트리에서 bottom-up으로 동작", () => {
    const innerCondition: ConditionNode = { type: "truthy", prop: "x" };

    const root = makeContainer("root", [
      makeContainer("grandparent", [
        makeContainer("parent", [
          makeText("child1", { ...innerCondition }),
          makeText("child2", { ...innerCondition }),
        ]),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const parent = (root as any).children[0].children[0];
    expect(parent.visibleCondition).toEqual(innerCondition);
    expect(parent.children[0].visibleCondition).toBeUndefined();
    expect(parent.children[1].visibleCondition).toBeUndefined();
  });
});
