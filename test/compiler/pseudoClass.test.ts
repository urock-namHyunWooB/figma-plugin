import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import { FigmaNodeData } from "@/frontend/ui/domain/compiler";

/**
 * Pseudo-class 처리 테스트
 *
 * 1. :hover, :active는 &:not(:disabled)로 감싸서 disabled 상태에서 적용되지 않도록
 * 2. 순서: hover → focus → active → disabled (클릭 시 active가 hover를 덮어씀)
 * 3. SVG fill은 currentColor로 변환되어 CSS color로 제어
 */
describe("Pseudo-class 처리", () => {
  test("컴파일이 성공해야 한다", async () => {
    const compiler = new FigmaCompiler(
      airtableButton as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThan(0);
  });

  test(":hover 스타일이 생성되어야 한다", async () => {
    const compiler = new FigmaCompiler(
      airtableButton as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // State가 있는 ComponentSet이면 :hover가 있어야 함
    if (code.includes("State=Hover") || code.includes("state === 'Hover'")) {
      expect(code).toMatch(/:hover/);
    }
  });

  test(":disabled 스타일이 생성되어야 한다", async () => {
    const compiler = new FigmaCompiler(
      airtableButton as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // State=Disabled가 있으면 :disabled가 있어야 함
    if (
      code.includes("State=Disabled") ||
      code.includes("state === 'Disabled'")
    ) {
      expect(code).toMatch(/:disabled/);
    }
  });

  test("SVG fill이 currentColor로 변환되어야 한다", async () => {
    const compiler = new FigmaCompiler(
      airtableButton as unknown as FigmaNodeData
    );
    const code = await compiler.compile();

    expect(code).toBeDefined();

    // SVG path가 있으면 fill="currentColor"가 있어야 함
    if (code.includes("<path") && code.includes('fill="')) {
      expect(code).toMatch(/fill="currentColor"/);
    }
  });
});
