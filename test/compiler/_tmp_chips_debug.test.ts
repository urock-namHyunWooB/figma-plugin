import { describe, it } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

describe("original repo chips compile", () => {
  it("compile", async () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures/failing/Chips.json"), "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const code = await compiler.compile();
    fs.writeFileSync("/tmp/original-chips-compiled.tsx", code);
  });
});
