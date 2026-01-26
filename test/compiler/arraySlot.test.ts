import { describe, test, expect, beforeAll } from "vitest";
import airtableSelectButton from "../fixtures/item-slot-likes/airtable-select-button.json";
import taptapNavigation from "../fixtures/item-slot-likes/taptap-navigation.json";
import tadaList from "../fixtures/item-slot-likes/tada-list.json";
import ArraySlotDetector from "@compiler/core/ArraySlotDetector";
import { FigmaNodeData } from "@compiler/types/baseType";
import FigmaCodeGenerator from "@compiler";

/**
 * ArraySlot 감지 조건:
 * 1. 같은 부모 아래에
 * 2. 2개 이상의 INSTANCE가
 * 3. 같은 "원본 컴포넌트"를 참조하고 (componentSetId 또는 componentId)
 * 4. componentPropertyReferences.visible이 없으면
 * → 배열/슬롯으로 처리
 */

describe("ArraySlot 감지", () => {
  describe("airtable-select-button", () => {
    test("Option들이 배열로 감지되어야 한다", () => {
      // Arrange
      const data = airtableSelectButton;

      // Act
      // TODO: const result = ArraySlotDetector.detect(data);

      // Assert
      // Option 1, Option 2, Option 3이 같은 componentSetId(1268:564)를 참조
      // componentPropertyReferences.visible이 없음
      // → 배열로 감지되어야 함

      // expect(result).toContainEqual({
      //   parentId: expect.any(String),
      //   instanceNames: ["Option 1", "Option 2", "Option 3"],
      //   componentSetId: "1268:564",
      //   isArraySlot: true,
      // });

      expect(true).toBe(true); // placeholder
    });

    test("componentPropertyReferences.visible이 없어야 한다", () => {
      const data = airtableSelectButton;

      // Option 노드들에 componentPropertyReferences.visible이 없는지 확인
      const document = data.info.document;
      const firstVariant = document.children[0];
      const options = firstVariant.children.filter(
        (child: any) =>
          child.type === "INSTANCE" && child.name.startsWith("Option")
      );

      options.forEach((option: any) => {
        expect(option.componentPropertyReferences?.visible).toBeUndefined();
      });
    });

    test("같은 componentSetId를 참조해야 한다", () => {
      const data = airtableSelectButton;
      const components = data.info.components;

      // Option들의 componentId가 참조하는 componentSetId 확인
      const componentSetIds = new Set<string>();

      const document = data.info.document;
      const firstVariant = document.children[0];
      const options = firstVariant.children.filter(
        (child: any) =>
          child.type === "INSTANCE" && child.name.startsWith("Option")
      );

      options.forEach((option: any) => {
        const componentId = option.componentId;
        const component = components[componentId];
        if (component?.componentSetId) {
          componentSetIds.add(component.componentSetId);
        }
      });

      // 모든 Option이 같은 componentSetId를 참조해야 함
      expect(componentSetIds.size).toBe(1);
      expect(componentSetIds.has("1268:564")).toBe(true);
    });
  });

  describe("taptap-navigation", () => {
    test("Item들이 배열로 감지되어야 한다", () => {
      const data = taptapNavigation;

      // items-count ▾ FRAME 안의 Item INSTANCE들
      const document = data.info.document;
      const firstVariant = document.children[0];
      const itemsCountFrame = firstVariant.children.find(
        (child: any) => child.name === "items-count ▾"
      );

      expect(itemsCountFrame).toBeDefined();

      const items = itemsCountFrame?.children.filter(
        (child: any) => child.type === "INSTANCE" && child.name === "Item"
      );

      // Item이 2개 이상이어야 함
      expect(items?.length).toBeGreaterThanOrEqual(2);

      // componentPropertyReferences.visible이 없어야 함
      items?.forEach((item: any) => {
        expect(item.componentPropertyReferences?.visible).toBeUndefined();
      });
    });

    test("Item들이 같은 componentSetId를 참조해야 한다", () => {
      const data = taptapNavigation;
      const components = data.info.components;

      const document = data.info.document;
      const firstVariant = document.children[0];
      const itemsCountFrame = firstVariant.children.find(
        (child: any) => child.name === "items-count ▾"
      );

      const items = itemsCountFrame?.children.filter(
        (child: any) => child.type === "INSTANCE" && child.name === "Item"
      );

      const componentSetIds = new Set<string>();
      items?.forEach((item: any) => {
        const componentId = item.componentId;
        const component = components[componentId];
        if (component?.componentSetId) {
          componentSetIds.add(component.componentSetId);
        }
      });

      // 모든 Item이 같은 componentSetId(4:3622)를 참조해야 함
      expect(componentSetIds.size).toBe(1);
      expect(componentSetIds.has("4:3622")).toBe(true);
    });
  });

  describe("tada-list", () => {
    test("Variant들이 배열로 감지되어야 한다", () => {
      const data = tadaList;

      // SECTION 안의 Variant INSTANCE들
      const document = data.info.document;
      const variants = document.children.filter(
        (child: any) => child.type === "INSTANCE" && child.name === "Variant"
      );

      // Variant가 2개 이상이어야 함
      expect(variants.length).toBeGreaterThanOrEqual(2);

      // 같은 componentId를 참조해야 함
      const componentIds = new Set(variants.map((v: any) => v.componentId));
      expect(componentIds.size).toBe(1);
      expect(componentIds.has("247:56500")).toBe(true);

      // componentPropertyReferences.visible이 없어야 함
      variants.forEach((variant: any) => {
        expect(variant.componentPropertyReferences?.visible).toBeUndefined();
      });
    });

    test("List/General들이 배열로 감지되어야 한다", () => {
      const data = tadaList;
      const components = data.info.components;

      // List/General INSTANCE들 찾기 (중첩된 구조에서)
      const findInstances = (node: any, name: string): any[] => {
        const results: any[] = [];
        if (node.type === "INSTANCE" && node.name === name) {
          results.push(node);
        }
        if (node.children) {
          node.children.forEach((child: any) => {
            results.push(...findInstances(child, name));
          });
        }
        return results;
      };

      const listGenerals = findInstances(data.info.document, "List/General");

      // List/General이 2개 이상이어야 함
      expect(listGenerals.length).toBeGreaterThanOrEqual(2);

      // 같은 componentSetId를 참조해야 함
      const componentSetIds = new Set<string>();
      listGenerals.forEach((instance: any) => {
        const componentId = instance.componentId;
        const component = components[componentId];
        if (component?.componentSetId) {
          componentSetIds.add(component.componentSetId);
        }
      });

      expect(componentSetIds.size).toBe(1);
      expect(componentSetIds.has("113:26161")).toBe(true);
    });

    test("Left Icon, Right Icon은 배열로 감지되지 않아야 한다 (visible 바인딩 있음)", () => {
      const data = tadaList;

      // Left Icon, Right Icon 찾기
      const findInstances = (node: any, name: string): any[] => {
        const results: any[] = [];
        if (node.type === "INSTANCE" && node.name === name) {
          results.push(node);
        }
        if (node.children) {
          node.children.forEach((child: any) => {
            results.push(...findInstances(child, name));
          });
        }
        return results;
      };

      const leftIcons = findInstances(data.info.document, "Left Icon");
      const rightIcons = findInstances(data.info.document, "Right Icon");

      // Left Icon들은 componentPropertyReferences.visible이 있어야 함
      leftIcons.forEach((icon: any) => {
        expect(icon.componentPropertyReferences?.visible).toBeDefined();
      });

      // Right Icon들은 componentPropertyReferences.visible이 있어야 함
      rightIcons.forEach((icon: any) => {
        expect(icon.componentPropertyReferences?.visible).toBeDefined();
      });
    });
  });

  describe("ArraySlotDetector 통합 테스트", () => {
    /**
     * ArraySlotDetector 반환 타입 예상:
     * {
     *   parentId: string;           // 배열 슬롯의 부모 노드 ID
     *   parentName: string;         // 부모 노드 이름
     *   slotName: string;           // 슬롯 이름 (예: "items", "options")
     *   componentSetId?: string;    // 참조하는 ComponentSet ID
     *   componentId?: string;       // 참조하는 Component ID (ComponentSet이 없는 경우)
     *   instances: Array<{          // 감지된 INSTANCE들
     *     id: string;
     *     name: string;
     *     componentProperties: Record<string, any>;
     *   }>;
     *   itemProps: Array<{          // 배열 아이템의 prop 정의
     *     name: string;             // prop 이름 (예: "size", "selected", "label")
     *     type: string;             // prop 타입 (예: "VARIANT", "TEXT")
     *     values?: string[];        // 가능한 값들 (VARIANT인 경우)
     *   }>;
     * }
     */

    test("airtable-select-button에서 배열 슬롯을 감지해야 한다", () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // 배열 슬롯이 감지되어야 함
      expect(slots.length).toBeGreaterThan(0);

      // Option들이 포함된 슬롯 찾기
      const optionSlot = slots.find((slot) =>
        slot.instances.some((i) => i.name.startsWith("Option"))
      );

      expect(optionSlot).toBeDefined();
      expect(optionSlot?.componentSetId).toBe("1268:564");
      expect(optionSlot?.instances.length).toBeGreaterThanOrEqual(2);
      expect(optionSlot?.slotName).toBe("options");
    });

    test("taptap-navigation에서 배열 슬롯을 감지해야 한다", () => {
      const data = taptapNavigation as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // 배열 슬롯이 감지되어야 함
      expect(slots.length).toBeGreaterThan(0);

      // Item들이 포함된 슬롯 찾기
      const itemSlot = slots.find((slot) =>
        slot.instances.some((i) => i.name === "Item")
      );

      expect(itemSlot).toBeDefined();
      expect(itemSlot?.componentSetId).toBe("4:3622");
      expect(itemSlot?.parentName).toBe("items-count ▾");
      expect(itemSlot?.slotName).toBe("items");
      expect(itemSlot?.instances.length).toBeGreaterThanOrEqual(2);
    });

    test("tada-list(SECTION)에서는 ArraySlot을 감지하지 않아야 한다", () => {
      // SECTION 타입은 COMPONENT_SET/COMPONENT가 아니므로 ArraySlot 감지 안함
      // (정적 렌더링 선호)
      const data = tadaList as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // SECTION에서는 ArraySlot이 감지되지 않아야 함
      expect(slots.length).toBe(0);
    });

    test.skip("tada-list에서 List/General 배열 슬롯을 감지해야 한다 (SECTION은 ArraySlot 미지원)", () => {
      // SECTION 타입은 ArraySlot 감지 안함 - 이 테스트는 스킵
      const data = tadaList as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // List/General이 포함된 슬롯 찾기
      const listSlot = slots.find((slot) =>
        slot.instances.some((i) => i.name === "List/General")
      );

      // List/General은 같은 부모 아래에 2개 이상이 있어야 배열로 감지됨
      // 현재 구조에서는 각각 다른 부모에 있을 수 있으므로 감지되지 않을 수 있음
      // 이 경우 테스트를 건너뛰거나 조건을 조정
      if (listSlot) {
        expect(listSlot.componentSetId).toBe("113:26161");
      }

      expect(true).toBe(true);
    });

    test("고정 슬롯(Left/Right Icon)은 배열로 감지하지 않아야 한다", () => {
      const data = tadaList as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // Left Icon, Right Icon은 componentPropertyReferences.visible이 있으므로
      // 배열 슬롯으로 감지되지 않아야 함
      slots.forEach((slot) => {
        const instanceNames = slot.instances.map((i) => i.name);
        expect(instanceNames).not.toContain("Left Icon");
        expect(instanceNames).not.toContain("Right Icon");
      });
    });
  });

  describe("ArraySlotDetector - itemProps 추출", () => {
    test("SelectButton의 prop 정의를 추출해야 한다", () => {
      const data = airtableSelectButton;

      // SelectButton ComponentSet(1268:564)의 componentPropertyDefinitions에서
      // prop 정의를 추출해야 함

      // dependencies에서 componentSetId로 찾기
      const dependencies = data.dependencies;
      expect(dependencies).toBeDefined();

      // SelectButton의 prop 정의 확인
      // Size: VARIANT, values: ["default", "small", "large"]
      // Selected: VARIANT, values: ["true", "false"]

      // 첫 번째 dependency의 componentPropertyDefinitions 확인
      const firstDep = Object.values(dependencies!)[0];
      expect(firstDep).toBeDefined();
    });

    test("Item의 prop 정의를 추출해야 한다", () => {
      const data = taptapNavigation;

      // Item ComponentSet(4:3622)의 componentPropertyDefinitions에서
      // prop 정의를 추출해야 함

      // dependencies가 있는지 확인 (없으면 info.components에서 추출)
      const components = data.info.components;

      // componentSetId가 4:3622인 component 찾기
      const itemComponents = Object.entries(components).filter(
        ([id, comp]: [string, any]) => comp.componentSetId === "4:3622"
      );

      expect(itemComponents.length).toBeGreaterThan(0);
    });
  });

  describe("2단계: Props 생성 변경", () => {
    /**
     * 배열 슬롯이 감지되면:
     * - 기존: options: "2 options" | "3 options"
     * - 변경: items: Array<{ size: string; selected: boolean }>
     *
     * 그리고 해당 variant prop은 제거되어야 함
     */

    test("배열 슬롯의 아이템 타입 정의가 생성되어야 한다", () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      const optionSlot = slots.find((slot) =>
        slot.instances.some((i) => i.name.startsWith("Option"))
      );

      expect(optionSlot).toBeDefined();

      // itemProps가 추출되어야 함
      expect(optionSlot?.itemProps).toBeDefined();
      expect(optionSlot?.itemProps.length).toBeGreaterThan(0);

      // Size와 Selected prop이 있어야 함
      const propNames = optionSlot?.itemProps.map((p) => p.name.toLowerCase());
      expect(propNames).toContain("size");
      expect(propNames).toContain("selected");
    });

    test("INSTANCE children의 TEXT 노드가 다르면 text prop이 추출되어야 한다", () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      const optionSlot = slots.find((slot) =>
        slot.instances.some((i) => i.name.startsWith("Option"))
      );

      expect(optionSlot).toBeDefined();

      // text prop이 있어야 함
      // componentId 기반 그룹핑이므로 Option 2, 3만 ArraySlot (같은 componentId: 133:604)
      // Option 1은 다른 componentId (133:603)이므로 별도 처리
      const textProp = optionSlot?.itemProps.find((p) => p.name === "text");
      expect(textProp).toBeDefined();
      expect(textProp?.type).toBe("TEXT");
      expect(textProp?.values).toContain("Option 2");
      expect(textProp?.values).toContain("Option 3");
    });

    test("배열 슬롯 prop은 Array 타입이어야 한다", () => {
      // TODO: GenerateInterface에서 배열 타입 생성 구현 후 활성화
      //
      // 예상 결과:
      // interface SelectButtonsProps {
      //   size: Size;  // 유지 (컴포넌트 자체의 prop)
      //   options: Array<{  // 배열로 변경
      //     size?: Size;
      //     selected?: boolean;
      //     label?: string;
      //   }>;
      // }

      expect(true).toBe(true); // placeholder
    });

    test("배열 슬롯 감지 시 variant prop 중 개수 관련 prop은 제거되어야 한다", () => {
      // TODO: RefineProps에서 배열 슬롯 prop 처리 구현 후 활성화
      //
      // 예상:
      // - "Options" prop (값: "2 options", "3 options")은 제거
      // - "Size" prop (값: "default", "small", "large")은 유지

      expect(true).toBe(true); // placeholder
    });
  });

  describe("componentId 기반 그룹핑", () => {
    /**
     * 이슈: componentSetId로 그룹핑하면 같은 ComponentSet의 다른 Variant들이
     * 같은 ArraySlot으로 묶이는 문제 발생
     *
     * 예: Left Button (Neutral variant, componentId: 14:1665)과
     *     Right Button (Primary variant, componentId: 14:1657)이
     *     같은 componentSetId (14:1636)를 공유하므로 잘못 그룹핑됨
     *
     * 해결: componentId로만 그룹핑하여 정확히 같은 Variant만 ArraySlot으로 감지
     */

    test("같은 componentId를 가진 INSTANCE들만 ArraySlot으로 감지되어야 한다", () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // 각 슬롯의 instances는 모두 같은 componentId를 가져야 함
      for (const slot of slots) {
        const componentIds = new Set(slot.instances.map((i) => i.componentId));
        expect(componentIds.size).toBe(1); // 모든 instances가 같은 componentId
      }
    });

    test("다른 componentId를 가진 INSTANCE들은 별도의 ArraySlot이어야 한다", () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      // Option 1 (componentId: 133:603)과 Option 2, 3 (componentId: 133:604)은
      // 같은 componentSetId를 가지지만 다른 componentId이므로 다른 ArraySlot이어야 함
      const optionSlots = slots.filter((slot) =>
        slot.instances.some((i) => i.name.startsWith("Option"))
      );

      // componentId가 다르면 별도 슬롯으로 분리됨
      // Option 2, 3은 같은 componentId (133:604)이므로 하나의 슬롯
      // Option 1은 다른 componentId (133:603)이므로 ArraySlot 조건 불충족 (1개뿐)
      expect(optionSlots.length).toBeGreaterThan(0);

      // 각 슬롯 내에서 componentId가 동일한지 확인
      for (const slot of optionSlots) {
        const uniqueComponentIds = new Set(
          slot.instances.map((i) => i.componentId)
        );
        expect(uniqueComponentIds.size).toBe(1);
      }
    });

    test("componentId 필드가 ArraySlot 결과에 포함되어야 한다", () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;

      const detector = new ArraySlotDetector(data);
      const slots = detector.detect();

      expect(slots.length).toBeGreaterThan(0);

      // 모든 슬롯에 componentId가 있어야 함
      for (const slot of slots) {
        expect(slot.componentId).toBeDefined();
        expect(typeof slot.componentId).toBe("string");
      }
    });
  });

  describe("SuperTree 병합 ID 매칭", () => {
    /**
     * 이슈: ArraySlot의 parentId가 원본 Figma variant 노드 ID인데,
     * AST는 병합된 SuperTree에서 생성되어 ID가 다름
     *
     * 예:
     * - ArraySlot parentId: 133:791 (variant "Size=default, Options=3 options")
     * - AST root ID: 133:737 (대표 variant "Size=default, Options=2 options")
     *
     * 해결: CreateJsxTree._findArraySlotForNode()에서
     * 1. parentId로 직접 매칭 시도
     * 2. 실패하면 children의 ID로 매칭
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

  describe("3단계: JSX 생성 변경", () => {
    /**
     * 배열 슬롯이 감지되면 JSX에서:
     * - 기존: {options === "2 options" && (<><Option1 /><Option2 /></>)}
     * - 변경: {options.map((item, index) => <SelectButton key={index} {...item} />)}
     */

    test("배열 슬롯은 .map() 형태로 렌더링되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const generatedCode = await compiler.getGeneratedCode("SelectButtons");

      // .map( 패턴이 있어야 함
      expect(generatedCode).toMatch(/\.map\s*\(/);
    });

    test("배열 슬롯 map에 key prop이 있어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const generatedCode = await compiler.getGeneratedCode("SelectButtons");

      // key={index} 또는 key={item.id} 등의 패턴
      expect(generatedCode).toMatch(/key\s*=\s*\{/);
    });

    test("배열 슬롯 아이템은 외부 컴포넌트로 렌더링되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const generatedCode = await compiler.getGeneratedCode("SelectButtons");

      // SelectButton 컴포넌트가 map 안에서 사용되어야 함
      expect(generatedCode).toMatch(
        /\.map\s*\([^)]*\)\s*=>\s*.*<SelectButton/s
      );
    });

    test("배열 슬롯 아이템에 props가 전달되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const generatedCode = await compiler.getGeneratedCode("SelectButtons");

      // item.size, item.selected, item.text 등의 props 전달
      expect(generatedCode).toMatch(/size\s*=\s*\{.*item/);
      expect(generatedCode).toMatch(/text\s*=\s*\{.*item\.text/);
    });

    test("기존 조건부 렌더링 (options === '...')이 제거되어야 한다", async () => {
      const data = airtableSelectButton as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const generatedCode = await compiler.getGeneratedCode("SelectButtons");

      // options === "2 options" 같은 조건이 없어야 함
      expect(generatedCode).not.toMatch(/options\s*===\s*["'].*options["']/);
    });
  });
});
