import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import component02 from "../fixtures/any/component-02.json";
import type { FigmaNodeData } from "@compiler/types/index";

describe("component-02 렌더링 테스트", () => {
  test("StatusBar INSTANCE가 컴파일되어야 한다", async () => {
    const data = component02 as unknown as FigmaNodeData;
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("StatusBar");

    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });

  test("중첩 INSTANCE들이 렌더링되어야 한다", async () => {
    const data = component02 as unknown as FigmaNodeData;
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("StatusBar");

    // StatusBartime, StatusBarbattery 등 하위 컴포넌트가 포함되어야 함
    expect(code).toContain("StatusBartime");
    expect(code).toContain("StatusBarbattery");
  });

  test("SVG 요소가 포함되어야 한다", async () => {
    const data = component02 as unknown as FigmaNodeData;
    const compiler = new FigmaCompiler(data);
    const code = await compiler.getGeneratedCode("StatusBar");

    // notch SVG 등이 렌더링되어야 함
    expect(code).toContain("<svg");
    expect(code).toContain("<path");
  });
});

