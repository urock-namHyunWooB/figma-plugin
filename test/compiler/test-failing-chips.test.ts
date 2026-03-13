import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

describe("Failing Chips.json", () => {
  it("colorStyles에 background가 포함되어야 한다", async () => {
    const fixturePath = path.join(process.cwd(), "test/fixtures/chip/Chips.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const code = await compiler.compile();

    // colorStyles에 background가 있어야 함
    const colorStylesMatch = code.match(/colorStyles\s*=\s*\{([\s\S]*?)\n\};/);
    expect(colorStylesMatch).toBeTruthy();
    const body = colorStylesMatch![1];
    expect(body).toMatch(/background/);

    // sizeStyles에 background가 없어야 함
    const sizeStylesMatch = code.match(/sizeStyles\s*=\s*\{([\s\S]*?)\n\};/);
    if (sizeStylesMatch) {
      expect(sizeStylesMatch[1]).not.toMatch(/background/);
    }
  });
});
