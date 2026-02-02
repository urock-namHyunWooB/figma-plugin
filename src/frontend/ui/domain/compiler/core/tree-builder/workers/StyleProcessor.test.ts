import { describe, it, expect } from "vitest";
import { StyleProcessor } from "./StyleProcessor";
import { stateToPseudo, isCssConvertibleState } from "./utils/stateUtils";

const processor = new StyleProcessor();

// Mock PreparedDesignData
const createMockData = (nodes: Record<string, any> = {}) => ({
  getNodeById: (id: string) => nodes[id] || null,
} as any);

// ============================================================================
// StyleClassifier Tests
// ============================================================================

describe("StyleProcessor", () => {
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
      expect(stateToPseudo("Hover")).toBe(":hover");
      expect(stateToPseudo("hover")).toBe(":hover");
      expect(stateToPseudo("HOVER")).toBe(":hover");
      expect(stateToPseudo("Hovered")).toBe(":hover");

      // Active states
      expect(stateToPseudo("Active")).toBe(":active");
      expect(stateToPseudo("Pressed")).toBe(":active");

      // Focus states
      expect(stateToPseudo("Focus")).toBe(":focus");
      expect(stateToPseudo("Focused")).toBe(":focus");

      // Disabled states
      expect(stateToPseudo("Disabled")).toBe(":disabled");
      expect(stateToPseudo("Inactive")).toBe(":disabled");

      // Selected/Checked states
      expect(stateToPseudo("Selected")).toBe(":checked");
      expect(stateToPseudo("Checked")).toBe(":checked");
    });

    it("should return null for default/normal states (no pseudo-class)", () => {
      expect(stateToPseudo("Default")).toBeNull();
      expect(stateToPseudo("Normal")).toBeNull();
      expect(stateToPseudo("Rest")).toBeNull();
    });

    it("should return undefined for unknown states", () => {
      expect(stateToPseudo("Unknown")).toBeUndefined();
      expect(stateToPseudo("CustomState")).toBeUndefined();
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

  // ============================================================================
  // PositionStyler Tests
  // ============================================================================

  describe("isAutoLayout()", () => {
    it("should return true for HORIZONTAL layout", () => {
      const node = { layoutMode: "HORIZONTAL" } as any;
      expect(processor.isAutoLayout(node)).toBe(true);
    });

    it("should return true for VERTICAL layout", () => {
      const node = { layoutMode: "VERTICAL" } as any;
      expect(processor.isAutoLayout(node)).toBe(true);
    });

    it("should return false for NONE layout", () => {
      const node = { layoutMode: "NONE" } as any;
      expect(processor.isAutoLayout(node)).toBe(false);
    });

    it("should return false for undefined layoutMode", () => {
      const node = {} as any;
      expect(processor.isAutoLayout(node)).toBeFalsy();
    });
  });

  describe("calculatePosition()", () => {
    it("should return null when parent is null", () => {
      const node = { id: "node1", type: "FRAME", name: "Node", children: [], styles: { base: {} } };
      const data = createMockData();

      const result = processor.calculatePosition(node, null, data);

      expect(result).toBeNull();
    });

    it("should return null when parent is auto-layout", () => {
      const node = { id: "child", type: "FRAME", name: "Child", children: [], styles: { base: {} } };
      const parent = { id: "parent", type: "FRAME", name: "Parent", children: [], styles: { base: {} } };
      const data = createMockData({
        child: { absoluteBoundingBox: { x: 10, y: 10, width: 50, height: 50 } },
        parent: {
          type: "FRAME",
          layoutMode: "HORIZONTAL",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      });

      const result = processor.calculatePosition(node, parent, data);

      expect(result).toBeNull();
    });

    it("should calculate absolute position for non-auto-layout parent", () => {
      const node = { id: "child", type: "FRAME", name: "Child", children: [], styles: { base: {} } };
      const parent = { id: "parent", type: "FRAME", name: "Parent", children: [], styles: { base: {} } };
      const data = createMockData({
        child: { absoluteBoundingBox: { x: 50, y: 30, width: 20, height: 20 } },
        parent: {
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      });

      const result = processor.calculatePosition(node, parent, data);

      expect(result).not.toBeNull();
      expect(result?.position).toBe("absolute");
      expect(result?.left).toBe("50px");
      expect(result?.top).toBe("30px");
    });
  });

  describe("handleRotatedElement()", () => {
    it("should return unchanged styles for non-rotated element", () => {
      const nodeSpec = { rotation: 0 } as any;
      const styles = { width: "100px", height: "50px" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result).toEqual(styles);
    });

    it("should return unchanged styles for undefined rotation", () => {
      const nodeSpec = {} as any;
      const styles = { width: "100px", height: "50px" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result).toEqual(styles);
    });

    it("should remove transform and update size for 90 degree rotation", () => {
      const nodeSpec = {
        rotation: Math.PI / 2, // 90 degrees
        absoluteRenderBounds: { width: 50, height: 100 },
      } as any;
      const styles = { transform: "rotate(90deg)", width: "100px", height: "50px" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result.transform).toBeUndefined();
      expect(result.width).toBe("50px");
      expect(result.height).toBe("100px");
    });

    it("should handle 270 degree rotation", () => {
      const nodeSpec = {
        rotation: (3 * Math.PI) / 2, // 270 degrees
        absoluteRenderBounds: { width: 50, height: 100 },
      } as any;
      const styles = { transform: "rotate(-90deg)" };

      const result = processor.handleRotatedElement(nodeSpec, styles);

      expect(result.transform).toBeUndefined();
      expect(result.width).toBe("50px");
      expect(result.height).toBe("100px");
    });
  });
});
