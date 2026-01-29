import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";
import { DataPreparer } from "@compiler/core/data-preparer";
import { VariantProcessor } from "@compiler/core/tree-builder/workers/VariantProcessor";
import { StyleProcessor } from "@compiler/core/tree-builder/workers/StyleProcessor";
import { VisibilityProcessor } from "@compiler/core/tree-builder/workers/VisibilityProcessor";

describe("Debug Variant Styles", () => {
  test("check mergedNodes content", async () => {
    const fixturePath = path.join(__dirname, "../fixtures/button/taptapButton.json");
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    // Prepare data
    const preparer = new DataPreparer();
    const prepared = preparer.prepare(fixtureData);

    const output: string[] = [];

    // Check styleMap content
    const styleMap = (prepared as any).styleMap as Map<string, any>;
    output.push("=== StyleMap Stats ===");
    output.push("Total entries: " + styleMap.size);

    // List some Text node IDs
    const textNodes: string[] = [];
    for (const [id, style] of styleMap.entries()) {
      if (style.name === "Text") {
        textNodes.push(id + " -> fontSize: " + (style.cssStyle?.["font-size"] || "none"));
      }
    }
    output.push("Text nodes in styleMap: " + textNodes.length);
    for (const t of textNodes.slice(0, 5)) {
      output.push("  " + t);
    }
    if (textNodes.length > 5) {
      output.push("  ... and " + (textNodes.length - 5) + " more");
    }

    // Now run VariantProcessor to get the merged tree
    const isComponentSet = prepared.document.type === "COMPONENT_SET";
    const doc = prepared.document as { children?: unknown[] };
    const totalVariantCount = isComponentSet && doc.children ? doc.children.length : 1;

    let ctx = {
      data: prepared,
      policy: undefined,
      totalVariantCount,
      conditionals: [],
      slots: [],
      arraySlots: [],
    };

    ctx = VariantProcessor.merge(ctx as any) as any;

    output.push("");
    output.push("=== InternalTree Stats ===");
    output.push("Root name: " + ctx.internalTree?.name);

    // Find TEXT nodes and check their mergedNodes
    function findTextNodes(node: any, p: string): void {
      if (node.type === "TEXT" || node.name === "Text") {
        output.push("");
        output.push("TEXT NODE: \"" + p + "\"");
        output.push("  ID: " + node.id);
        output.push("  mergedNode count: " + (node.mergedNode?.length || 0));
        if (node.mergedNode?.length > 0) {
          for (const m of node.mergedNode.slice(0, 5)) {
            output.push("    - id: " + m.id + ", variantName: " + (m.variantName || "").substring(0, 40));
            // Check if this ID exists in styleMap
            const style = styleMap.get(m.id);
            output.push("      styleMap has: " + (style ? "YES" : "NO") + (style?.cssStyle?.["font-size"] ? ", fontSize=" + style.cssStyle["font-size"] : ""));
          }
          if (node.mergedNode.length > 5) {
            output.push("    ... and " + (node.mergedNode.length - 5) + " more");
          }
        }
      }
      for (const child of node.children || []) {
        findTextNodes(child, p + "/" + child.name);
      }
    }

    if (ctx.internalTree) {
      findTextNodes(ctx.internalTree, ctx.internalTree.name);
    }

    // Now run StyleProcessor on one TEXT node
    output.push("");
    output.push("=== StyleProcessor Test ===");

    function findFirstTextNode(node: any): any {
      if (node.type === "TEXT" || node.name === "Text") {
        return node;
      }
      for (const child of node.children || []) {
        const found = findFirstTextNode(child);
        if (found) return found;
      }
      return null;
    }

    const textNode = ctx.internalTree ? findFirstTextNode(ctx.internalTree) : null;
    if (textNode) {
      output.push("Testing node: " + textNode.name + " (ID: " + textNode.id + ")");
      output.push("mergedNode count: " + textNode.mergedNode?.length);

      const styleProc = new StyleProcessor();
      const styleDef = styleProc.buildFromMergedNodes(
        { mergedNodes: textNode.mergedNode, data: prepared },
        VisibilityProcessor.parseVariantCondition
      );

      output.push("Result base keys: " + Object.keys(styleDef.base || {}).join(", "));
      output.push("Result dynamic count: " + (styleDef.dynamic?.length || 0));
      if (styleDef.dynamic?.length) {
        for (const d of styleDef.dynamic.slice(0, 3)) {
          output.push("  Condition: " + JSON.stringify(d.condition));
          output.push("  Style: " + JSON.stringify(d.style));
        }
      }
    }

    fs.writeFileSync("/tmp/debug-variant-styles.txt", output.join("\n"));
    expect(prepared).toBeDefined();
  });
});
