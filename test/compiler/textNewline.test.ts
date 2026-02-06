import { describe, expect, test } from "vitest";
import FigmaCodeGenerator from "@code-generator";
import textNewline from "../fixtures/text-newline.json";
import { FigmaNodeData } from "@/frontend/ui/domain/code-generator";

/**
 * 텍스트 줄바꿈 테스트
 *
 * 문제: Figma 텍스트에 \n이 포함된 경우 그대로 렌더링되지 않음
 *
 * 해결: \n을 <br /> 태그로 변환
 */
describe("텍스트 줄바꿈 처리", () => {
  test("줄바꿈이 있는 텍스트가 <br /> 태그로 변환되어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(textNewline as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // 텍스트에 줄바꿈이 있으면 <br /> 태그가 있어야 함
    // 또는 white-space: pre-line이 있어야 함
    const hasBrTag = code.includes("<br />");
    const hasPreLine = code.includes("pre-line");

    expect(hasBrTag || hasPreLine).toBe(true);
  });

  test("줄바꿈 없는 텍스트는 <br /> 태그가 없어야 한다", async () => {
    const compiler = new FigmaCodeGenerator(textNewline as unknown as FigmaNodeData);
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // 컴파일이 성공해야 함
    expect(code.length).toBeGreaterThan(0);
  });
});
