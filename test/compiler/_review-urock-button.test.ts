import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import urockButton from "../fixtures/button/urockButton.json";

describe("urockButton rendering review", () => {
  it("should compile urockButton with emotion strategy", async () => {
    const compiler = new FigmaCodeGenerator(urockButton as any, { styleStrategy: "emotion" });
    const { code, diagnostics } = await compiler.compileWithDiagnostics();

    expect({ code, diagnosticsCount: diagnostics.length, diagnostics }).toMatchSnapshot();
  });
});
