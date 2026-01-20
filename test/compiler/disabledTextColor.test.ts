import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import * as fs from "fs";
import * as path from "path";

describe("Disabled 상태 텍스트 색상 처리", () => {
  const jsonPath = path.join(__dirname, "../fixtures/failing/Large.json");
  const figmaData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  test("Color별 Disabled 텍스트 색상이 다르게 적용되어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // ADisabledColorStyles 레코드가 생성되어야 함
    expect(code).toContain("ADisabledColorStyles");

    // Primary는 빈 객체 (흰색 유지)
    expect(code).toMatch(/Primary:\s*\{\s*\}/);

    // Light, Neutral, Black은 회색 텍스트
    expect(code).toContain('color: "#B2B2B2"');
  });

  test("TEXT 노드에 indexedConditional 패턴이 적용되어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // ACss 함수가 color와 customDisabled 파라미터를 받아야 함 (멀티라인)
    expect(code).toMatch(/ACss\s*=\s*\([^)]*\$color[^)]*\$customDisabled[^)]*\)/s);

    // customDisabled 조건부 스타일 적용
    expect(code).toMatch(/\$customDisabled\s*\?\s*ADisabledColorStyles\[\$color\]/);
  });

  test("버튼의 :disabled pseudo-class에 color 속성이 없어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // LargeCss에 :disabled { color: ... } 가 없어야 함
    // (TEXT 노드에서 indexedConditional로 처리하므로)
    const largeCssMatch = code?.match(/const LargeCss[\s\S]*?`;/);
    if (largeCssMatch) {
      const largeCss = largeCssMatch[0];
      // :disabled pseudo-class가 없거나, color 속성이 없어야 함
      expect(largeCss).not.toMatch(/:disabled\s*\{[^}]*color:/);
    }
  });

  test("AColorStyles에 기본 Color별 텍스트 색상이 있어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // AColorStyles 레코드가 생성되어야 함
    expect(code).toContain("AColorStyles");

    // Primary는 흰색
    expect(code).toMatch(/Primary:\s*\{[^}]*color:[^}]*#FFF/i);

    // Light는 검정
    expect(code).toMatch(/Light:\s*\{[^}]*color:[^}]*#000/i);
  });

  test("JSX에서 ACss 함수가 올바른 인자로 호출되어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // span에서 ACss(color, customDisabled) 형태로 호출
    expect(code).toMatch(/<span\s+css=\{ACss\(color,\s*customDisabled\)\}/);
  });
});

describe("Disabled 배경색 처리 (기존 기능 확인)", () => {
  const jsonPath = path.join(__dirname, "../fixtures/failing/Large.json");
  const figmaData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  test("LargeDisabledColorStyles에 Color별 배경색이 있어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // LargeDisabledColorStyles 레코드가 생성되어야 함
    expect(code).toContain("LargeDisabledColorStyles");

    // Primary: 연한 파란색 배경
    expect(code).toMatch(/Primary:\s*\{[^}]*background:[^}]*#CCE2FF/i);

    // Neutral: 회색 배경
    expect(code).toMatch(/Neutral:\s*\{[^}]*background:[^}]*#979797/i);

    // Black: 어두운 회색 배경
    expect(code).toMatch(/Black:\s*\{[^}]*background:[^}]*#2A2A2A/i);
  });

  test("버튼에서 customDisabled 조건부 배경색이 적용되어야 한다", async () => {
    const compiler = new FigmaCompiler(figmaData);
    const code = await compiler.compile();

    expect(code).toBeTruthy();

    // LargeCss에 customDisabled 조건부 스타일 적용
    expect(code).toMatch(/\$customDisabled\s*\?\s*LargeDisabledColorStyles\[\$color\]/);
  });
});
