import { describe, it, expect } from "vitest";
import { UITreeOptimizer } from "@code-generator2/layers/tree-manager/post-processors/UITreeOptimizer";
import type { UITree, UINode, ConditionNode } from "@code-generator2/types/types";

function makeContainer(id: string, children: UINode[], opts?: {
  visibleCondition?: ConditionNode;
  metadata?: any;
}): UINode {
  return {
    type: "container" as const,
    id, name: id, children,
    ...(opts?.visibleCondition ? { visibleCondition: opts.visibleCondition } : {}),
    ...(opts?.metadata ? { metadata: opts.metadata } : {}),
  };
}

function makeText(id: string, vc?: ConditionNode): UINode {
  return {
    type: "text" as const, id, name: id,
    textSegments: [{ text: "hello" }],
    ...(vc ? { visibleCondition: vc } : {}),
  };
}

function makeTree(root: UINode): UITree {
  return { root: root as any, props: [], arraySlotNames: [], dependencies: [] };
}

describe("UITreeOptimizer.transformLayoutModeSwitches", () => {
  const optimizer = new UITreeOptimizer();

  it("layoutModeSwitch annotation → conditionalGroup 노드 생성", () => {
    const iconOnlyFalse: ConditionNode = { type: "eq", prop: "iconOnly", value: "False" };
    const iconOnlyTrue: ConditionNode = { type: "eq", prop: "iconOnly", value: "True" };

    const root = makeContainer("root", [
      makeContainer("Content", [
        makeContainer("Leading Icon", [], { visibleCondition: iconOnlyFalse }),
        makeText("텍스트", iconOnlyFalse),
        makeContainer("Trailing Icon", [], { visibleCondition: iconOnlyFalse }),
        makeContainer("Icon", [], { visibleCondition: iconOnlyTrue }),
      ], {
        metadata: {
          designPatterns: [{
            type: "layoutModeSwitch",
            containerNodeId: "Content",
            prop: "iconOnly",
            branches: {
              "False": ["Leading Icon", "텍스트", "Trailing Icon"],
              "True": ["Icon"],
            },
          }],
        },
      }),
    ]);

    const tree = makeTree(root);
    optimizer.optimizeMain(tree);

    const content = (root as any).children[0];
    const cg = content.children.find((c: any) => c.type === "conditionalGroup");
    expect(cg).toBeDefined();
    expect(cg.prop).toBe("iconOnly");
    expect(Object.keys(cg.branches).sort()).toEqual(["False", "True"]);
    expect(cg.branches["False"]).toHaveLength(3);
    expect(cg.branches["True"]).toHaveLength(1);
    // visibleCondition should be removed from branched children
    expect(cg.branches["False"][0].visibleCondition).toBeUndefined();
    expect(cg.branches["True"][0].visibleCondition).toBeUndefined();
  });

  it("annotation이 없으면 변환하지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("Content", [
        makeText("Label"),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.optimizeMain(tree);

    const content = (root as any).children[0];
    expect(content.children.every((c: any) => c.type !== "conditionalGroup")).toBe(true);
  });

  it("공통 자식은 유지되고 conditionalGroup과 함께 존재", () => {
    const root = makeContainer("root", [
      makeContainer("Wrapper", [
        makeText("CommonChild"),  // 모든 모드에 공통
        makeContainer("ModeA-Only", [], { visibleCondition: { type: "eq", prop: "mode", value: "A" } }),
        makeContainer("ModeB-Only", [], { visibleCondition: { type: "eq", prop: "mode", value: "B" } }),
      ], {
        metadata: {
          designPatterns: [{
            type: "layoutModeSwitch",
            containerNodeId: "Wrapper",
            prop: "mode",
            branches: { "A": ["ModeA-Only"], "B": ["ModeB-Only"] },
          }],
        },
      }),
    ]);

    const tree = makeTree(root);
    optimizer.optimizeMain(tree);

    const wrapper = (root as any).children[0];
    expect(wrapper.children).toHaveLength(2); // CommonChild + conditionalGroup
    expect(wrapper.children[0].name).toBe("CommonChild");
    expect(wrapper.children[1].type).toBe("conditionalGroup");
  });
});
