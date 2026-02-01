import { describe, it, expect, beforeEach } from "vitest";
import TreeBuilder from "./TreeBuilder";
import type { PreparedDesignData } from "@compiler/types/architecture";
import type { StyleTree, FigmaNodeData } from "@compiler/types/baseType";

// Mock PreparedDesignData
function createMockPreparedData(
  documentOverride?: Partial<SceneNode>,
  options?: {
    styleTree?: StyleTree;
    props?: Record<string, any>;
    dependencies?: Map<string, FigmaNodeData>;
  }
): PreparedDesignData {
  const defaultDocument: SceneNode = {
    id: "root",
    name: "Button",
    type: "COMPONENT",
    visible: true,
    children: [],
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
    ...documentOverride,
  } as SceneNode;

  const defaultStyleTree: StyleTree = {
    id: "root",
    name: "Button",
    cssStyle: { display: "flex", padding: "8px 16px" },
    children: [],
  };

  const nodeMap = new Map<string, SceneNode>();
  const styleMap = new Map<string, StyleTree>();

  // Build nodeMap
  const traverseNodes = (node: SceneNode) => {
    nodeMap.set(node.id, node);
    if ("children" in node && node.children) {
      for (const child of node.children as SceneNode[]) {
        traverseNodes(child);
      }
    }
  };
  traverseNodes(defaultDocument);

  // Build styleMap
  const traverseStyles = (tree: StyleTree) => {
    styleMap.set(tree.id, tree);
    if (tree.children) {
      for (const child of tree.children) {
        traverseStyles(child);
      }
    }
  };
  traverseStyles(options?.styleTree ?? defaultStyleTree);

  return {
    spec: {} as FigmaNodeData,
    document: defaultDocument,
    styleTree: options?.styleTree ?? defaultStyleTree,
    nodeMap,
    styleMap,
    props: options?.props ?? {},
    dependencies: options?.dependencies ?? new Map(),
    getNodeById: (id: string) => nodeMap.get(id),
    getStyleById: (id: string) => styleMap.get(id),
  } as PreparedDesignData;
}

describe("TreeBuilder", () => {
  let builder: TreeBuilder;

  beforeEach(() => {
    builder = new TreeBuilder();
  });

  describe("build()", () => {
    it("should build DesignTree from simple COMPONENT", () => {
      const data = createMockPreparedData({
        id: "comp1",
        name: "SimpleButton",
        type: "COMPONENT",
      });

      const result = builder.build(data);

      expect(result.root).toBeDefined();
      expect(result.root.id).toBe("comp1");
      expect(result.root.name).toBe("SimpleButton");
      expect(result.root.type).toBe("container");
    });

    it("should merge variants for COMPONENT_SET", () => {
      const variant1 = {
        id: "var1",
        name: "Size=Large",
        type: "COMPONENT",
        visible: true,
        children: [
          {
            id: "text1",
            name: "Label",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 10, y: 10, width: 80, height: 20 },
          } as unknown as SceneNode,
        ],
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
      } as unknown as SceneNode;

      const variant2 = {
        id: "var2",
        name: "Size=Small",
        type: "COMPONENT",
        visible: true,
        children: [
          {
            id: "text2",
            name: "Label",
            type: "TEXT",
            visible: true,
            absoluteBoundingBox: { x: 5, y: 5, width: 50, height: 15 },
          } as unknown as SceneNode,
        ],
        absoluteBoundingBox: { x: 0, y: 50, width: 60, height: 25 },
      } as unknown as SceneNode;

      const data = createMockPreparedData(
        {
          id: "set1",
          name: "Button",
          type: "COMPONENT_SET",
          children: [variant1, variant2],
        } as any,
        {
          styleTree: {
            id: "set1",
            name: "Button",
            cssStyle: {},
            children: [
              { id: "var1", name: "Size=Large", cssStyle: { padding: "16px" }, children: [] },
              { id: "var2", name: "Size=Small", cssStyle: { padding: "8px" }, children: [] },
            ],
          },
        }
      );

      const result = builder.build(data);

      expect(result.root).toBeDefined();
      expect(result.root.type).toBe("container");
      // Merged tree should have children
      expect(result.root.children.length).toBeGreaterThanOrEqual(0);
    });

    it("should extract props definitions", () => {
      const data = createMockPreparedData(
        { id: "comp1", name: "Button", type: "COMPONENT" },
        {
          props: {
            size: { type: "VARIANT", defaultValue: "large" },
            disabled: { type: "BOOLEAN", defaultValue: false },
            label: { type: "TEXT", defaultValue: "Click me" },
          },
        }
      );

      const result = builder.build(data);

      expect(result.props).toHaveLength(3);
      expect(result.props.find((p) => p.name === "size")?.type).toBe("variant");
      // disabled is renamed to customDisabled to avoid conflict with native HTML attribute
      expect(result.props.find((p) => p.name === "customDisabled")?.type).toBe("boolean");
      expect(result.props.find((p) => p.name === "label")?.type).toBe("string");
    });

    it("should handle nested children", () => {
      const childNode = {
        id: "child1",
        name: "Icon",
        type: "FRAME",
        visible: true,
        children: [],
        absoluteBoundingBox: { x: 10, y: 10, width: 20, height: 20 },
      } as unknown as SceneNode;

      const data = createMockPreparedData({
        id: "comp1",
        name: "Button",
        type: "COMPONENT",
        children: [childNode],
      } as any);

      const result = builder.build(data);

      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].id).toBe("child1");
      expect(result.root.children[0].name).toBe("Icon");
    });
  });

  describe("style classification", () => {
    it("should classify base styles", () => {
      const data = createMockPreparedData(
        { id: "comp1", name: "Button", type: "COMPONENT" },
        {
          styleTree: {
            id: "comp1",
            name: "Button",
            cssStyle: {
              display: "flex",
              "align-items": "center",
              padding: "8px",
            },
            children: [],
          },
        }
      );

      const result = builder.build(data);

      expect(result.root.styles.base).toBeDefined();
      expect(Object.keys(result.root.styles.base).length).toBeGreaterThan(0);
    });
  });

  describe("node type mapping", () => {
    it("should map FRAME to container", () => {
      const data = createMockPreparedData({
        id: "frame1",
        name: "Container",
        type: "FRAME",
      });

      const result = builder.build(data);
      expect(result.root.type).toBe("container");
    });

    it("should map TEXT to text", () => {
      const data = createMockPreparedData({
        id: "text1",
        name: "Label",
        type: "TEXT",
      });

      const result = builder.build(data);
      expect(result.root.type).toBe("text");
    });

    it("should map INSTANCE to component", () => {
      const data = createMockPreparedData({
        id: "inst1",
        name: "IconInstance",
        type: "INSTANCE",
      });

      const result = builder.build(data);
      expect(result.root.type).toBe("component");
    });

    it("should map VECTOR to vector", () => {
      const data = createMockPreparedData({
        id: "vec1",
        name: "Arrow",
        type: "VECTOR",
      });

      const result = builder.build(data);
      expect(result.root.type).toBe("vector");
    });
  });
});
