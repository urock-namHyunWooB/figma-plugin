import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import { DesignPatternDetector } from "../../src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid slot promotion", () => {
  it("leadingIcon은 slot (ReactNode) 타입이어야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    const prop = main.props.find((p: any) => p.name === "leadingIcon");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("slot");
  });

  it("trailingIcon은 slot (ReactNode) 타입이어야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    const prop = main.props.find((p: any) => p.name === "trailingIcon");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("slot");
  });

  it("loading은 boolean 타입을 유지해야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    const prop = main.props.find((p: any) => p.name === "loading");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("boolean");
  });

  it("label은 string 타입을 유지해야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    const prop = main.props.find((p: any) => p.name === "label");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("string");
  });

  it("icon (iconOnly 분기)은 slot (ReactNode) 타입이어야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    const prop = main.props.find((p: any) => p.name === "icon");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("slot");
  });

  it("DesignPatternDetector가 exposedInstanceSlot을 감지한다", () => {
    const detector = new DesignPatternDetector();
    const patterns = detector.detect((ButtonsolidFixture as any).info.document as any);

    const slotPatterns = patterns.filter((p) => p.type === "exposedInstanceSlot");

    // Leading Icon#438:4 에 대한 슬롯 패턴이 있어야 함
    const leadingIconSlot = slotPatterns.find(
      (p) => (p as any).visibleRef === "Leading Icon#438:4"
    );
    expect(leadingIconSlot).toBeDefined();

    // Trailing Icon#438:6 에 대한 슬롯 패턴이 있어야 함
    const trailingIconSlot = slotPatterns.find(
      (p) => (p as any).visibleRef === "Trailing Icon#438:6"
    );
    expect(trailingIconSlot).toBeDefined();

    // Loading#29474:0 에 대한 슬롯 패턴이 없어야 함 (isExposedInstance가 없음)
    const loadingSlot = slotPatterns.find(
      (p) => (p as any).visibleRef === "Loading#29474:0"
    );
    expect(loadingSlot).toBeUndefined();
  });
});
