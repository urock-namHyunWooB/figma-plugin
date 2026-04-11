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
});
