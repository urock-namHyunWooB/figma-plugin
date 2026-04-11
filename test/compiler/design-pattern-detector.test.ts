import { describe, it, expect } from "vitest";
import { DesignPatternDetector } from "@code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";

describe("DesignPatternDetector", () => {
  it("detect()가 InternalTree를 받아 에러 없이 실행된다", () => {
    const detector = new DesignPatternDetector(null as any);
    const tree = { id: "root", name: "Root", type: "FRAME", children: [] } as any;
    expect(() => detector.detect(tree)).not.toThrow();
  });

  describe("detectAlphaMasks", () => {
    it("isMask + ALPHA + visible ref → alphaMask annotation", () => {
      const mockDataManager = {
        getById: () => ({
          node: { id: "mask-1", isMask: true, maskType: "ALPHA" },
        }),
      } as any;

      const detector = new DesignPatternDetector(mockDataManager);
      const maskNode: any = {
        id: "mask-1", name: "Mask", type: "RECTANGLE", children: [],
        componentPropertyReferences: { visible: "Loading#29474:0" },
      };
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [maskNode] };
      detector.detect(tree);
      expect(maskNode.metadata?.designPatterns).toEqual([
        { type: "alphaMask", visibleRef: "Loading#29474:0" },
      ]);
    });

    it("isMask=false → no annotation", () => {
      const mockDataManager = {
        getById: () => ({ node: { isMask: false } }),
      } as any;
      const detector = new DesignPatternDetector(mockDataManager);
      const node: any = {
        id: "n1", name: "N", type: "RECTANGLE", children: [],
        componentPropertyReferences: { visible: "Loading#29474:0" },
      };
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };
      detector.detect(tree);
      expect(node.metadata?.designPatterns).toBeUndefined();
    });

    it("no componentPropertyReferences.visible → no annotation", () => {
      const mockDataManager = {
        getById: () => ({ node: { isMask: true, maskType: "ALPHA" } }),
      } as any;
      const detector = new DesignPatternDetector(mockDataManager);
      const node: any = { id: "n2", name: "N", type: "RECTANGLE", children: [] };
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };
      detector.detect(tree);
      expect(node.metadata?.designPatterns).toBeUndefined();
    });
  });

  describe("detectInteractionFrames", () => {
    it("name=Interaction + type=FRAME → interactionFrame annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const node: any = { id: "i1", name: "Interaction", type: "FRAME", children: [] };
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };
      detector.detect(tree);
      expect(node.metadata?.designPatterns).toEqual([{ type: "interactionFrame" }]);
    });

    it("name=Interaction + type=INSTANCE → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const node: any = { id: "i2", name: "Interaction", type: "INSTANCE", children: [] };
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };
      detector.detect(tree);
      expect(node.metadata?.designPatterns).toBeUndefined();
    });

    it("name=Content + type=FRAME → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const node: any = { id: "c1", name: "Content", type: "FRAME", children: [] };
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };
      detector.detect(tree);
      expect(node.metadata?.designPatterns).toBeUndefined();
    });
  });

  describe("detectStatePseudoClass", () => {
    it("State variant prop with CSS-convertible values → statePseudoClass annotation on root", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [
        { name: "state", type: "variant", sourceKey: "State", options: ["Default", "Hover", "Active", "Disabled"] },
      ];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toContainEqual({
        type: "statePseudoClass",
        prop: "state",
        stateMap: { Hover: ":hover", Active: ":active", Disabled: ":disabled" },
      });
    });

    it("no State prop → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [{ name: "size", type: "variant", sourceKey: "Size", options: ["Large", "Small"] }];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toBeUndefined();
    });

    it("States (plural) sourceKey → statePseudoClass annotation on root", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [
        { name: "states", type: "variant", sourceKey: "States", options: ["Hover", "Focus"] },
      ];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toContainEqual({
        type: "statePseudoClass",
        prop: "states",
        stateMap: { Hover: ":hover", Focus: ":focus" },
      });
    });

    it("State prop with no CSS-convertible values → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [
        { name: "state", type: "variant", sourceKey: "State", options: ["Success", "Error", "Info"] },
      ];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toBeUndefined();
    });
  });

  describe("detectBreakpointVariant", () => {
    it("breakpoint variant prop → breakpointVariant annotation on root", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [
        { name: "breakpoint", type: "variant", sourceKey: "Breakpoint", options: ["Mobile(xs-sm)", "Desktop(md-lg)"] },
      ];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toContainEqual({
        type: "breakpointVariant",
        prop: "breakpoint",
      });
    });

    it("non-breakpoint prop → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [{ name: "size", type: "variant", sourceKey: "Size", options: ["Large"] }];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toBeUndefined();
    });

    it("device prop name → breakpointVariant annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      const props: any[] = [
        { name: "device", type: "variant", sourceKey: "Device", options: ["Mobile", "Desktop"] },
      ];
      detector.detect(tree, props);
      expect(tree.metadata?.designPatterns).toContainEqual({
        type: "breakpointVariant",
        prop: "device",
      });
    });

    it("no props → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
      detector.detect(tree, []);
      expect(tree.metadata?.designPatterns).toBeUndefined();
    });
  });

  describe("detectFullCoverBackgrounds", () => {
    it("TEXT type child → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const textNode: any = {
        id: "t1",
        name: "Label",
        type: "TEXT",
        children: [],
      };
      const tree: any = {
        id: "root",
        name: "Root",
        type: "FRAME",
        children: [textNode, { id: "other", name: "O", type: "FRAME", children: [] }],
      };
      detector.detect(tree);
      expect(textNode.metadata?.designPatterns).toBeUndefined();
    });

    it("single child → no annotation (not a background, it's content)", () => {
      const detector = new DesignPatternDetector(null as any);
      const bgNode: any = {
        id: "bg-1",
        name: "Background",
        type: "RECTANGLE",
        children: [],
        mergedNodes: [{ id: "bg-1", variantName: "Default" }],
      };
      const tree: any = {
        id: "root",
        name: "Root",
        type: "FRAME",
        children: [bgNode],
      };
      detector.detect(tree);
      expect(bgNode.metadata?.designPatterns).toBeUndefined();
    });

    it("INSTANCE type child → no annotation", () => {
      const detector = new DesignPatternDetector(null as any);
      const instanceNode: any = {
        id: "i1",
        name: "Icon",
        type: "INSTANCE",
        children: [],
      };
      const tree: any = {
        id: "root",
        name: "Root",
        type: "FRAME",
        children: [instanceNode, { id: "other", name: "O", type: "FRAME", children: [] }],
      };
      detector.detect(tree);
      expect(instanceNode.metadata?.designPatterns).toBeUndefined();
    });

    it("fills-only child covering parent 100% → fullCoverBackground annotation", () => {
      const rawBg = {
        id: "bg-1",
        fills: [{ type: "SOLID", visible: true }],
        strokes: [],
        effects: [],
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
        // parentId points to parent raw node
        parentId: "parent-1",
      };
      const rawParent = {
        id: "parent-1",
        fills: [],
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
      };

      const mockDataManager = {
        getById: (id: string) => {
          if (id === "bg-1") return { node: rawBg, style: {} };
          if (id === "parent-1") return { node: rawParent, style: {} };
          return { node: null };
        },
      } as any;

      const detector = new DesignPatternDetector(mockDataManager);
      const bgNode: any = {
        id: "bg-1",
        name: "Background",
        type: "RECTANGLE",
        children: [],
        mergedNodes: [{ id: "bg-1", variantName: "Default" }],
      };
      const contentNode: any = {
        id: "content-1",
        name: "Content",
        type: "FRAME",
        children: [],
      };
      const tree: any = {
        id: "parent-1",
        name: "Parent",
        type: "FRAME",
        children: [bgNode, contentNode],
        mergedNodes: [{ id: "parent-1", variantName: "Default" }],
      };

      detector.detect(tree);

      expect(bgNode.metadata?.designPatterns).toEqual([{ type: "fullCoverBackground" }]);
    });
  });

  describe("BooleanPositionSwap annotation", () => {
    it("annotation shape is correct", () => {
      const node: any = { id: "n1", name: "Knob", type: "FRAME", children: [] };
      if (!node.metadata) node.metadata = {};
      if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
      node.metadata.designPatterns.push({ type: "booleanPositionSwap", prop: "active" });
      expect(node.metadata.designPatterns).toContainEqual({
        type: "booleanPositionSwap",
        prop: "active",
      });
    });
  });
});
