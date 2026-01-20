import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import * as fs from "fs";
import * as path from "path";

describe("Large.json 컴파일", () => {
  test("Large.json 컴파일 및 저장", async () => {
    const jsonPath = path.join(__dirname, "../fixtures/failing/Large.json");
    const outputDir = path.join(__dirname, "../fixtures/failing/compiled");

    const figmaData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outputDir, "Large.tsx"), code || "");
    console.log("=== Compiled Large.tsx ===");
    console.log(code);

    expect(code).toBeTruthy();
  });
});
