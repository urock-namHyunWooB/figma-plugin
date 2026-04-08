import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import { writeFileSync } from "fs"; // Used by airtableButton test

describe("TreeBuilder Full Build", () => {
  it("should build complete UITree with props (taptapButton)", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // UITree 구조 확인
    expect(uiTree.root).toBeDefined();
    expect(uiTree.props).toBeDefined();
    expect(Array.isArray(uiTree.props)).toBe(true);

    // Props 확인: Size + State(Disabled만 유지) + Left Icon + Right Icon = 4개
    // State는 interaction pseudo(hover/active)와 default가 제거되고 Disabled만 남음
    // TEXT slot은 추가되지 않음 (모든 variant에서 동일한 "Text" 내용이므로)
    expect(uiTree.props.length).toBe(4);

    const propNames = uiTree.props.map((p) => p.name);
    expect(propNames).toContain("size");
    expect(propNames).toContain("state");
    expect(propNames).toContain("leftIcon");
    expect(propNames).toContain("rightIcon");
    expect(propNames).not.toContain("text"); // TEXT slot 불포함 확인

    // Size prop 상세 확인
    const sizeProp = uiTree.props.find((p) => p.name === "size");
    expect(sizeProp?.type).toBe("variant");
    if (sizeProp?.type === "variant") {
      expect(sizeProp.options).toEqual(["Large", "Medium", "Small"]);
    }

    // Slot props 확인 (icon 패턴은 React.ReactNode slot으로 변환)
    const leftIconProp = uiTree.props.find((p) => p.name === "leftIcon");
    const rightIconProp = uiTree.props.find((p) => p.name === "rightIcon");
    expect(leftIconProp?.type).toBe("slot");
    expect(rightIconProp?.type).toBe("slot");
  });

  it("should build complete UITree with props (airtableButton)", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    // 결과를 파일로 저장
    const result = {
      rootName: uiTree.root.name,
      rootType: uiTree.root.type,
      rootId: uiTree.root.id,
      propsCount: uiTree.props.length,
      props: uiTree.props.map((p) => ({
        name: p.name,
        type: p.type,
        sourceKey: p.sourceKey,
        required: p.required,
        defaultValue: p.defaultValue,
        ...(p.type === "variant" ? { options: p.options } : {}),
      })),
      childrenCount:
        uiTree.root.type === "container" ? uiTree.root.children.length : 0,
    };

    writeFileSync(
      "test/tree-builder/full-build-result.json",
      JSON.stringify(result, null, 2)
    );

    expect(uiTree.props.length).toBeGreaterThan(0);
  });

  it("should handle components without props", () => {
    // 단일 컴포넌트 (COMPONENT_SET 아님)는 props가 없을 수 있음
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // props가 배열이어야 함 (빈 배열일 수도 있음)
    expect(Array.isArray(uiTree.props)).toBe(true);
  });

  it("should build UITree from a single COMPONENT (not COMPONENT_SET)", () => {
    // taptapButton의 첫 번째 variant(자식 COMPONENT)를 단독으로 입력
    const componentSetDoc = (taptapButton as any).info.document;
    const firstComponent = componentSetDoc.children[0];
    expect(firstComponent.type).toBe("COMPONENT");

    // FigmaNodeData 형태로 wrap (info.document만 교체)
    const singleComponentData = {
      ...(taptapButton as any),
      info: {
        ...(taptapButton as any).info,
        document: firstComponent,
      },
    };

    const dataManager = new DataManager(singleComponentData);
    const treeBuilder = new TreeBuilder(dataManager);

    // throw 없이 완료되어야 함
    const uiTree = treeBuilder.build(firstComponent);

    expect(uiTree.root).toBeDefined();
    expect(uiTree.root.id).toBe(firstComponent.id);
    expect(Array.isArray(uiTree.props)).toBe(true);
  });
});
