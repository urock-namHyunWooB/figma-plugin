import { describe, it, expect } from "vitest";
import { StyleProcessor } from "./StyleProcessor";

const processor = new StyleProcessor();

describe("StyleClassifier", () => {
  describe("extractStateFromVariantName()", () => {
    it("should extract State value from variant name", () => {
      expect(processor.extractStateFromVariantName("Size=Large, State=Hover")).toBe("Hover");
      expect(processor.extractStateFromVariantName("State=Disabled")).toBe("Disabled");
      expect(processor.extractStateFromVariantName("State=Default, Size=Small")).toBe("Default");
    });

    it("should return null if no State found", () => {
      expect(processor.extractStateFromVariantName("Size=Large")).toBeNull();
      expect(processor.extractStateFromVariantName("")).toBeNull();
    });
  });

  describe("stateToPseudo()", () => {
    it("should map State values to CSS pseudo-classes (case-insensitive)", () => {
      // Hover states
      expect(processor.stateToPseudo("Hover")).toBe(":hover");
      expect(processor.stateToPseudo("hover")).toBe(":hover");
      expect(processor.stateToPseudo("HOVER")).toBe(":hover");
      expect(processor.stateToPseudo("Hovered")).toBe(":hover");

      // Active states
      expect(processor.stateToPseudo("Active")).toBe(":active");
      expect(processor.stateToPseudo("Pressed")).toBe(":active");

      // Focus states
      expect(processor.stateToPseudo("Focus")).toBe(":focus");
      expect(processor.stateToPseudo("Focused")).toBe(":focus");

      // Disabled states
      expect(processor.stateToPseudo("Disabled")).toBe(":disabled");
      expect(processor.stateToPseudo("Inactive")).toBe(":disabled");

      // Selected/Checked states
      expect(processor.stateToPseudo("Selected")).toBe(":checked");
      expect(processor.stateToPseudo("Checked")).toBe(":checked");
    });

    it("should return null for default/normal states (no pseudo-class)", () => {
      expect(processor.stateToPseudo("Default")).toBeNull();
      expect(processor.stateToPseudo("Normal")).toBeNull();
      expect(processor.stateToPseudo("Rest")).toBeNull();
    });

    it("should return undefined for unknown states", () => {
      expect(processor.stateToPseudo("Unknown")).toBeUndefined();
      expect(processor.stateToPseudo("CustomState")).toBeUndefined();
    });
  });

  describe("classifyStyles()", () => {
    it("should classify all same values as base", () => {
      const variantStyles = [
        { variantName: "Size=Large", cssStyle: { display: "flex", padding: "16px" } },
        { variantName: "Size=Small", cssStyle: { display: "flex", padding: "16px" } },
      ];

      const result = processor.classifyStyles(variantStyles, () => null);

      expect(result.base).toEqual({ display: "flex", padding: "16px" });
      expect(result.dynamic).toHaveLength(0);
    });

    it("should classify different values as dynamic", () => {
      const variantStyles = [
        { variantName: "Size=Large", cssStyle: { padding: "16px", display: "flex" } },
        { variantName: "Size=Small", cssStyle: { padding: "8px", display: "flex" } },
      ];

      const mockParseCondition = (name: string) => ({
        type: "Literal" as const,
        value: name,
      });

      const result = processor.classifyStyles(variantStyles, mockParseCondition);

      expect(result.base).toEqual({ display: "flex" });
      expect(result.dynamic).toHaveLength(2);
    });

    it("should classify State styles as pseudo", () => {
      const variantStyles = [
        { variantName: "State=Default", cssStyle: { background: "#fff" } },
        { variantName: "State=Hover", cssStyle: { background: "#eee" } },
        { variantName: "State=Disabled", cssStyle: { background: "#ccc" } },
      ];

      const result = processor.classifyStyles(variantStyles, () => null);

      expect(result.pseudo).toBeDefined();
      expect(result.pseudo?.[":hover"]).toBeDefined();
      expect(result.pseudo?.[":disabled"]).toBeDefined();
    });

    it("should return empty styles for empty input", () => {
      const result = processor.classifyStyles([], () => null);

      expect(result.base).toEqual({});
      expect(result.dynamic).toHaveLength(0);
    });
  });

  describe("diffStyles()", () => {
    it("should return differences between styles", () => {
      const base = { display: "flex", padding: "8px", color: "#000" };
      const target = { display: "flex", padding: "16px", background: "#fff" };

      const result = processor.diffStyles(base, target);

      expect(result).toEqual({ padding: "16px", background: "#fff" });
    });

    it("should return empty object for identical styles", () => {
      const style = { display: "flex" };
      const result = processor.diffStyles(style, style);

      expect(result).toEqual({});
    });
  });

  describe("extractCommonStyles()", () => {
    it("should extract styles common to all", () => {
      const styles = [
        { display: "flex", padding: "8px", color: "#000" },
        { display: "flex", padding: "16px", color: "#000" },
        { display: "flex", padding: "12px", color: "#000" },
      ];

      const result = processor.extractCommonStyles(styles);

      expect(result).toEqual({ display: "flex", color: "#000" });
    });

    it("should return empty for no common styles", () => {
      const styles: Record<string, string>[] = [
        { padding: "8px" },
        { margin: "8px" },
      ];

      const result = processor.extractCommonStyles(styles);

      expect(result).toEqual({});
    });

    it("should return all styles for single input", () => {
      const styles = [{ display: "flex", padding: "8px" }];

      const result = processor.extractCommonStyles(styles);

      expect(result).toEqual({ display: "flex", padding: "8px" });
    });
  });
});
