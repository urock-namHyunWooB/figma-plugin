import { describe, test, expect } from "vitest";
import airtableSelectButton from "../fixtures/item-slot-likes/airtable-select-button.json";
import taptapNavigation from "../fixtures/item-slot-likes/taptap-navigation.json";
import tadaList from "../fixtures/item-slot-likes/tada-list.json";
import { FigmaNodeData } from "@code-generator/types/baseType";
import FigmaCodeGenerator from "@code-generator";

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
  /**
   * airtable-select-button은 ButtonSetHeuristic으로 처리됨
   * Options variant("2 options", "3 options" 패턴)가 있으면 ArraySlot 대신 조건부 렌더링 사용
   */
  describe("airtable-select-button (ButtonSetHeuristic)", () => {
    test("Option들이 개별 렌더링되고, Option 3에 조건부 렌더링이 적용되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // Options prop 타입이 올바르게 정의되어야 함
      expect(code).toMatch(/Options\s*=\s*["']2 options["']\s*\|\s*["']3 options["']/);
      // Option 3에 조건부 렌더링이 있어야 함
      expect(code).toMatch(/options\s*===\s*["']3 options["']/);
    });

    test("각 버튼에 labelText가 prop 참조로 전달되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // SelectButton에 labelText prop이 optionNText 참조로 전달되어야 함
      expect(code).toMatch(/labelText\s*=\s*\{\s*option1Text\s*\}/);
      expect(code).toMatch(/labelText\s*=\s*\{\s*option2Text\s*\}/);
    });

    test("options prop의 타입이 VARIANT 리터럴이어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // options?: Options 형태
      expect(code).toMatch(/options\??\s*:\s*Options/);
      // Options 타입이 "2 options" | "3 options" 형태
      expect(code).toMatch(/type\s+Options\s*=\s*["']2 options["']\s*\|\s*["']3 options["']/);
    });
  });

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
    // airtable-select-button은 ButtonSetHeuristic으로 처리되므로 Array가 아닌 VARIANT 타입
    test("airtable-select-button의 options prop은 VARIANT 리터럴 타입이어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // Options 타입이 "2 options" | "3 options" 형태 (ButtonSetHeuristic)
      expect(code).toMatch(/type\s+Options\s*=\s*["']2 options["']\s*\|\s*["']3 options["']/);
    });

    test("생성된 코드의 interface에 items Array 타입이 있어야 한다", async () => {
      const data = taptapNavigation as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // interface에 items: Array<...> 패턴이 있어야 함
      expect(code).toMatch(/items\s*:\s*Array</);
    });

    test("ButtonSetHeuristic은 Options prop을 유지해야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // ButtonSetHeuristic에서 Options prop은 유지됨 (조건부 렌더링에 사용)
      expect(code).toMatch(/options\??\s*:\s*Options/);
    });
  });

  /**
   * ButtonSetHeuristic은 componentId와 무관하게 이름 기반으로 처리
   * Options variant 패턴이 있으면 조건부 렌더링 사용
   */
  describe("ButtonSetHeuristic componentId 처리", () => {
    test("ButtonSetHeuristic은 모든 Option을 개별 렌더링한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // Option 1, 2, 3이 모두 개별 SelectButton으로 렌더링되고 prop 참조 사용
      expect(code).toMatch(/labelText\s*=\s*\{\s*option1Text\s*\}/);
      expect(code).toMatch(/labelText\s*=\s*\{\s*option2Text\s*\}/);
    });

    test("다른 componentId를 가진 INSTANCE도 동일하게 처리된다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // componentId가 달라도 ButtonSetHeuristic은 이름 기반으로 병합
      // Option 1, 2가 각각 렌더링됨
      expect(code).toContain("<SelectButton");
    });
  });

  describe("ButtonSetHeuristic 조건부 렌더링", () => {
    /**
     * ButtonSetHeuristic은 Options variant를 조건부 렌더링으로 처리
     * "3 options"일 때만 Option 3이 표시됨
     */

    test("Option 3에 조건부 렌더링이 적용되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // options === "3 options" 조건이 있어야 함
      expect(code).toMatch(/options\s*===\s*["']3 options["']/);
    });

    test("Option 1, 2는 항상 표시되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // Option 1, 2는 조건 없이 렌더링 (prop 참조 사용)
      expect(code).toMatch(/labelText\s*=\s*\{\s*option1Text\s*\}/);
      expect(code).toMatch(/labelText\s*=\s*\{\s*option2Text\s*\}/);
    });
  });
});
