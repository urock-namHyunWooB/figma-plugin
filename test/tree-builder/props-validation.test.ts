import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import { PropsExtractor } from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/PropsExtractor";
import tadaButton from "../fixtures/button/tadaButton.json";
import urockButton from "../fixtures/button/urockButton.json";
import taptapButton from "../fixtures/button/taptapButton.json";
import { writeFileSync } from "fs";

describe("Props Validation - Various Types", () => {
  it("should extract TEXT and BOOLEAN props (tadaButton)", () => {
    const dataManager = new DataManager(tadaButton as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    const result = {
      fixture: "tadaButton",
      propsCount: props.length,
      props: props.map((p) => ({
        name: p.name,
        type: p.type,
        sourceKey: p.sourceKey,
        defaultValue: p.defaultValue,
        ...(p.type === "variant" ? { options: p.options } : {}),
      })),
    };

    writeFileSync(
      "test/tree-builder/props-tada.json",
      JSON.stringify(result, null, 2)
    );

    console.log("Props extracted:", result);

    // TEXT 타입 확인
    const labelProp = props.find((p) => p.sourceKey.startsWith("Label"));
    expect(labelProp).toBeDefined();
    expect(labelProp?.type).toBe("string");
    expect(labelProp?.defaultValue).toBe("Label");

    // BOOLEAN 타입 확인
    const leftIconProp = props.find((p) => p.sourceKey.startsWith("Left Icon"));
    expect(leftIconProp).toBeDefined();
    expect(leftIconProp?.type).toBe("boolean");
    expect(leftIconProp?.defaultValue).toBe(false);

    const rightIconProp = props.find((p) =>
      p.sourceKey.startsWith("Right Icon")
    );
    expect(rightIconProp).toBeDefined();
    expect(rightIconProp?.type).toBe("boolean");
    expect(rightIconProp?.defaultValue).toBe(false);
  });

  it("should extract TEXT and BOOLEAN props (urockButton)", () => {
    const dataManager = new DataManager(urockButton as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    const result = {
      fixture: "urockButton",
      propsCount: props.length,
      props: props.map((p) => ({
        name: p.name,
        type: p.type,
        sourceKey: p.sourceKey,
        defaultValue: p.defaultValue,
        ...(p.type === "variant" ? { options: p.options } : {}),
      })),
    };

    writeFileSync(
      "test/tree-builder/props-urock.json",
      JSON.stringify(result, null, 2)
    );

    console.log("Props extracted:", result);

    // TEXT 타입 확인
    const textProp = props.find((p) => p.sourceKey.startsWith("Text"));
    expect(textProp).toBeDefined();
    expect(textProp?.type).toBe("string");
    expect(textProp?.defaultValue).toBe("button");

    // BOOLEAN 타입 확인
    const iconLeftProp = props.find((p) => p.sourceKey.startsWith("icon left"));
    expect(iconLeftProp).toBeDefined();
    expect(iconLeftProp?.type).toBe("boolean");
    expect(iconLeftProp?.defaultValue).toBe(true);

    const iconRightProp = props.find((p) =>
      p.sourceKey.startsWith("icon right")
    );
    expect(iconRightProp).toBeDefined();
    expect(iconRightProp?.type).toBe("boolean");
    expect(iconRightProp?.defaultValue).toBe(true);
  });

  it("should handle all prop types correctly", () => {
    const dataManager = new DataManager(taptapButton as any);
    const extractor = new PropsExtractor(dataManager);

    const props = extractor.extract();

    // 각 타입별로 그룹핑
    const variantProps = props.filter((p) => p.type === "variant");
    const booleanProps = props.filter((p) => p.type === "boolean");
    const stringProps = props.filter((p) => p.type === "string");
    const slotProps = props.filter((p) => p.type === "slot");

    const summary = {
      fixture: "taptapButton",
      total: props.length,
      byType: {
        variant: variantProps.length,
        boolean: booleanProps.length,
        string: stringProps.length,
        slot: slotProps.length,
      },
      props: props.map((p) => ({
        name: p.name,
        type: p.type,
        sourceKey: p.sourceKey,
      })),
    };

    writeFileSync(
      "test/tree-builder/props-summary.json",
      JSON.stringify(summary, null, 2)
    );

    expect(props.length).toBeGreaterThan(0);
  });
});
