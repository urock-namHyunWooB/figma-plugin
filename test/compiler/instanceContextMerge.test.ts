import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import error02Fixture from "../fixtures/any/error-02.json";

describe("INSTANCE 컨텍스트 병합 - visible 처리", () => {
  /**
   * 핵심 테스트: dependencies 컴파일 시 메인 컴포넌트의 INSTANCE 컨텍스트를 사용해야 함
   * 
   * error-02.json 구조:
   * - Global ComponentSet (250:78028)의 "Color=False" variant (250:78027)
   * - 내부 "Mono" INSTANCE (250:78017) → _Mono Responsive 참조
   * - "Mono" INSTANCE의 children에 "Color" 노드 (I250:78017;255:17770) 존재
   * - 이 노드는 I로 시작하므로 삭제되어야 함
   */
  
  test("dependencies 컴파일 시 INSTANCE 내부 노드(I...)가 삭제되어야 함", async () => {
    const compiler = new FigmaCodeGenerator(error02Fixture as any);
    const code = await compiler.compile();

    // MonoResponsive dependency의 Color (255:17770)는 정당한 노드이므로 CSS 생성됨
    expect(code).toContain("MonoResponsive_monoResponsiveColorCss");

    // 하지만 Main 컴포넌트에서 I... 노드로 인한 ColorCss는 생성되면 안됨
    expect(code).not.toContain("buttonSolidPrimaryContentsContentsGlobalMonoResponsiveColorCss");
  });

  test("MonoResponsive 컴포넌트는 정당한 Color 노드를 가짐", async () => {
    const compiler = new FigmaCodeGenerator(error02Fixture as any);
    const code = await compiler.compile();

    // MonoResponsive dependency의 Color (255:17770)는 정당한 노드
    // 따라서 MonoResponsive_monoResponsiveColorCss가 생성되어야 함
    expect(code).toContain("MonoResponsive_monoResponsiveColorCss");

    // MonoResponsive 함수 내에서 ColorCss를 참조해야 함
    const monoMatch = code!.match(/const MonoResponsive:[\s\S]*?^\};/m);
    if (monoMatch) {
      expect(monoMatch[0]).toContain("MonoResponsive_monoResponsiveColorCss");
    }
  });
});
