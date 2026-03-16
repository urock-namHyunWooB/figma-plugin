import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "../../src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import { TreeManager } from "../../src/frontend/ui/domain/code-generator2/layers/tree-manager/TreeManager";
import DataManager from "../../src/frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import fs from "fs";

describe("text-box-trim", () => {
  it("TEXT 노드에 text-box-trim이 적용되어야 한다", async () => {
    const data = JSON.parse(fs.readFileSync("test/fixtures/failing/Button.json", "utf8"));

    // UITree를 직접 확인
    const dm = new DataManager(data);
    const tm = new TreeManager(dm);
    const { main } = tm.build();

    // text 노드 찾기
    function findTextNodes(node: any): any[] {
      const results: any[] = [];
      if (node.type === "text") results.push(node);
      for (const child of node.children || []) {
        results.push(...findTextNodes(child));
      }
      return results;
    }

    const textNodes = findTextNodes(main.root);
    console.log("Text nodes found:", textNodes.length);
    for (const tn of textNodes) {
      console.log("  name:", tn.name, "type:", tn.type);
      console.log("  styles.base:", JSON.stringify(tn.styles?.base));
    }

    expect(textNodes.length).toBeGreaterThan(0);
    expect(textNodes[0].styles?.base?.["text-box-trim"]).toBe("trim-both");
  });

  it("생성된 코드에 text-box-trim이 포함되어야 한다", async () => {
    const data = JSON.parse(fs.readFileSync("test/fixtures/failing/Button.json", "utf8"));
    const gen = new FigmaCodeGenerator(data, { styleStrategy: "emotion" });
    const result = await gen.compileWithDiagnostics();

    expect(result.code).toContain("text-box-trim");
  });
});
