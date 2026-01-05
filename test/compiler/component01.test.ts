import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import component01 from "../fixtures/any/component-01.json";
import type { FigmaNodeData } from "@compiler/types/index";

describe("INSTANCE 루트 컴포넌트 테스트", () => {
  const data = component01 as unknown as FigmaNodeData;

  test("INSTANCE 루트가 컴파일되어야 한다", async () => {
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("HomeIndicator");
    
    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });

  test("INSTANCE 루트일 때 중복 선언이 없어야 한다", async () => {
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("HomeIndicator");
    
    // HomeIndicatorProps가 한 번만 선언되어야 함
    const propsMatches = code?.match(/interface HomeIndicatorProps/g);
    expect(propsMatches).toHaveLength(1);
    
    // export default function이 한 번만 있어야 함
    const exportMatches = code?.match(/export default function/g);
    expect(exportMatches).toHaveLength(1);
  });

  test("INSTANCE의 override 스타일이 반영되어야 한다", async () => {
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("HomeIndicator");
    
    // INSTANCE의 override된 크기 (393x34)가 반영되어야 함
    expect(code).toContain("393px");
    expect(code).toContain("34px");
  });

  test("INSTANCE의 children이 렌더링되어야 한다", async () => {
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("HomeIndicator");
    
    // 자식 요소 (Home Indicator RECTANGLE)가 있어야 함
    expect(code).toContain("HomeIndicatorCss_2");
  });
});

