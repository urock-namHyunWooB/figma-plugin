import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * InputFieldtextField.json - Label/HelperText 감지 및 바인딩 테스트
 *
 * Fixture 구조:
 * - COMPONENT_SET: "Input Field/Text Field"
 * - Figma Props: Show Label, Show Guide, Show Button Icon, Icon Help, Status
 * - Label TEXT: "Label" (Input 위)
 * - HelperText TEXT: "Guide or Error Message" (Input 아래)
 *
 * 기대 결과:
 * - label/helperText가 string prop으로 변환
 * - 기존 visibility boolean prop(Show Label, Show Guide) 제거
 * - TEXT 노드에 prop 바인딩 설정
 */
describe("InputFieldtextField Label/HelperText 감지", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/any/InputFieldtextField.json"
  );

  let result: string | undefined;

  async function getCompiledCode(): Promise<string> {
    if (!result) {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
      result = await compiler.compile();
    }
    return result!;
  }

  it("컴파일이 성공해야 한다", async () => {
    const code = await getCompiledCode();
    expect(code).toBeTruthy();
    expect(code).toContain("InputFieldtextField:"); // v2는 arrow function
  });

  describe("Props Interface", () => {
    it("label?: string 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/label\?:\s*string/);
    });

    it("helperText?: string 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/helperText\?:\s*string/);
    });

    it("label이 React.ReactNode(slot)가 아니어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/label\?:\s*React\.ReactNode/);
    });

    it("helperText가 React.ReactNode(slot)가 아니어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/helperText\?:\s*React\.ReactNode/);
    });

    it("showLabel boolean prop이 제거되어야 한다", async () => {
      const code = await getCompiledCode();
      const propsMatch = code.match(
        /export interface InputFieldtextFieldProps[^{]*\{[\s\S]*?\n\}/
      );
      expect(propsMatch).not.toBeNull();
      expect(propsMatch![0]).not.toMatch(/showLabel\?:\s*boolean/);
    });

    it("showGuide boolean prop이 제거되어야 한다", async () => {
      const code = await getCompiledCode();
      const propsMatch = code.match(
        /export interface InputFieldtextFieldProps[^{]*\{[\s\S]*?\n\}/
      );
      expect(propsMatch).not.toBeNull();
      expect(propsMatch![0]).not.toMatch(/showGuide\?:\s*boolean/);
    });

    it("status variant prop이 유지되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/status\?:/);
    });
  });

  describe("Destructuring 기본값", () => {
    it("label 기본값이 'Label'이어야 한다", async () => {
      const code = await getCompiledCode();
      // const { label = "Label", ... } = props
      expect(code).toMatch(/label\s*=\s*["']Label["']/);
    });

    it("helperText 기본값이 'Guide or Error Message'여야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/helperText\s*=\s*["']Guide or Error Message["']/);
    });
  });

  describe("JSX 바인딩", () => {
    it("label이 {label}로 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/>\s*\{label\}\s*</);
    });

    it("helperText가 {helperText}로 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/>\s*\{helperText\}\s*</);
    });
  });
});
