import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import frame02 from "../fixtures/any/frame-02.json";
import type { FigmaNodeData } from "@code-generator2";

describe("frame-02 렌더링 테스트", () => {
  test("컴파일이 성공해야 한다", async () => {
    const data = frame02 as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.getGeneratedCode("SectionHeader");

    console.log("=== Generated Code ===");
    console.log(code);

    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });
});

