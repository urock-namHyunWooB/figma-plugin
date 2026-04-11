import { describe, it } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("diag", () => {
  it("show cva", async () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any, { styleStrategy: "tailwind" });
    const result = await gen.compileWithDiagnostics();
    // Find cva blocks
    const code = result.code;
    const cvaBlocks = code.match(/const \w+Classes = cva\([\s\S]*?\);/g) || [];
    throw new Error("CVA BLOCKS:\n" + cvaBlocks.join('\n\n---\n\n'));
  });
});
