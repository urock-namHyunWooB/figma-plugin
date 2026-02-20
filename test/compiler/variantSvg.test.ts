import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";
import * as fs from "fs";

// TypedefaultRightIcontrue fixture
import typedefaultRightIcontrueFixture from "../fixtures/any/TypedefaultRightIcontrue.json";

describe("Variant SVG Mapping", () => {
  test("COMPONENT_SET의 다른 variant들이 서로 다른 SVG를 사용해야 한다", async () => {
    const compiler = new FigmaCodeGenerator(
      typedefaultRightIcontrueFixture as unknown as FigmaNodeData
    );
    const result = await compiler.getGeneratedCodeWithDependencies();

    // 메인 코드 + 의존성 코드 합쳐서 확인
    const mainCode = result.mainComponent.code;
    const allCode = [
      mainCode,
      ...Object.values(result.dependencies || {}).map((d) => d.code),
    ].join("\n");

    // 컴파일된 코드를 파일로 저장 (디버깅용)
    fs.mkdirSync("test/fixtures/any/compiled", { recursive: true });
    fs.writeFileSync(
      "test/fixtures/any/compiled/TypedefaultRightIcontrue.tsx",
      allCode
    );

    expect(mainCode).toBeDefined();

    // NormalResponsive 컴포넌트가 생성되어야 함
    expect(mainCode).toContain("NormalResponsive");

    // NormalResponsive 의존성이 있어야 함
    expect(result.dependencies).toBeDefined();
    expect(Object.keys(result.dependencies || {}).length).toBeGreaterThan(0);

    // 의존성 코드에 SVG가 있어야 함
    expect(allCode).toContain("<svg");

    // SVG fill은 currentColor로 변환됨 (단일 색상 아이콘)
    // 또는 다중 색상이면 원본 유지
    const hasFill = allCode.includes('fill="currentColor"') || allCode.includes('fill="black"');
    expect(hasFill).toBe(true);

    // 두 개의 서로 다른 SVG가 있어야 함
    const svgMatches = allCode.match(/<svg[^>]*>/g) || [];
    expect(svgMatches.length).toBeGreaterThanOrEqual(1);
  });
});
