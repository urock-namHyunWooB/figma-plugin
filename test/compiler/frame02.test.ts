import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import frame02 from "../fixtures/any/frame-02.json";
import type { FigmaNodeData } from "@compiler/types/index";

describe("frame-02 렌더링 테스트", () => {
  test("컴파일이 성공해야 한다", async () => {
    const data = frame02 as unknown as FigmaNodeData;
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("SectionHeader");

    console.log("=== Generated Code ===");
    console.log(code);

    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });
});

