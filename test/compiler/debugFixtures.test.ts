import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FigmaCompiler } from "@compiler/FigmaCompiler";

const FAILING_FIXTURES_DIR = path.join(__dirname, "../fixtures/failing");
const OUTPUT_DIR = path.join(__dirname, "../fixtures/failing/compiled");

// failing 디렉토리가 없으면 빈 배열
const fixtures = fs.existsSync(FAILING_FIXTURES_DIR)
  ? fs.readdirSync(FAILING_FIXTURES_DIR).filter(f => f.endsWith(".json"))
  : [];

describe("Debug Failing Fixtures", () => {
  if (fixtures.length === 0) {
    it.skip("no failing fixtures to debug", () => {});
  } else {
    // 출력 디렉토리 생성
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    fixtures.forEach((fixture) => {
      it(`compile ${fixture}`, async () => {
        const filePath = path.join(FAILING_FIXTURES_DIR, fixture);
        const nodeData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

        const compiler = new FigmaCompiler(nodeData, { debug: true });
        const code = await compiler.compile();

        // 컴파일 결과를 파일로 저장
        const outputPath = path.join(OUTPUT_DIR, fixture.replace(".json", ".tsx"));
        fs.writeFileSync(outputPath, code || "// Compile failed");

        expect(code).not.toBeNull();
      });
    });
  }
});
