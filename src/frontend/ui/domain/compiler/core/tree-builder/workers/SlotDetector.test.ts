import { describe, it, expect } from "vitest";
import { SlotProcessor } from "./SlotProcessor";

const processor = new SlotProcessor();

describe("SlotDetector", () => {
  describe("processor.shouldConvertToSlot()", () => {
    it("should return true for INSTANCE with visible BOOLEAN binding", () => {
      expect(processor.shouldConvertToSlot("INSTANCE", "showIcon#123", "BOOLEAN")).toBe(true);
    });

    it("should return true for INSTANCE_SWAP prop", () => {
      expect(processor.shouldConvertToSlot("FRAME", undefined, "INSTANCE_SWAP")).toBe(true);
    });

    it("should return false for INSTANCE without prop binding", () => {
      expect(processor.shouldConvertToSlot("INSTANCE", undefined, undefined)).toBe(false);
    });

    it("should return false for non-INSTANCE with visible binding", () => {
      expect(processor.shouldConvertToSlot("FRAME", "visible#123", "BOOLEAN")).toBe(false);
    });
  });

  describe("processor.extractSlotDefinition()", () => {
    it("should create slot definition from prop name", () => {
      const result = processor.extractSlotDefinition("node1", "IconInstance", "showIcon");

      expect(result.name).toBe("icon");
      expect(result.targetNodeId).toBe("node1");
    });

    it("should handle hasPrefix in prop name", () => {
      const result = processor.extractSlotDefinition("node1", "LabelText", "hasLabel");

      expect(result.name).toBe("label");
    });

    it("should use node name when prop name is missing", () => {
      const result = processor.extractSlotDefinition("node1", "My Icon", "");

      expect(result.name).toBe("myIcon");
    });
  });

  describe("processor.detectArraySlot()", () => {
    it("should detect array slot when multiple INSTANCES reference same component", () => {
      const children = [
        { id: "inst1", name: "Item 1", type: "INSTANCE", componentId: "comp1" },
        { id: "inst2", name: "Item 2", type: "INSTANCE", componentId: "comp1" },
        { id: "inst3", name: "Item 3", type: "INSTANCE", componentId: "comp1" },
      ];

      const result = processor.detectArraySlot(children);

      expect(result).not.toBeNull();
      expect(result!.nodeIds).toHaveLength(3);
      expect(result!.itemType).toBe("comp1");
    });

    it("should return null when less than 2 instances", () => {
      const children = [
        { id: "inst1", name: "Item 1", type: "INSTANCE", componentId: "comp1" },
      ];

      const result = processor.detectArraySlot(children);

      expect(result).toBeNull();
    });

    it("should return null when instances reference different components", () => {
      const children = [
        { id: "inst1", name: "Item 1", type: "INSTANCE", componentId: "comp1" },
        { id: "inst2", name: "Item 2", type: "INSTANCE", componentId: "comp2" },
      ];

      const result = processor.detectArraySlot(children);

      expect(result).toBeNull();
    });

    it("should return null when no INSTANCE children", () => {
      const children = [
        { id: "frame1", name: "Frame 1", type: "FRAME" },
        { id: "frame2", name: "Frame 2", type: "FRAME" },
      ];

      const result = processor.detectArraySlot(children);

      expect(result).toBeNull();
    });
  });

  describe("processor.findSlotCandidates()", () => {
    it("should find INSTANCE with BOOLEAN visible binding", () => {
      const nodes = [
        {
          id: "inst1",
          name: "Icon",
          type: "INSTANCE",
          componentPropertyReferences: { visible: "showIcon" },
        },
      ];

      const propsDefinitions = {
        showIcon: { type: "BOOLEAN" },
      };

      const result = processor.findSlotCandidates(nodes, propsDefinitions);

      expect(result).toHaveLength(1);
      expect(result[0].propType).toBe("boolean");
    });

    it("should find node with INSTANCE_SWAP binding", () => {
      const nodes = [
        {
          id: "inst1",
          name: "Icon",
          type: "INSTANCE",
          componentPropertyReferences: { mainComponent: "iconSwap" },
        },
      ];

      const propsDefinitions = {
        iconSwap: { type: "INSTANCE_SWAP" },
      };

      const result = processor.findSlotCandidates(nodes, propsDefinitions);

      expect(result).toHaveLength(1);
      expect(result[0].propType).toBe("instance_swap");
    });

    it("should return empty array when no slot candidates", () => {
      const nodes = [
        { id: "frame1", name: "Frame", type: "FRAME" },
      ];

      const result = processor.findSlotCandidates(nodes, {});

      expect(result).toHaveLength(0);
    });
  });

  describe("shouldBeTextSlot()", () => {
    const createMockData = (nodes: Record<string, any> = {}) => ({
      getNodeById: (id: string) => nodes[id] || null,
    } as any);

    it("should return true when TEXT exists in fewer variants than total", () => {
      const data = createMockData({
        text1: { characters: "Hello" },
        text2: { characters: "Hello" },
      });

      // 3 variants total, but TEXT only in 2
      const result = processor.shouldBeTextSlot(["text1", "text2"], 3, data);

      expect(result).toBe(true);
    });

    it("should return true when characters differ across variants", () => {
      const data = createMockData({
        text1: { characters: "Hello" },
        text2: { characters: "World" },
      });

      const result = processor.shouldBeTextSlot(["text1", "text2"], 2, data);

      expect(result).toBe(true);
    });

    it("should return false when characters are same across variants", () => {
      const data = createMockData({
        text1: { characters: "Same Text" },
        text2: { characters: "Same Text" },
      });

      const result = processor.shouldBeTextSlot(["text1", "text2"], 2, data);

      expect(result).toBe(false);
    });

    it("should return false for single variant", () => {
      const data = createMockData({
        text1: { characters: "Hello" },
      });

      const result = processor.shouldBeTextSlot(["text1"], 1, data);

      expect(result).toBe(false);
    });
  });
});
