import { describe, it, expect } from "vitest";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
import type { UITree, UINode, BindingSource } from "@frontend/ui/domain/code-generator2/types/types";

import taptapButton from "../fixtures/button/taptapButton.json";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";

function makeTree(root: UINode, extra: Partial<UITree> = {}): UITree {
  return { root, props: [], ...extra };
}

describe("SemanticIRBuilder", () => {
  describe("kind mapping", () => {
    const kinds: Array<UINode["type"]> = [
      "container", "text", "image", "vector",
      "button", "input", "link", "slot", "component",
    ];

    for (const kind of kinds) {
      it(`maps UINodeType "${kind}" to SemanticNodeKind "${kind}"`, () => {
        const node = { id: "n1", name: "x", type: kind, children: [] } as unknown as UINode;
        const ir = SemanticIRBuilder.build(makeTree(node));
        expect(ir.structure.kind).toBe(kind);
      });
    }
  });

  describe("event/attrs split", () => {
    function nodeWithBindings(attrs: Record<string, BindingSource>): UINode {
      return {
        id: "n1", name: "x", type: "container", children: [],
        bindings: { attrs },
      } as unknown as UINode;
    }

    it("moves onClick to events", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        onClick: { prop: "onClick" },
      })));
      expect(ir.structure.events).toEqual({ onClick: { prop: "onClick" } });
      expect(ir.structure.attrs).toBeUndefined();
    });

    it("keeps non-event keys in attrs", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        type: { prop: "type" },
        placeholder: { prop: "placeholder" },
      })));
      expect(ir.structure.attrs).toEqual({
        type: { prop: "type" },
        placeholder: { prop: "placeholder" },
      });
      expect(ir.structure.events).toBeUndefined();
    });

    it("splits mixed attrs and events", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        type: { prop: "type" },
        onChange: { prop: "onChange" },
        onClick: { prop: "onClick" },
      })));
      expect(ir.structure.attrs).toEqual({ type: { prop: "type" } });
      expect(ir.structure.events).toEqual({
        onChange: { prop: "onChange" },
        onClick: { prop: "onClick" },
      });
    });

    it("leaves unknown on* keys in attrs", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        onCustomThing: { prop: "x" },
      })));
      expect(ir.structure.attrs).toEqual({ onCustomThing: { prop: "x" } });
      expect(ir.structure.events).toBeUndefined();
    });

    it("undefined bindings yields undefined attrs/events", () => {
      const node = { id: "n1", name: "x", type: "container", children: [] } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.attrs).toBeUndefined();
      expect(ir.structure.events).toBeUndefined();
    });
  });

  describe("state normalization", () => {
    it("removes setter field", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { stateVars: [{ name: "open", setter: "setOpen", initialValue: "false" }] }
      ));
      expect(ir.state).toEqual([
        { name: "open", initialValue: "false", mutability: "mutable" },
      ]);
      expect((ir.state[0] as any).setter).toBeUndefined();
    });

    it("undefined stateVars becomes empty array", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
      ));
      expect(ir.state).toEqual([]);
    });
  });

  describe("pass-through fields", () => {
    it("passes styles by reference (no mutation, identity preserved)", () => {
      const styles = { base: { color: "red" }, dynamic: [] } as any;
      const node = {
        id: "n", name: "x", type: "container", children: [], styles,
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.styles).toBe(styles);
    });

    it("passes bindings.style as styleBindings", () => {
      const node = {
        id: "n", name: "x", type: "container", children: [],
        bindings: { style: { background: { prop: "bg" } } },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.styleBindings).toEqual({ background: { prop: "bg" } });
    });

    it("passes content binding", () => {
      const node = {
        id: "n", name: "x", type: "text", children: [],
        bindings: { content: { prop: "label" } },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.content).toEqual({ prop: "label" });
    });

    it("passes visibleCondition unchanged", () => {
      const cond = { type: "eq", prop: "size", value: "lg" } as any;
      const node = {
        id: "n", name: "x", type: "container", children: [],
        visibleCondition: cond,
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.visibleCondition).toBe(cond);
    });

    it("recurses into children", () => {
      const child = { id: "c", name: "y", type: "text", children: [] } as unknown as UINode;
      const root = { id: "r", name: "x", type: "container", children: [child] } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(root));
      expect(ir.structure.children).toHaveLength(1);
      expect(ir.structure.children![0].id).toBe("c");
      expect(ir.structure.children![0].kind).toBe("text");
    });
  });

  describe("component meta", () => {
    it("passes props array by reference", () => {
      const props = [{ name: "size", type: "variant", required: false, sourceKey: "Size", options: ["sm","lg"] }] as any;
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { props }
      ));
      expect(ir.props).toBe(props);
    });

    it("passes arraySlots", () => {
      const arraySlots = [{ parentId: "p", nodeIds: ["a","b"], slotName: "items" }] as any;
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { arraySlots }
      ));
      expect(ir.arraySlots).toBe(arraySlots);
    });

    it("passes componentType and isDependency", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { componentType: "button", isDependency: true }
      ));
      expect(ir.componentType).toBe("button");
      expect(ir.isDependency).toBe(true);
    });

    it("passes derivedVars as derived", () => {
      const dv = [{ name: "state", expression: "checked ? \"On\" : \"Off\"" }];
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { derivedVars: dv }
      ));
      expect(ir.derived).toBe(dv);
    });
  });

  describe("mutation prevention", () => {
    it("does not mutate the input UITree", () => {
      const uiTree = makeTree(
        {
          id: "n", name: "x", type: "container",
          bindings: { attrs: { onClick: { prop: "onClick" }, type: { prop: "type" } } },
          children: [
            { id: "c1", name: "y", type: "text", children: [] } as any,
          ],
        } as unknown as UINode,
        {
          props: [{ name: "size", type: "variant", required: false, sourceKey: "Size", options: ["sm"] }] as any,
          stateVars: [{ name: "open", setter: "setOpen", initialValue: "false" }],
        }
      );
      const snapshot = JSON.parse(JSON.stringify(uiTree));
      SemanticIRBuilder.build(uiTree);
      expect(JSON.parse(JSON.stringify(uiTree))).toEqual(snapshot);
    });
  });

  describe("edge cases", () => {
    it("handles empty children array", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
      ));
      expect(ir.structure.children).toEqual([]);
    });

    it("handles deeply nested trees", () => {
      const leaf = { id: "leaf", name: "l", type: "text", children: [] } as any;
      const mk = (depth: number, child: any): any =>
        depth === 0 ? child : mk(depth - 1, { id: `n${depth}`, name: "x", type: "container", children: [child] });
      const root = mk(5, leaf);
      const ir = SemanticIRBuilder.build(makeTree(root));
      let cur: any = ir.structure;
      for (let i = 0; i < 5; i++) cur = cur.children?.[0];
      expect(cur.kind).toBe("text");
    });

    it("handles undefined bindings", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
      ));
      expect(ir.structure.attrs).toBeUndefined();
      expect(ir.structure.events).toBeUndefined();
      expect(ir.structure.content).toBeUndefined();
    });
  });

  describe("fixture round-trip", () => {
    it("builds an IR from a real fixture without throwing and preserves component name", () => {
      const dm = new DataManager(taptapButton as any);
      const tb = new TreeBuilder(dm);
      const uiTree = tb.build((taptapButton as any).info.document);

      const ir = SemanticIRBuilder.build(uiTree);

      expect(ir.name).toBeTruthy();
      expect(ir.structure).toBeDefined();
      expect(ir.props).toBe(uiTree.props);
    });
  });

  describe("kind-specific pass-through fields", () => {
    it("passes vectorSvg and variantSvgs on a vector node", () => {
      const node = {
        id: "v", name: "icon", type: "vector", children: [],
        vectorSvg: "<svg>...</svg>",
        variantSvgs: { Default: "<svg>a</svg>", Hover: "<svg>b</svg>" },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.vectorSvg).toBe("<svg>...</svg>");
      expect(ir.structure.variantSvgs).toEqual({ Default: "<svg>a</svg>", Hover: "<svg>b</svg>" });
    });

    it("passes refId, overrideProps, overrideMeta, instanceScale on a component node", () => {
      const node = {
        id: "c", name: "Button", type: "component", children: [],
        refId: "692:1613",
        overrideProps: { label: "Click me" },
        overrideMeta: [{ propName: "label", propType: "string", nodeId: "n", nodeName: "lbl", value: "Click me" }],
        instanceScale: 0.5,
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.refId).toBe("692:1613");
      expect(ir.structure.overrideProps).toEqual({ label: "Click me" });
      expect(ir.structure.overrideMeta).toHaveLength(1);
      expect(ir.structure.instanceScale).toBe(0.5);
    });

    it("passes loop and childrenSlot on a container node", () => {
      const node = {
        id: "ct", name: "list", type: "container", children: [],
        loop: { dataProp: "items", keyField: "id" },
        childrenSlot: "children",
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.loop).toEqual({ dataProp: "items", keyField: "id" });
      expect(ir.structure.childrenSlot).toBe("children");
    });

    it("passes semanticType on any node", () => {
      const node = {
        id: "n", name: "x", type: "container", children: [],
        semanticType: "search-input",
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.semanticType).toBe("search-input");
    });
  });

  describe("StyleObject subfields pass-through", () => {
    it("passes a StyleObject with base, dynamic, pseudo, mediaQueries, itemVariant subfields", () => {
      const styles = {
        base: { color: "red", padding: "8px" },
        dynamic: [
          { condition: { type: "eq", prop: "size", value: "lg" }, style: { fontSize: "16px" } },
        ],
        pseudo: { ":hover": { color: "blue" } },
        mediaQueries: [{ query: "(max-width: 767px)", style: { display: "none" } }],
        itemVariant: { true: { fontWeight: "bold" }, false: { fontWeight: "normal" } },
      } as any;
      const node = { id: "n", name: "x", type: "container", children: [], styles } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.styles).toBe(styles);
    });
  });

  describe("BindingSource variant pass-through", () => {
    it("passes ref binding in attrs", () => {
      const node = {
        id: "n", name: "x", type: "container", children: [],
        bindings: { attrs: { "data-x": { ref: "Constants.MAX" } } },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.attrs).toEqual({ "data-x": { ref: "Constants.MAX" } });
    });

    it("passes expr binding in attrs", () => {
      const node = {
        id: "n", name: "x", type: "container", children: [],
        bindings: { attrs: { value: { expr: "checked && !disabled" } } },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.attrs).toEqual({ value: { expr: "checked && !disabled" } });
    });
  });

  describe("ConditionNode variant pass-through", () => {
    it("passes neq condition", () => {
      const cond = { type: "neq", prop: "size", value: "lg" } as any;
      const node = { id: "n", name: "x", type: "container", children: [], visibleCondition: cond } as unknown as UINode;
      expect(SemanticIRBuilder.build(makeTree(node)).structure.visibleCondition).toBe(cond);
    });

    it("passes truthy condition", () => {
      const cond = { type: "truthy", prop: "show" } as any;
      const node = { id: "n", name: "x", type: "container", children: [], visibleCondition: cond } as unknown as UINode;
      expect(SemanticIRBuilder.build(makeTree(node)).structure.visibleCondition).toBe(cond);
    });

    it("passes and condition", () => {
      const cond = { type: "and", conditions: [{ type: "truthy", prop: "a" }, { type: "truthy", prop: "b" }] } as any;
      const node = { id: "n", name: "x", type: "container", children: [], visibleCondition: cond } as unknown as UINode;
      expect(SemanticIRBuilder.build(makeTree(node)).structure.visibleCondition).toBe(cond);
    });

    it("passes or condition", () => {
      const cond = { type: "or", conditions: [{ type: "truthy", prop: "a" }, { type: "truthy", prop: "b" }] } as any;
      const node = { id: "n", name: "x", type: "container", children: [], visibleCondition: cond } as unknown as UINode;
      expect(SemanticIRBuilder.build(makeTree(node)).structure.visibleCondition).toBe(cond);
    });

    it("passes not condition", () => {
      const cond = { type: "not", condition: { type: "truthy", prop: "disabled" } } as any;
      const node = { id: "n", name: "x", type: "container", children: [], visibleCondition: cond } as unknown as UINode;
      expect(SemanticIRBuilder.build(makeTree(node)).structure.visibleCondition).toBe(cond);
    });
  });
});
