import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FigmaCodeGenerator } from "@compiler/FigmaCodeGenerator";
import Engine from "@compiler/core/Engine";
import generate from "@babel/generator";

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

        const compiler = new FigmaCodeGenerator(nodeData, { debug: true });
        const code = await compiler.compile();

        // 컴파일 결과를 파일로 저장
        const outputPath = path.join(OUTPUT_DIR, fixture.replace(".json", ".tsx"));
        fs.writeFileSync(outputPath, code || "// Compile failed");

        expect(code).not.toBeNull();
      });
    });
  }
});

describe("Debug Headerroot Dynamic Styles", () => {
  it("should have dynamic styles for rightIcon slot", () => {
    const filePath = path.join(FAILING_FIXTURES_DIR, "Headerroot.json");
    if (!fs.existsSync(filePath)) {
      return; // skip if file doesn't exist
    }

    const nodeData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(nodeData, { debug: true });

    // Engine 생성 시 이미 컴파일이 완료됨
    const astTree = compiler.Engine.getFinalAstTree();

    const logs: string[] = [];

    // 1. rightIcon prop이 SLOT 타입인지 확인
    logs.push("=== Headerroot Props ===");
    Object.entries(astTree.props).forEach(([key, value]: [string, any]) => {
      logs.push(`${key}: type=${value.type}, originalType=${value.originalType || 'N/A'}`);
    });

    expect(astTree.props["rightIcon"]?.type).toBe("SLOT");

    // 2. Root의 dynamic styles 확인
    logs.push("\n=== Headerroot Dynamic Styles ===");
    if (astTree.style.dynamic && astTree.style.dynamic.length > 0) {
      astTree.style.dynamic.forEach((ds: any, i: number) => {
        const code = generate(ds.condition).code;
        logs.push(`[${i}] Condition: ${code}`);
        logs.push(`    Condition AST: ${JSON.stringify(ds.condition)}`);
        logs.push(`    Style: ${JSON.stringify(ds.style)}`);
      });
    } else {
      logs.push("No dynamic styles found (PROBLEM!)");
    }

    // 3. Base styles 확인
    logs.push("\n=== Headerroot Base Styles ===");
    logs.push(JSON.stringify(astTree.style.base, null, 2));

    // Dynamic styles 길이 확인
    logs.push(`\n=== Dynamic Styles Length: ${astTree.style.dynamic?.length || 0} ===`);

    // styleTree에서 직접 스타일 확인
    logs.push("\n=== StyleTree Root ===");
    const styleTree = compiler.SpecDataManager.getRenderTree();
    logs.push(`Children count: ${styleTree.children?.length}`);
    styleTree.children?.forEach((child: any) => {
      logs.push(`  ${child.name}: ${JSON.stringify(child.cssStyle)}`);
    });

    // 로그를 파일로 저장
    fs.writeFileSync(path.join(OUTPUT_DIR, "headerroot-debug.log"), logs.join("\n"));
  });
});
