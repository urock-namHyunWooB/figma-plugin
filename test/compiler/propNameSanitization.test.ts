import { describe, test, expect } from "vitest";
import { toCamelCase } from "@code-generator/utils/normalizeString";
import FigmaCodeGenerator, { FigmaNodeData } from "@code-generator2";
import component02 from "../fixtures/any/component-02.json";

describe("Prop 이름 정규화 테스트", () => {
  describe("toCamelCase 함수", () => {
    test("일반적인 prop 이름을 camelCase로 변환한다", () => {
      expect(toCamelCase("Size")).toBe("size");
      expect(toCamelCase("dark-mode")).toBe("darkMode");
      expect(toCamelCase("Left Icon")).toBe("leftIcon");
      expect(toCamelCase("font_size")).toBe("fontSize");
    });

    test("# 이후 부분을 제거한다", () => {
      expect(toCamelCase("Label#89:6")).toBe("label");
      expect(toCamelCase("Number#796:3")).toBe("number");
    });

    test("이모지/특수문자만 있고 숫자가 있으면 fallback 이름을 생성한다", () => {
      // "✏️ %#1408:0" → prop1408_0
      expect(toCamelCase("✏️ %#1408:0")).toBe("prop1408_0");
      // "#123:456" → prop123_456
      expect(toCamelCase("#123:456")).toBe("prop123_456");
      // "🎨#999" → prop999
      expect(toCamelCase("🎨#999")).toBe("prop999");
    });

    test("이모지/특수문자만 있고 숫자도 없으면 빈 문자열을 반환한다", () => {
      expect(toCamelCase("✏️")).toBe("");
      expect(toCamelCase("🎨🎨🎨")).toBe("");
      expect(toCamelCase("%%%")).toBe("");
    });

    test("숫자로 시작하는 ID도 처리한다", () => {
      expect(toCamelCase("#1:2")).toBe("prop1_2");
      expect(toCamelCase("##100")).toBe("prop100");
    });
  });

  describe("component-02 렌더링 (특수문자 prop 이름)", () => {
    test("특수문자 prop 이름이 있어도 구문 오류 없이 컴파일된다", async () => {
      const data = component02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile("StatusBar");

      expect(code).not.toBeNull();
      expect(code).toBeDefined();
      // 빈 prop 이름(="80")이 없어야 함
      expect(code).not.toMatch(/\s="[^"]+"/);
    });

    test("유효한 JSX 속성 형식이어야 한다", async () => {
      const data = component02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile("StatusBar");

      // 모든 JSX 속성은 name="value" 또는 name={expr} 형식이어야 함
      // 빈 이름( ="value")이 없어야 함
      const invalidAttrPattern = /\s=["'{[]/;
      expect(code).not.toMatch(invalidAttrPattern);
    });
  });
});
