import { describe, it } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

describe("Dump Chips output", () => {
  it("dump", async () => {
    const fixturePath = path.join(process.cwd(), "test/fixtures/chip/Chips.json");
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const code = await compiler.compile();
    fs.writeFileSync("/tmp/chips-worktree.tsx", code);
  });
});
