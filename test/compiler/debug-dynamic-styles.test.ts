import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@compiler";
import fs from "fs";
import path from "path";

describe("Debug Dynamic Styles", () => {
  test("check taptapButton dynamic styles", async () => {
    const fixturePath = path.join(__dirname, "../fixtures/button/taptapButton.json");
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixtureData);
    const code = await compiler.compile();
    
    // Write to file for inspection
    fs.writeFileSync("/tmp/taptap-button-code.tsx", code || "");
    
    // Check for dynamic size styles
    console.log("\n=== Looking for Size-based dynamic styles ===");
    
    // Look for size-related styles
    const hasSizeRecord = code?.includes("SizeStyles") || code?.includes("sizeStyles");
    console.log("Has size styles Record:", hasSizeRecord);
    
    // Look for fontSize variations
    const fontSize14Match = code?.match(/fontSize.*14px/g);
    const fontSize16Match = code?.match(/fontSize.*16px/g);
    console.log("fontSize 14px occurrences:", fontSize14Match?.length || 0);
    console.log("fontSize 16px occurrences:", fontSize16Match?.length || 0);
    
    // Check if there's dynamic CSS function
    const dynamicCssMatch = code?.match(/const\s+\w+\s*=\s*\(\s*\w+\s*:\s*Size\s*\)/g);
    console.log("Dynamic CSS functions:", dynamicCssMatch);
    
    expect(code).toBeDefined();
  });
});
