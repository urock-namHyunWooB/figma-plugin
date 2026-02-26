import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import component01 from "../fixtures/any/component-01.json";
import type { FigmaNodeData } from "@code-generator2";

describe("INSTANCE 루트 컴포넌트 테스트", () => {
  const data = component01 as unknown as FigmaNodeData;

  test("INSTANCE 루트가 컴파일되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("HomeIndicator");
    
    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });

  test("INSTANCE 루트일 때 중복 선언이 없어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(data);
    const result = await compiler.getGeneratedCodeWithDependencies("HomeIndicator");

    // 메인 컴포넌트 코드 확인 (v2 형식)
    expect(result.mainCode).toBeDefined();
    expect(result.mainName).toBeTruthy();

    // 메인 컴포넌트에 HomeindicatorProps가 있어야 함 (v2는 camelCase)
    const propsMatches = result.mainCode.match(/interface HomeindicatorProps/g);
    expect(propsMatches).toHaveLength(1);

    // 메인 컴포넌트에 export default가 한 번만 있어야 함
    const exportMatches = result.mainCode.match(/export default/g);
    expect(exportMatches).toHaveLength(1);

    // dependencies는 별도로 확인 (각각 독립적인 export default를 가짐)
    expect(result.dependencies).toBeDefined();
  });

  test("INSTANCE의 override 스타일이 반영되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("HomeIndicator");
    
    // INSTANCE의 override된 크기 (393x34)가 반영되어야 함
    expect(code).toContain("393px");
    expect(code).toContain("34px");
  });

  test("INSTANCE의 children이 렌더링되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("HomeIndicator");

    expect(code).toBeDefined();

    // 자식 요소 (Home Indicator RECTANGLE)가 렌더링되어야 함
    // v2는 컴포넌트이름+노드이름 기반 CSS 네이밍 사용
    expect(code).toMatch(/homeindicator.*Css/);

    // span 자식 요소가 있어야 함
    expect(code).toContain("<span");
  });
});

