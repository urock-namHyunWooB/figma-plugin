import { describe, it, expect } from "vitest";
import { EmotionStrategy } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy";
import { renameNativeProps } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";

describe("EmotionStrategy naming options", () => {
  describe("styleBaseSuffix", () => {
    it("uses custom base suffix", () => {
      const strategy = new EmotionStrategy({
        styleBaseSuffix: "Style",
      });
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
      }, ["Root", "Container", "Button"]);
      expect(result.variableName).toContain("Style");
      expect(result.variableName).not.toContain("Css");
    });

    it("defaults to Css when no option", () => {
      const strategy = new EmotionStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
      }, ["Root", "Container", "Button"]);
      expect(result.variableName).toContain("Css");
    });
  });

  describe("styleNamingStrategy", () => {
    it("verbose: uses last 3 path nodes", () => {
      const strategy = new EmotionStrategy({ styleNamingStrategy: "verbose" });
      const result = strategy.generateStyle("n1", "mask", {
        base: { display: "flex" },
      }, ["Root", "Button", "Wrapper", "Mask"]);
      expect(result.variableName).toBe("buttonWrapperMaskCss");
    });

    it("compact: uses last node only", () => {
      const strategy = new EmotionStrategy({ styleNamingStrategy: "compact" });
      const result = strategy.generateStyle("n1", "mask", {
        base: { display: "flex" },
      }, ["Root", "Button", "Wrapper", "Mask"]);
      expect(result.variableName).toBe("maskCss");
    });

    it("minimal: uses index-based name", () => {
      const strategy = new EmotionStrategy({ styleNamingStrategy: "minimal" });
      const r1 = strategy.generateStyle("n1", "mask", {
        base: { display: "flex" },
      }, ["Root", "Mask"]);
      const r2 = strategy.generateStyle("n2", "label", {
        base: { color: "red" },
      }, ["Root", "Label"]);
      expect(r1.variableName).toBe("s1");
      expect(r2.variableName).toBe("s2");
    });
  });
});

describe("renameNativeProps conflictPropPrefix", () => {
  const makeTree = (propName: string) => ({
    root: { type: "button", children: [] },
    props: [{ name: propName, type: "variant", sourceKey: propName, defaultValue: "submit" }],
    name: "Btn",
  });

  it("uses 'custom' prefix by default", () => {
    const result = renameNativeProps(makeTree("type") as any);
    expect(result.props[0].name).toBe("customType");
  });

  it("uses custom prefix when provided", () => {
    const result = renameNativeProps(makeTree("type") as any, "fig");
    expect(result.props[0].name).toBe("figType");
  });

  it("does not rename when no conflict", () => {
    const result = renameNativeProps(makeTree("size") as any, "fig");
    expect(result.props[0].name).toBe("size");
  });
});
