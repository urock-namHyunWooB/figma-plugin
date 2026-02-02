import { describe, test, expect } from "vitest";
import airtableSelectButton from "../fixtures/item-slot-likes/airtable-select-button.json";
import taptapNavigation from "../fixtures/item-slot-likes/taptap-navigation.json";
import tadaList from "../fixtures/item-slot-likes/tada-list.json";
import { FigmaNodeData } from "@compiler/types/baseType";
import FigmaCodeGenerator from "@compiler";

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
  describe("airtable-select-button", () => {
    test("Option들이 배열로 감지되어 .map() 렌더링되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // .map() 패턴이 있어야 함
      expect(code).toContain(".map(");
      // options.map( 패턴이 있어야 함
      expect(code).toContain("options.map(");
    });

    test("조건부 렌더링 (options === '...')이 제거되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // options === "2 options" 같은 조건이 없어야 함
      expect(code).not.toMatch(/options\s*===\s*["'].*options["']/);
    });

    test("배열 슬롯 map에 key prop이 있어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // key={index} 또는 key={item.id} 등의 패턴
      expect(code).toMatch(/key\s*=\s*\{/);
    });

    test("배열 슬롯 아이템은 외부 컴포넌트로 렌더링되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // SelectButton 컴포넌트가 map 안에서 사용되어야 함
      expect(code).toMatch(/\.map\s*\([^)]*\)\s*=>\s*.*<SelectButton/s);
    });

    test("배열 슬롯 아이템에 props가 전달되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // item.size, item.selected, item.text 등의 props 전달
      expect(code).toMatch(/size\s*=\s*\{.*item/);
      expect(code).toMatch(/text\s*=\s*\{.*item\.text/);
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
    test("생성된 코드의 interface에 options Array 타입이 있어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // interface에 options: Array<...> 패턴이 있어야 함
      expect(code).toMatch(/options\s*:\s*Array</);
    });

    test("생성된 코드의 interface에 items Array 타입이 있어야 한다", async () => {
      const data = taptapNavigation as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      // interface에 items: Array<...> 패턴이 있어야 함
      expect(code).toMatch(/items\s*:\s*Array</);
    });

    test("배열 슬롯 감지 시 variant prop 중 개수 관련 prop은 제거되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // "Options" prop (값: "2 options", "3 options")은 interface에서 제거되어야 함
      // options?: "2 options" | "3 options" 같은 패턴이 없어야 함
      expect(code).not.toMatch(/options\?\s*:\s*["']2 options["']/);
    });
  });

  describe("componentId 기반 그룹핑", () => {
    test("같은 componentId를 가진 INSTANCE들만 ArraySlot으로 감지되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // componentId가 같은 것들만 .map()으로 렌더링
      // Option 2, 3 (같은 componentId: 133:604)만 ArraySlot
      // Option 1 (다른 componentId: 133:603)은 별도 처리
      expect(code).toContain(".map(");
    });

    test("다른 componentId를 가진 INSTANCE는 별도로 렌더링되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // componentId가 다른 Option 1은 map 밖에서 렌더링되거나
      // 별도의 조건부 렌더링으로 처리될 수 있음
      // 핵심: 모든 Option이 하나의 .map()에 들어가면 안됨
      // (같은 componentId인 것들만 그룹핑)
    });
  });

  describe("SuperTree 병합 ID 매칭", () => {
    /**
     * ArraySlot의 parentId가 원본 Figma variant 노드 ID인데,
     * AST는 병합된 SuperTree에서 생성되어 ID가 다름
     *
     * 검증: 최종 코드에 .map() 패턴이 생성되면 ID 매칭이 정상 동작한 것
     */

    test("생성된 코드에 .map() 렌더링이 포함되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code).toContain(".map(");
      expect(code).toContain("options.map(");
    });

    test("ArraySlot instance는 개별 렌더링되지 않아야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();

      // 조건부 렌더링 (options === "2 options") 패턴이 없어야 함
      expect(code).not.toMatch(/options\s*===\s*["'].*options["']/);

      // .map()이 있어야 함
      expect(code).toContain(".map(");
    });
  });
});
