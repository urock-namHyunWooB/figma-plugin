import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FigmaCompiler } from "@compiler/FigmaCompiler";

/**
 * COMPONENT_SET 내 variant별 노드 위치 처리 테스트
 *
 * 문제 상황:
 * - COMPONENT_SET은 여러 variant를 가지며, 각 variant는 Figma 캔버스에서 다른 위치에 있음
 * - variant를 머지할 때 특정 variant에만 존재하는 노드의 위치가 잘못 계산되는 문제
 * - 예: X3 variant의 Group21233이 top: 144px로 잘못 표시됨 (0px가 되어야 함)
 *
 * 해결책:
 * - COMPONENT_SET의 variant-specific 노드(모든 variant에 존재하지 않는 노드)는
 *   absoluteBoundingBox가 아닌 0,0 기준으로 위치 계산
 */
describe("COMPONENT_SET variant position", () => {
  test("variant-specific 노드는 top: 0px로 렌더링되어야 한다", async () => {
    const filePath = path.join(__dirname, "../fixtures/failing/ColorbrandLogo.json");

    // 파일이 없으면 테스트 스킵
    if (!fs.existsSync(filePath)) {
      console.log("ColorbrandLogo.json not found, skipping test");
      return;
    }

    const nodeData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const compiler = new FigmaCompiler(nodeData);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // variant-specific 노드의 스타일에서 top: 144px가 없어야 함
    // (144px는 variant 간 오프셋으로 잘못된 값)
    expect(code).not.toContain("top: 144px");

    // variant-specific 노드들은 top: 0px를 가져야 함
    // Group21233 관련 스타일에서 확인
    if (code?.includes("Group21233")) {
      // Group21233 스타일이 있으면 top: 0px여야 함
      const groupStyleMatch = code.match(/Group21233[^}]*top:\s*(\d+)px/);
      if (groupStyleMatch) {
        expect(groupStyleMatch[1]).toBe("0");
      }
    }
  });

  test("모든 variant에 존재하는 노드는 정상 위치를 가져야 한다", async () => {
    const filePath = path.join(__dirname, "../fixtures/failing/ColorbrandLogo.json");

    if (!fs.existsSync(filePath)) {
      console.log("ColorbrandLogo.json not found, skipping test");
      return;
    }

    const nodeData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const compiler = new FigmaCompiler(nodeData);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // Union 노드는 모든 variant에 존재하므로 정상 위치를 가짐
    // 해당 노드의 left 값이 존재해야 함
    expect(code).toMatch(/left:\s*\d+px/);
  });

  test("SVG fill 색상이 보존되어야 한다", async () => {
    const filePath = path.join(__dirname, "../fixtures/failing/ColorbrandLogo.json");

    if (!fs.existsSync(filePath)) {
      console.log("ColorbrandLogo.json not found, skipping test");
      return;
    }

    const nodeData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const compiler = new FigmaCompiler(nodeData);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // SVG path의 fill 색상이 보존되어야 함
    // currentColor로 변환되면 안 됨
    expect(code).toContain('fill="#0050FF"');
    expect(code).toContain('fill="white"');
    expect(code).toContain('fill="black"');

    // currentColor는 SVG path의 fill에 나타나면 안 됨
    // (SVG 내부의 fill 속성만 체크)
    const svgMatches = code?.match(/<svg[\s\S]*?<\/svg>/g) || [];
    for (const svg of svgMatches) {
      expect(svg).not.toContain('fill="currentColor"');
    }
  });
});
