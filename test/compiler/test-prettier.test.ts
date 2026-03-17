import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "../../src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import fs from "fs";

describe("Prettier formatting", () => {
  it("should format bundled code with Prettier", async () => {
    const data = JSON.parse(fs.readFileSync("test/fixtures/button/Button.json", "utf8"));
    const gen = new FigmaCodeGenerator(data, { styleStrategy: "emotion" });
    const result = await gen.compileWithDiagnostics();
    
    // Prettier가 적용되면 긴 JSX 라인이 여러 줄로 분리돼야 함
    const lines = result.code.split("\n");
    const longLines = lines.filter(l => l.length > 100);
    
    console.log("Max line length:", Math.max(...lines.map(l => l.length)));
    console.log("Lines > 100 chars:", longLines.length);
    if (longLines.length > 0) {
      console.log("First long line:", longLines[0].substring(0, 120) + "...");
    }
    
    // printWidth: 80이면 대부분의 라인이 80자 이하여야 함
    expect(longLines.length).toBeLessThan(5);
  });
});
