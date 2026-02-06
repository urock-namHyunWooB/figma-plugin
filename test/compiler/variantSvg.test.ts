import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator/FigmaCodeGenerator";
import type { FigmaNodeData } from "@code-generator/types/baseType";
import * as fs from "fs";

// TypedefaultRightIcontrue fixture
import typedefaultRightIcontrueFixture from "../fixtures/any/TypedefaultRightIcontrue.json";

describe("Variant SVG Mapping", () => {
  test("COMPONENT_SET의 다른 variant들이 서로 다른 SVG를 사용해야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      typedefaultRightIcontrueFixture as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    // 컴파일된 코드를 파일로 저장 (디버깅용)
    fs.mkdirSync("test/fixtures/any/compiled", { recursive: true });
    fs.writeFileSync(
      "test/fixtures/any/compiled/TypedefaultRightIcontrue.tsx",
      code || ""
    );

    expect(code).toBeDefined();

    // NormalResponsive 컴포넌트가 생성되어야 함
    expect(code).toContain("NormalResponsive");

    // size prop이 있어야 함
    expect(code).toContain("size");

    // SVG가 있어야 함 (fill="black"으로 원본 색상 유지)
    expect(code).toContain("<svg");
    expect(code).toContain('fill="black"');

    // 조건부 SVG 렌더링: size prop에 따라 다른 SVG가 렌더링되어야 함
    expect(code).toContain('size === "Normal"');

    // 두 개의 서로 다른 SVG가 있어야 함 (Arrow와 Dotted Square)
    // Arrow SVG: viewBox="0 0 24" 또는 "0 0 20 16"
    // Dotted Square SVG: viewBox="0 0 32 32" 또는 "0 0 24 24"
    const svgMatches = code.match(/<svg[^>]*viewBox="[^"]+"/g) || [];
    expect(svgMatches.length).toBeGreaterThanOrEqual(2);
  });
});
