import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@compiler";
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
    
    // ColorCss가 생성되면 안됨 (I로 시작하는 노드가 삭제되어야 함)
    expect(code).not.toContain("ColorCss");
  });

  test("MonoResponsive 컴포넌트 내부에 ColorCss가 없어야 함", async () => {
    const compiler = new FigmaCodeGenerator(error02Fixture as any);
    const code = await compiler.compile();
    
    // MonoResponsive 컴포넌트 내부만 확인
    const monoMatch = code!.match(/function MonoResponsive[\s\S]*?^}/m);
    if (monoMatch) {
      expect(monoMatch[0]).not.toContain("ColorCss");
    }
  });
});
