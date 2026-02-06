import { describe, test, expect, beforeAll } from "vitest";
import { FigmaCodeGenerator } from "@code-generator/FigmaCodeGenerator";
import urockList from "../fixtures/any-component-set/urock-list.json";

describe("부분 텍스트 스타일링 (characterStyleOverrides)", () => {
  let generatedCode: string;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(urockList as any);
    generatedCode = (await compiler.getGeneratedCode()) || "";
  });

  test("컴파일이 성공해야 한다", () => {
    expect(generatedCode).toBeTruthy();
    expect(generatedCode.length).toBeGreaterThan(0);
  });

  describe("안심삭제 1회당 3,300원 텍스트", () => {
    test("기본 스타일 텍스트(안심삭제 1회당)가 검은색이어야 한다", () => {
      // "안심삭제 1회당"은 기본 스타일(styleIndex 0)으로 검은색 (#1a1a1a)
      expect(generatedCode).toMatch(/color:\s*["']#1a1a1a["']/i);
      expect(generatedCode).toContain("안심삭제 1회당");
    });

    test("오버라이드 스타일 텍스트(3,300)가 파란색이어야 한다", () => {
      // "3,300"은 오버라이드 스타일(styleIndex 9)로 파란색 (#4978eb)
      expect(generatedCode).toMatch(/color:\s*["']#4978eb["']/i);
      // 코드에 3,300 텍스트가 있어야 함
      expect(generatedCode).toContain(">3,300</span>");
    });

    test("텍스트가 여러 span으로 분할되어야 한다", () => {
      // "안심삭제 1회당 " + "3,300" + "원" = 최소 2개 이상의 span
      const spanMatches = generatedCode.match(/<span\s+style=\{\{/g);
      expect(spanMatches).toBeTruthy();
      expect(spanMatches!.length).toBeGreaterThanOrEqual(2);
    });

    test("기본 스타일 세그먼트에 fontWeight가 포함되어야 한다", () => {
      // 기본 스타일의 fontWeight: 500
      expect(generatedCode).toMatch(/fontWeight:\s*["']500["']/);
    });

    test("오버라이드 스타일 세그먼트에 fontWeight가 포함되어야 한다", () => {
      // 오버라이드 스타일의 fontWeight: 700
      expect(generatedCode).toMatch(/fontWeight:\s*["']700["']/);
    });
  });

  describe("1회 이용권 텍스트", () => {
    test("부분 스타일링이 적용되어야 한다", () => {
      // "1회 이용권"도 characterStyleOverrides가 있음
      // characterStyleOverrides: [0, 3, 3, 3, 3, 3]
      // "1" = 기본 스타일, "회 이용권" = 스타일 3
      // 텍스트가 분리되어 생성됨
      expect(generatedCode).toContain(">1</span>");
      expect(generatedCode).toContain("회 이용권");
    });
  });
});
