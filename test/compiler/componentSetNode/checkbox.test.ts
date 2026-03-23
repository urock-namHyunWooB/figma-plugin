import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import taptapCheckbox from "../../fixtures/checkbox/taptap-checkbox.json";
import type { FigmaNodeData } from "@code-generator2";

describe("Checkbox ComponentSet 컴파일 테스트", () => {
  test("컴파일이 성공해야 한다", async () => {
    const data = taptapCheckbox as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Checkbox");

    console.log("=== Generated Code ===");
    console.log(code);

    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });

  test("prop 이름에 공백이 있어도 정상 컴파일되어야 한다", async () => {
    const data = taptapCheckbox as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Checkbox");

    // "With label" → "withLabel"로 정규화되어야 함
    expect(code).toContain("withLabel");
    expect(code).not.toContain("With label");
    expect(code).not.toContain("with label");
  });

  test("인터페이스에 정규화된 prop 이름이 사용되어야 한다", async () => {
    const data = taptapCheckbox as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Checkbox");

    // CheckboxOwnProps 또는 CheckboxProps 인터페이스에 withLabel이 있어야 함
    expect(code).toMatch(/interface Checkbox(?:Own)?Props.*\{[\s\S]*withLabel/);
  });
});

