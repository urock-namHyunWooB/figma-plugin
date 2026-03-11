import { describe, test, expect } from "vitest";
import FigmaCodeGenerator, { FigmaNodeData } from "@code-generator2";
import component02 from "../fixtures/any/component-02.json";
import listFixture from "../fixtures/regression/List.json";

describe("Prop 이름 정규화 테스트", () => {
  describe("box-drawing 문자 포함 visible ref (List fixture)", () => {
    // "┗ Required#17042:5" 같이 box-drawing 특수문자 + # ID가 포함된
    // componentPropertyReferences.visible 값이 있을 때,
    // HTML 충돌 prop(required)이 customRequired로 올바르게 rename되어야 한다.
    test("required → customRequired로 rename되어야 한다", async () => {
      const data = listFixture as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      // "{ required &&" 패턴이 없어야 함 (rename 전 이름 사용 금지)
      expect(code).not.toMatch(/\{\s*required\s*&&/);
    });

    test("customRequired가 visibleCondition prop으로 사용되어야 한다", async () => {
      const data = listFixture as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      // "{ customRequired &&" 패턴이 있어야 함
      expect(code).toMatch(/\{\s*customRequired\s*&&/);
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
