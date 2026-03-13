import { describe, it } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";

describe("Committed Chips", () => {
  it("dump", async () => {
    const fixture = JSON.parse(fs.readFileSync("/tmp/chips-committed.json", "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const code = await compiler.compile();
    fs.writeFileSync("/tmp/chips-committed-output.tsx", code);
  });
});
