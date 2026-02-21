import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import { writeFileSync } from "fs";

describe("TreeBuilder Full Build", () => {
  it("should build complete UITree with props (taptapButton)", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);

    const uiTree = treeBuilder.build(taptapButton as any);

    // UITree 구조 확인
    expect(uiTree.root).toBeDefined();
    expect(uiTree.props).toBeDefined();
    expect(Array.isArray(uiTree.props)).toBe(true);

    // Props 확인 (State 제외, Size + Left Icon + Right Icon = 3개)
    expect(uiTree.props.length).toBe(3);

    const propNames = uiTree.props.map((p) => p.name);
    expect(propNames).toContain("size");
    expect(propNames).toContain("leftIcon");
    expect(propNames).toContain("rightIcon");
    expect(propNames).not.toContain("state");

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

    const uiTree = treeBuilder.build(airtableButton as any);

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

    const uiTree = treeBuilder.build(taptapButton as any);

    // props가 배열이어야 함 (빈 배열일 수도 있음)
    expect(Array.isArray(uiTree.props)).toBe(true);
  });
});
