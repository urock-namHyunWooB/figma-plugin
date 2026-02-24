import { describe, it, expect } from "vitest";
import DataManager from "../../src/frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import { PropsExtractor } from "../../src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/PropsExtractor";
import taptapButtonData from "../fixtures/button/taptapButton.json";

describe("PropsExtractor", () => {
  it("should extract props from componentPropertyDefinitions", () => {
    const dataManager = new DataManager(taptapButtonData as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    // taptapButton은 4개의 props를 가짐: Size, State, Left Icon, Right Icon
    // State 제외는 ButtonHeuristic에서 처리 (PropsExtractor는 모든 prop 통과)
    expect(props.length).toBe(4);

    // Size prop 확인
    const sizeProp = props.find((p) => p.name === "size");
    expect(sizeProp).toBeDefined();
    expect(sizeProp?.type).toBe("variant");
    if (sizeProp?.type === "variant") {
      expect(sizeProp.options).toEqual(["Large", "Medium", "Small"]);
      expect(sizeProp.defaultValue).toBe("Large");
    }

    // Left Icon prop 확인 (Boolean variant with icon pattern → slot)
    const leftIconProp = props.find((p) => p.name === "leftIcon");
    expect(leftIconProp).toBeDefined();
    expect(leftIconProp?.type).toBe("slot"); // icon 패턴은 React.ReactNode slot으로 변환

    // Right Icon prop 확인 (Boolean variant with icon pattern → slot)
    const rightIconProp = props.find((p) => p.name === "rightIcon");
    expect(rightIconProp).toBeDefined();
    expect(rightIconProp?.type).toBe("slot"); // icon 패턴은 React.ReactNode slot으로 변환
  });

  it("should normalize prop names to camelCase", () => {
    const dataManager = new DataManager(taptapButtonData as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    // "Left Icon" → "leftIcon"
    const leftIconProp = props.find((p) => p.name === "leftIcon");
    expect(leftIconProp).toBeDefined();
    expect(leftIconProp?.sourceKey).toBe("Left Icon");

    // "Right Icon" → "rightIcon"
    const rightIconProp = props.find((p) => p.name === "rightIcon");
    expect(rightIconProp).toBeDefined();
    expect(rightIconProp?.sourceKey).toBe("Right Icon");
  });

  it("should include State prop (removal is handled by ButtonHeuristic)", () => {
    const dataManager = new DataManager(taptapButtonData as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    // PropsExtractor는 State prop을 그대로 통과시킴
    // State 제거는 ButtonHeuristic.removeStateProp()에서 처리
    const stateProp = props.find((p) => p.sourceKey === "State");
    expect(stateProp).toBeDefined();
    expect(stateProp?.type).toBe("variant");
  });

  it("should mark all props as not required", () => {
    const dataManager = new DataManager(taptapButtonData as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    // 모든 props가 required: false
    for (const prop of props) {
      expect(prop.required).toBe(false);
    }
  });
});
