import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid 생성 코드 snapshot", () => {
  it("Emotion 전략", async () => {
    const compiler = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const code = await compiler.compile();
    expect(code).toMatchSnapshot();
  });

  it("Tailwind 전략", async () => {
    const compiler = new FigmaCodeGenerator(ButtonsolidFixture as any, {
      styleStrategy: { type: "tailwind" },
    });
    const code = await compiler.compile();
    expect(code).toMatchSnapshot();
  });
});
