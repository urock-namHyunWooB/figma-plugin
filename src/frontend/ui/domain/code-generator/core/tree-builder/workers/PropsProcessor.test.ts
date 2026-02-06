import { describe, it, expect } from "vitest";
import { PropsProcessor } from "./PropsProcessor";
import type { PropDefinition } from "@code-generator/types/architecture";

const processor = new PropsProcessor();

describe("PropsProcessor", () => {
  describe("linkProps()", () => {
    it("should return empty object for undefined refs", () => {
      const propsMap = new Map<string, PropDefinition>();

      const result = processor.linkProps(undefined, propsMap);

      expect(result).toEqual({});
    });

    it("should return empty object for empty refs", () => {
      const propsMap = new Map<string, PropDefinition>();

      const result = processor.linkProps({}, propsMap);

      expect(result).toEqual({});
    });

    it("should link characters ref to text prop", () => {
      const propsMap = new Map<string, PropDefinition>([
        ["labelText", { name: "labelText", type: "string", originalKey: "text#123:0" } as any],
      ]);
      const refs = { characters: "text#123:0" };

      const result = processor.linkProps(refs, propsMap);

      expect(result.characters).toBe("labelText");
    });

    it("should link visible ref to boolean prop", () => {
      const propsMap = new Map<string, PropDefinition>([
        ["showIcon", { name: "showIcon", type: "boolean", originalKey: "visible#123:1" } as any],
      ]);
      const refs = { visible: "visible#123:1" };

      const result = processor.linkProps(refs, propsMap);

      expect(result.visible).toBe("showIcon");
    });

    it("should link mainComponent ref to slot prop", () => {
      const propsMap = new Map<string, PropDefinition>([
        ["icon", { name: "icon", type: "slot", originalKey: "component#123:2" } as any],
      ]);
      const refs = { mainComponent: "component#123:2" };

      const result = processor.linkProps(refs, propsMap);

      expect(result.mainComponent).toBe("icon");
    });

    it("should link multiple refs at once", () => {
      const propsMap = new Map<string, PropDefinition>([
        ["labelText", { name: "labelText", type: "string", originalKey: "text#123:0" } as any],
        ["showIcon", { name: "showIcon", type: "boolean", originalKey: "visible#123:1" } as any],
      ]);
      const refs = {
        characters: "text#123:0",
        visible: "visible#123:1",
      };

      const result = processor.linkProps(refs, propsMap);

      expect(result.characters).toBe("labelText");
      expect(result.visible).toBe("showIcon");
    });

    it("should not include binding when prop not found", () => {
      const propsMap = new Map<string, PropDefinition>();
      const refs = { characters: "text#unknown:0" };

      const result = processor.linkProps(refs, propsMap);

      expect(result.characters).toBeUndefined();
    });
  });

  describe("extractPropBindings()", () => {
    it("should return empty array for undefined refs", () => {
      const result = processor.extractPropBindings(undefined);

      expect(result).toEqual([]);
    });

    it("should extract characters binding", () => {
      const refs = { characters: "text#123:0" };

      const result = processor.extractPropBindings(refs);

      expect(result).toHaveLength(1);
      expect(result[0].bindingType).toBe("text");
      expect(result[0].originalRef).toBe("text#123:0");
    });

    it("should extract visible binding", () => {
      const refs = { visible: "visible#123:1" };

      const result = processor.extractPropBindings(refs);

      expect(result).toHaveLength(1);
      expect(result[0].bindingType).toBe("visible");
    });

    it("should extract mainComponent binding", () => {
      const refs = { mainComponent: "component#123:2" };

      const result = processor.extractPropBindings(refs);

      expect(result).toHaveLength(1);
      expect(result[0].bindingType).toBe("component");
    });

    it("should extract multiple bindings", () => {
      const refs = {
        characters: "text#123:0",
        visible: "visible#123:1",
        mainComponent: "component#123:2",
      };

      const result = processor.extractPropBindings(refs);

      expect(result).toHaveLength(3);
      expect(result.map((b) => b.bindingType)).toContain("text");
      expect(result.map((b) => b.bindingType)).toContain("visible");
      expect(result.map((b) => b.bindingType)).toContain("component");
    });
  });

  describe("hasAnyBinding()", () => {
    it("should return false for undefined refs", () => {
      expect(processor.hasAnyBinding(undefined)).toBe(false);
    });

    it("should return false for empty refs", () => {
      expect(processor.hasAnyBinding({})).toBe(false);
    });

    it("should return true for characters binding", () => {
      expect(processor.hasAnyBinding({ characters: "text#123:0" })).toBe(true);
    });

    it("should return true for visible binding", () => {
      expect(processor.hasAnyBinding({ visible: "visible#123:1" })).toBe(true);
    });

    it("should return true for mainComponent binding", () => {
      expect(processor.hasAnyBinding({ mainComponent: "component#123:2" })).toBe(true);
    });

    it("should return false for unknown binding types", () => {
      expect(processor.hasAnyBinding({ unknownProp: "some-value" })).toBe(false);
    });
  });
});
