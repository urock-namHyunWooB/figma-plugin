import { describe, it } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid gap check", () => {
  it("trace collectVariantStyles gap", () => {
    (globalThis as any).__collectTrace = [];
    (globalThis as any).__styleObjTrace = [];

    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    gen.buildUITree();

    const collect = (globalThis as any).__collectTrace;
    const styleObj = (globalThis as any).__styleObjTrace;

    // Count Content nodes in collect
    const contentEntries = collect.filter((e: any) => e.name === "Content");

    throw new Error("DIAG:\n" +
      "collectTrace total: " + collect.length + "\n" +
      "Content entries: " + contentEntries.length + "\n" +
      "sample Content: " + JSON.stringify(contentEntries.slice(0, 3), null, 2) + "\n" +
      "unique names: " + JSON.stringify([...new Set(collect.map((e: any) => e.name))]) + "\n" +
      "styleObjTrace: " + JSON.stringify(styleObj, null, 2)
    );
  });
});
