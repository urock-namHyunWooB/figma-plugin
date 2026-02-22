import { describe, test, expect } from "vitest";
import taptapNavigation from "../fixtures/item-slot-likes/taptap-navigation.json";
import tadaList from "../fixtures/item-slot-likes/tada-list.json";
import { FigmaNodeData } from "@code-generator2";
import FigmaCodeGenerator from "@code-generator2";

/**
 * ArraySlot 감지 조건:
 * 1. 같은 부모 아래에
 * 2. 2개 이상의 INSTANCE가
 * 3. 같은 componentId를 참조하고
 * 4. componentPropertyReferences.visible이 없으면
 * → 배열/슬롯으로 처리
 *
 * 모든 테스트는 FigmaCodeGenerator 파이프라인을 통해 검증합니다.
 */

describe("ArraySlot 감지", () => {
  describe("taptap-navigation", () => {
    test("Item들이 배열로 감지되어 .map() 렌더링되어야 한다", async () => {
      const data = taptapNavigation as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // .map() 패턴이 있어야 함
      expect(code).toContain(".map(");
      // items.map( 패턴이 있어야 함
      expect(code).toContain("items.map(");
    });

    test("배열 슬롯 map에 key prop이 있어야 한다", async () => {
      const data = taptapNavigation as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code).toMatch(/key\s*=\s*\{/);
    });

    test("Item 컴포넌트가 map 안에서 렌더링되어야 한다", async () => {
      const data = taptapNavigation as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // Item 컴포넌트가 map 안에서 사용되어야 함
      expect(code).toMatch(/\.map\s*\([^)]*\)\s*=>\s*.*<Item/s);
    });
  });

  describe("tada-list (SECTION)", () => {
    test("SECTION 타입은 ArraySlot을 감지하지 않아야 한다", async () => {
      // SECTION 타입은 COMPONENT_SET/COMPONENT가 아니므로 ArraySlot 감지 안함
      const data = tadaList as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      // SECTION은 컴파일되지 않음 (null 반환)
      // 또는 컴파일되더라도 .map() 패턴이 없어야 함
      if (code !== null) {
        // ArraySlot .map() 패턴이 없어야 함
        expect(code).not.toMatch(/\.map\s*\(\s*\(\s*item/);
      }
    });

    test("Left/Right Icon은 visible 바인딩이 있어 배열로 감지되지 않아야 한다", async () => {
      const data = tadaList as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      if (code !== null) {
        // Left Icon, Right Icon이 .map() 안에 없어야 함
        // (visible 바인딩이 있으므로 조건부 렌더링 또는 slot으로 처리)
        expect(code).not.toMatch(/leftIcons\.map/i);
        expect(code).not.toMatch(/rightIcons\.map/i);
      }
    });
  });

  describe("Props 생성", () => {
    test("생성된 코드의 interface에 items Array 타입이 있어야 한다", async () => {
      const data = taptapNavigation as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // interface에 items: Array<...> 패턴이 있어야 함
      expect(code).toMatch(/items\s*:\s*Array</);
    });
  });
});
