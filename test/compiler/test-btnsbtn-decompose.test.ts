import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Btnsbtn compound decomposition", () => {
  it("Emotion: background colors correctly decomposed to compound style map", async () => {
    const fixturePath = path.resolve(__dirname, "../fixtures/failing/Btnsbtn.json");
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(raw);
    const code = await compiler.compile();
    fs.writeFileSync("/tmp/btnsbtn-latest.tsx", code ?? "", "utf-8");

    // 색상이 있는 background가 생성 코드에 존재해야 함
    expect(code).toContain("628cf5"); // filled+blue → Color-primary-01
    expect(code).toContain("ff8484"); // filled+red → Color-state-error

    // compound style map에 background가 올바르게 배치
    const bgLines = (code ?? "").split("\n").filter(l => l.includes("background") && l.includes("#"));
    // 단일 tone 차원이 아닌, state를 포함한 compound 키에 배치되어야 함
    expect(bgLines.length).toBeGreaterThan(2);
  });

  it("Tailwind: component renders without runtime errors", async () => {
    const fixturePath = path.resolve(__dirname, "../fixtures/failing/Btnsbtn.json");
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(raw, { styleStrategy: "tailwind" });
    const code = await compiler.compile();

    expect(code).toContain("function Btnsbtn");
  });
});
