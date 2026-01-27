import { describe, it, expect } from "vitest";
import { InstanceProcessor } from "./InstanceProcessor";

const processor = new InstanceProcessor();

describe("InstanceOverrideHandler", () => {
  describe("processor.getOriginalId()", () => {
    it("should extract original ID from INSTANCE child ID", () => {
      expect(processor.getOriginalId("I704:56;704:29;692:1613")).toBe("692:1613");
      expect(processor.getOriginalId("I123:456;789:012")).toBe("789:012");
    });

    it("should return same ID if not INSTANCE child", () => {
      expect(processor.getOriginalId("123:456")).toBe("123:456");
      expect(processor.getOriginalId("simple-id")).toBe("simple-id");
    });

    it("should handle single segment INSTANCE ID (no semicolon)", () => {
      // 세미콜론이 없는 단일 세그먼트는 그대로 반환됨 (레거시 동작)
      expect(processor.getOriginalId("I123:456")).toBe("I123:456");
    });
  });

  describe("processor.isInstanceChildId()", () => {
    it("should return true for INSTANCE child IDs", () => {
      expect(processor.isInstanceChildId("I704:56;704:29;692:1613")).toBe(true);
      expect(processor.isInstanceChildId("I123:456")).toBe(true);
    });

    it("should return false for regular IDs", () => {
      expect(processor.isInstanceChildId("123:456")).toBe(false);
      expect(processor.isInstanceChildId("simple-id")).toBe(false);
    });
  });

  describe("processor.extractOverrides()", () => {
    it("should extract character overrides", () => {
      const instanceChildren = [
        { id: "I1;100:1", characters: "New Text", children: [] },
      ];
      const originalChildren = [
        { id: "100:1", characters: "Original Text", children: [] },
      ];

      const result = processor.extractOverrides(instanceChildren, originalChildren);

      expect(result).toHaveLength(1);
      expect(result[0].overrides.characters).toBe("New Text");
    });

    it("should extract visible overrides", () => {
      const instanceChildren = [
        { id: "I1;100:1", visible: false, children: [] },
      ];
      const originalChildren = [
        { id: "100:1", visible: true, children: [] },
      ];

      const result = processor.extractOverrides(instanceChildren, originalChildren);

      expect(result).toHaveLength(1);
      expect(result[0].overrides.visible).toBe(false);
    });

    it("should extract fills overrides", () => {
      const instanceChildren = [
        {
          id: "I1;100:1",
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
          children: [],
        },
      ];
      const originalChildren = [
        {
          id: "100:1",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }],
          children: [],
        },
      ];

      const result = processor.extractOverrides(instanceChildren, originalChildren);

      expect(result).toHaveLength(1);
      expect(result[0].overrides.fills).toBeDefined();
    });

    it("should not extract when values are same", () => {
      const instanceChildren = [
        { id: "I1;100:1", characters: "Same Text", children: [] },
      ];
      const originalChildren = [
        { id: "100:1", characters: "Same Text", children: [] },
      ];

      const result = processor.extractOverrides(instanceChildren, originalChildren);

      expect(result).toHaveLength(0);
    });

    it("should handle nested children", () => {
      const instanceChildren = [
        {
          id: "I1;100:1",
          children: [{ id: "I1;100:2", characters: "Nested New", children: [] }],
        },
      ];
      const originalChildren = [
        {
          id: "100:1",
          children: [{ id: "100:2", characters: "Nested Original", children: [] }],
        },
      ];

      const result = processor.extractOverrides(instanceChildren, originalChildren);

      expect(result).toHaveLength(1);
      expect(result[0].originalId).toBe("100:2");
    });
  });

  describe("processor.mergeOverridesToOriginal()", () => {
    it("should merge character overrides", () => {
      const originalChildren = [
        { id: "100:1", characters: "Original", children: [] },
      ];
      const instanceChildren = [
        { id: "I1;100:1", characters: "Override", children: [] },
      ];

      const result = processor.mergeOverridesToOriginal(originalChildren, instanceChildren);

      expect(result[0].id).toBe("100:1"); // 원본 ID 유지
      expect(result[0].characters).toBe("Override"); // override 적용
    });

    it("should keep original ID while applying override", () => {
      const originalChildren = [
        { id: "100:1", visible: true, children: [] },
      ];
      const instanceChildren = [
        { id: "I1;100:1", visible: false, children: [] },
      ];

      const result = processor.mergeOverridesToOriginal(originalChildren, instanceChildren);

      expect(result[0].id).toBe("100:1");
      expect(result[0].visible).toBe(false);
    });

    it("should handle nested children merge", () => {
      const originalChildren = [
        {
          id: "100:1",
          children: [{ id: "100:2", characters: "Nested Original", children: [] }],
        },
      ];
      const instanceChildren = [
        {
          id: "I1;100:1",
          children: [{ id: "I1;100:2", characters: "Nested Override", children: [] }],
        },
      ];

      const result = processor.mergeOverridesToOriginal(originalChildren, instanceChildren);

      expect(result[0].children[0].id).toBe("100:2");
      expect(result[0].children[0].characters).toBe("Nested Override");
    });
  });

  describe("processor.extractOverrideProps()", () => {
    it("should extract fills as Bg prop", () => {
      const instanceNode = {
        children: [
          {
            id: "I1;100:1",
            name: "Rectangle",
            fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
            children: [],
          },
        ],
      };
      const originalChildren = [
        {
          id: "100:1",
          name: "Rectangle",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } }],
          children: [],
        },
      ];

      const result = processor.extractOverrideProps(instanceNode, originalChildren);

      expect(result["rectangleBg"]).toBe("#FF0000");
    });

    it("should extract characters as Text prop", () => {
      const instanceNode = {
        children: [
          { id: "I1;100:1", name: "Label", characters: "New Text", children: [] },
        ],
      };
      const originalChildren = [
        { id: "100:1", name: "Label", characters: "Original", children: [] },
      ];

      const result = processor.extractOverrideProps(instanceNode, originalChildren);

      expect(result["labelText"]).toBe("New Text");
    });

    it("should handle rgba colors", () => {
      const instanceNode = {
        children: [
          {
            id: "I1;100:1",
            name: "Box",
            fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 0.5 } }],
            children: [],
          },
        ],
      };
      const originalChildren = [
        {
          id: "100:1",
          name: "Box",
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } }],
          children: [],
        },
      ];

      const result = processor.extractOverrideProps(instanceNode, originalChildren);

      expect(result["boxBg"]).toBe("rgba(255, 0, 0, 0.5)");
    });
  });
});
