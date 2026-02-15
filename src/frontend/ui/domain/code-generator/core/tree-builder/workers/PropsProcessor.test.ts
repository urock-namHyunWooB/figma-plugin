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

  describe("extractProps() - prop 이름 생성", () => {
    it("원본 Figma prop 이름을 camelCase로 변환 (#ID 제거)", () => {
      const props = {
        "Badge#796:0": { type: "BOOLEAN", defaultValue: false },
        "Icon Help#456:0": { type: "BOOLEAN", defaultValue: true },
      };

      const result = processor.extractProps(props);

      // "Badge#796:0" → "badge" (원본 이름 기반)
      const badgeProp = Array.from(result.values()).find(p => p.name === "badge");
      expect(badgeProp).toBeDefined();
      expect(badgeProp?.type).toBe("boolean");

      // "Icon Help#456:0" → "iconHelp"
      const iconProp = Array.from(result.values()).find(p => p.name === "iconHelp");
      expect(iconProp).toBeDefined();
    });

    it("HTML 내장 속성과 충돌하면 custom prefix 추가", () => {
      const props = {
        "Disabled": { type: "BOOLEAN", defaultValue: false },
        "Active": { type: "BOOLEAN", defaultValue: true },
      };

      const result = processor.extractProps(props);

      // "Disabled" → "customDisabled" (HTML 속성 충돌)
      const disabledProp = Array.from(result.values()).find(p => p.name === "customDisabled");
      expect(disabledProp).toBeDefined();

      // "Active" → "active" (충돌 없음)
      const activeProp = Array.from(result.values()).find(p => p.name === "active");
      expect(activeProp).toBeDefined();
    });

    it("Show로 시작하는 prop은 그대로 showXxx로 변환", () => {
      const props = {
        "Show Label#123:0": { type: "BOOLEAN", defaultValue: true },
      };

      const result = processor.extractProps(props);

      // "Show Label#123:0" → "showLabel"
      const labelProp = Array.from(result.values()).find(p => p.name === "showLabel");
      expect(labelProp).toBeDefined();
    });

    it("TEXT 타입 ref에서 의미 있는 이름 생성", () => {
      const props = {
        "Label Text#123:0": { type: "TEXT", defaultValue: "Hello" },
      };

      const result = processor.extractProps(props);

      // "Label Text#123:0" → "labelText"
      const textProp = Array.from(result.values()).find(p => p.name === "labelText");
      expect(textProp).toBeDefined();
      expect(textProp?.type).toBe("string");
    });

    it("VARIANT 타입은 그대로 camelCase로 변환", () => {
      const props = {
        "Size": { type: "VARIANT", defaultValue: "Large", variantOptions: ["Large", "Small"] },
      };

      const result = processor.extractProps(props);

      const sizeProp = Array.from(result.values()).find(p => p.name === "size");
      expect(sizeProp).toBeDefined();
      expect(sizeProp?.type).toBe("variant");
    });

    it("visible, visible2... 대신 의미 있는 이름 생성 (회귀 테스트)", () => {
      // componentPropertyReferences에서 온 props (#ID 있음)
      const props = {
        "Badge#796:0": { type: "BOOLEAN", defaultValue: false },
        "Icon#456:0": { type: "BOOLEAN", defaultValue: true },
        "Label#123:0": { type: "BOOLEAN", defaultValue: true },
      };

      const result = processor.extractProps(props);
      const names = Array.from(result.values()).map(p => p.name);

      // "visible", "visible2", "visible3" 같은 이름이 없어야 함
      expect(names).not.toContain("visible");
      expect(names).not.toContain("visible2");
      expect(names).not.toContain("visible3");

      // 대신 원본 기반 의미 있는 이름이어야 함
      expect(names).toContain("badge");
      expect(names).toContain("icon");
      expect(names).toContain("label");
    });

    it("이름 충돌 시 suffix 추가", () => {
      const props = {
        "Label#123:0": { type: "BOOLEAN", defaultValue: false },
        "Label#456:0": { type: "BOOLEAN", defaultValue: true },
        "Label#789:0": { type: "TEXT", defaultValue: "Hello" },
      };

      const result = processor.extractProps(props);
      const names = Array.from(result.values()).map(p => p.name);

      // 첫 번째는 "label", 나머지는 "label2", "label3"
      expect(names).toContain("label");
      expect(names).toContain("label2");
      expect(names).toContain("label3");
    });
  });
});
