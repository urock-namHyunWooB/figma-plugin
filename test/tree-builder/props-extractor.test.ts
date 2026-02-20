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
    // State는 제외되어야 함 (CSS pseudo-class 변환 대상)
    expect(props.length).toBe(3);

    // Size prop 확인
    const sizeProp = props.find((p) => p.name === "size");
    expect(sizeProp).toBeDefined();
    expect(sizeProp?.type).toBe("variant");
    if (sizeProp?.type === "variant") {
      expect(sizeProp.options).toEqual(["Large", "Medium", "Small"]);
      expect(sizeProp.defaultValue).toBe("Large");
    }

    // Left Icon prop 확인 (Boolean variant)
    const leftIconProp = props.find((p) => p.name === "leftIcon");
    expect(leftIconProp).toBeDefined();
    expect(leftIconProp?.type).toBe("boolean");
    if (leftIconProp?.type === "boolean") {
      expect(leftIconProp.defaultValue).toBe(false);
    }

    // Right Icon prop 확인 (Boolean variant)
    const rightIconProp = props.find((p) => p.name === "rightIcon");
    expect(rightIconProp).toBeDefined();
    expect(rightIconProp?.type).toBe("boolean");
    if (rightIconProp?.type === "boolean") {
      expect(rightIconProp.defaultValue).toBe(false);
    }
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

  it("should exclude State prop", () => {
    const dataManager = new DataManager(taptapButtonData as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    // State prop이 제외되어야 함
    const stateProp = props.find((p) => p.sourceKey === "State");
    expect(stateProp).toBeUndefined();
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
