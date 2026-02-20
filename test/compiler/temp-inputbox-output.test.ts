import { describe, test } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";

// InputBoxstandard fixture
import inputBoxStandardFixture from "../fixtures/any/InputBoxstandard.json";

describe("InputBoxstandard - 컴파일 결과 출력", () => {
  test("컴파일 결과 확인", async () => {
    const compiler = new FigmaCodeGenerator(
      inputBoxStandardFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();
    
    console.log("\n");
    console.log("=".repeat(80));
    console.log("COMPILED CODE START");
    console.log("=".repeat(80));
    console.log(code);
    console.log("=".repeat(80));
    console.log("COMPILED CODE END");
    console.log("=".repeat(80));
    console.log("\n");
  });
});
