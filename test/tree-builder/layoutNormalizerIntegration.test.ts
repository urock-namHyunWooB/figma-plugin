import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

describe("LayoutNormalizer Integration", () => {
  describe("Chips fixture", () => {
    it("icon-checking과 icon_checking이 하나로 합쳐져야 한다", async () => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../fixtures/failing/Chips.json"), "utf-8")
      );
      const gen = new FigmaCodeGenerator(fixture as any, { strategy: "emotion" });
      const code = await gen.compile();

      expect(code).toBeTruthy();
      // icon이 size 조건 없이 렌더링되어야 함 (하나로 합쳐졌으므로)
      expect(code).not.toMatch(/size\s*===\s*["']small["']\s*&&\s*iconchecking/);
    });
  });

  describe("Checkbox fixture", () => {
    it("Box와 Interaction이 구분되어야 한다", async () => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../fixtures/any/Controlcheckbox.json"), "utf-8")
      );
      const gen = new FigmaCodeGenerator(fixture as any, { strategy: "emotion" });
      const code = await gen.compile();

      expect(code).toBeTruthy();
      expect(code).toMatch(/checked/);
    });
  });
});
