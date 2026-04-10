import { describe, it, expect } from "vitest";
import { ShadcnStrategy } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/ShadcnStrategy";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { ReactEmitter, renameNativeProps } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";

describe("ShadcnStrategy", () => {
  describe("base style", () => {
    it("generates cva with base Tailwind classes", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex", padding: "12px", borderRadius: "8px" },
      }, ["Root", "Button"]);
      expect(result.code).toContain("cva(");
      expect(result.code).toContain("flex");
      expect(result.code).toContain("p-[12px]");
      expect(result.code).toContain("rounded-[8px]");
    });

    it("uses Variants suffix", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
      }, ["Root", "Button"]);
      expect(result.variableName).toBe("buttonVariants");
    });

    it("returns empty for no styles", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "empty", { base: {} });
      expect(result.isEmpty).toBe(true);
    });

    it("includes pseudo classes with prefix", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "btn", {
        base: { backgroundColor: "#3b82f6" },
        pseudo: { ":hover": { backgroundColor: "#2563eb" } },
      }, ["Root", "Btn"]);
      expect(result.code).toContain("hover:");
    });
  });

  describe("imports", () => {
    it("includes cva and VariantProps", () => {
      const strategy = new ShadcnStrategy();
      const imports = strategy.getImports();
      expect(imports.some(i => i.includes("cva") && i.includes("VariantProps"))).toBe(true);
    });

    it("includes cn with default path", () => {
      const strategy = new ShadcnStrategy();
      const imports = strategy.getImports();
      expect(imports.some(i => i.includes("cn") && i.includes("@/lib/utils"))).toBe(true);
    });

    it("uses custom cn path", () => {
      const strategy = new ShadcnStrategy({ cnImportPath: "@/utils/cn" });
      const imports = strategy.getImports();
      expect(imports.some(i => i.includes("@/utils/cn"))).toBe(true);
    });
  });

  describe("variants", () => {
    it("generates cva with variants block", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
        dynamic: [
          { condition: { type: "eq", prop: "size", value: "large" }, style: { padding: "16px" } },
          { condition: { type: "eq", prop: "size", value: "small" }, style: { padding: "8px" } },
        ],
      }, ["Root", "Button"]);
      expect(result.code).toContain("variants:");
      expect(result.code).toContain("size:");
      expect(result.code).toContain("large:");
      expect(result.code).toContain("small:");
    });

    it("generates defaultVariants block", () => {
      const strategy = new ShadcnStrategy();
      strategy.setDefaultVariants(new Map([["size", "large"]]));
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
        dynamic: [
          { condition: { type: "eq", prop: "size", value: "large" }, style: { padding: "16px" } },
          { condition: { type: "eq", prop: "size", value: "small" }, style: { padding: "8px" } },
        ],
      }, ["Root", "Button"]);
      expect(result.code).toContain("defaultVariants:");
      expect(result.code).toContain('"large"');
    });
  });

  describe("JSX attribute", () => {
    it("generates cn() with className injection", () => {
      const strategy = new ShadcnStrategy();
      strategy.cvaVariables.add("buttonVariants");
      const attr = strategy.getJsxStyleAttribute("buttonVariants", false);
      expect(attr.attributeName).toBe("className");
      expect(attr.valueCode).toContain("cn(");
      expect(attr.valueCode).toContain("className");
    });
  });
});

describe("ReactEmitter with shadcn strategy", () => {
  it("generates shadcn-style code", async () => {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter({ styleStrategy: "shadcn" });
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    const result = await emitter.emit(ir);
    expect(result.code).toContain("cva");
    expect(result.code).toContain("VariantProps");
    expect(result.code).toContain("cn");
    expect(result.code).toContain("className");
  });
});
