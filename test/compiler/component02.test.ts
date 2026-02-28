import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import component02 from "../fixtures/any/component-02.json";
import type { FigmaNodeData } from "@code-generator2";

describe("component-02 렌더링 테스트", () => {
  test("StatusBar INSTANCE가 컴파일되어야 한다", async () => {
    const data = component02 as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("StatusBar");

    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });

  test("중첩 INSTANCE들이 렌더링되어야 한다", async () => {
    const data = component02 as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("StatusBar");

    // v2는 camelCase로 정규화 (toComponentName 규칙에 따라 casing 다를 수 있음)
    // "statusBartime" 또는 "Statusbartime" 등의 형태
    expect(code).toMatch(/statusbartime/i);
    expect(code).toMatch(/statusbarbattery/i);
  });

  test("SVG 요소가 포함되어야 한다", async () => {
    const data = component02 as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("StatusBar");

    // notch SVG 등이 렌더링되어야 함
    expect(code).toContain("<svg");
    expect(code).toContain("<path");
  });
});

