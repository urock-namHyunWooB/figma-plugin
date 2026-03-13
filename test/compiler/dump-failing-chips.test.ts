import { describe, it } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

describe("Dump Failing Chips output", () => {
  it("dump", async () => {
    const fixturePath = path.join(process.cwd(), "test/fixtures/failing/Chips.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const code = await compiler.compile();
    fs.writeFileSync("/tmp/chips-failing-original.tsx", code);
  });
});
