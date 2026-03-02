import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import urockButton from "../fixtures/button/urockButton.json";
import { writeFileSync } from "fs";

describe("Style Validation - Various Fixtures", () => {
  it("should extract styles from taptapButton", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    const result = {
      fixture: "taptapButton",
      rootStyles: uiTree.root.styles,
      childStyles: (uiTree.root as any).children?.map((c: any) => ({
        name: c.name,
        hasStyles: !!c.styles,
        baseKeys: c.styles?.base ? Object.keys(c.styles.base) : [],
        dynamicCount: c.styles?.dynamic?.length || 0,
        pseudoKeys: c.styles?.pseudo ? Object.keys(c.styles.pseudo) : [],
      })),
    };

    writeFileSync(
      "test/tree-builder/style-validation-taptap.json",
      JSON.stringify(result, null, 2)
    );

    expect(uiTree.root.styles).toBeDefined();
    expect(uiTree.root.styles?.base).toBeDefined();
    expect(uiTree.root.styles?.dynamic).toBeDefined();
  });

  it("should extract styles from airtableButton", () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    const result = {
      fixture: "airtableButton",
      rootStyles: uiTree.root.styles,
      childStyles: (uiTree.root as any).children?.map((c: any) => ({
        name: c.name,
        hasStyles: !!c.styles,
        baseKeys: c.styles?.base ? Object.keys(c.styles.base) : [],
        dynamicCount: c.styles?.dynamic?.length || 0,
        pseudoKeys: c.styles?.pseudo ? Object.keys(c.styles.pseudo) : [],
      })),
    };

    writeFileSync(
      "test/tree-builder/style-validation-airtable.json",
      JSON.stringify(result, null, 2)
    );

    expect(uiTree.root.styles).toBeDefined();
  });

  it("should extract styles from urockButton", () => {
    const dataManager = new DataManager(urockButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((urockButton as any).info.document);

    const result = {
      fixture: "urockButton",
      rootStyles: uiTree.root.styles,
      childStyles: (uiTree.root as any).children?.map((c: any) => ({
        name: c.name,
        hasStyles: !!c.styles,
        baseKeys: c.styles?.base ? Object.keys(c.styles.base) : [],
        dynamicCount: c.styles?.dynamic?.length || 0,
        pseudoKeys: c.styles?.pseudo ? Object.keys(c.styles.pseudo) : [],
      })),
    };

    writeFileSync(
      "test/tree-builder/style-validation-urock.json",
      JSON.stringify(result, null, 2)
    );

    expect(uiTree.root.styles).toBeDefined();
  });

  it("should handle State prop correctly", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // State prop이 있으면 pseudo-class 스타일이 있어야 함
    if (uiTree.root.styles?.pseudo) {
      const pseudoKeys = Object.keys(uiTree.root.styles.pseudo);
      console.log("Pseudo-class keys:", pseudoKeys);

      // State=Hover, State=Disabled, State=Pressed 등이 있으므로
      // :hover, :disabled, :active 등이 있어야 함
      expect(pseudoKeys.length).toBeGreaterThan(0);
    }
  });

  it("should create correct condition nodes", () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    if (uiTree.root.styles?.dynamic && uiTree.root.styles.dynamic.length > 0) {
      const firstDynamic = uiTree.root.styles.dynamic[0];
      console.log("First dynamic condition:", JSON.stringify(firstDynamic.condition, null, 2));

      // condition이 제대로 생성되었는지 확인
      expect(firstDynamic.condition).toBeDefined();
      expect(firstDynamic.condition.type).toBeDefined();

      // prop 이름이 camelCase인지 확인
      const checkPropName = (condition: any): void => {
        if (condition.prop) {
          // camelCase 체크: 첫 글자 소문자, 공백 없음
          expect(condition.prop).toMatch(/^[a-z][a-zA-Z0-9]*$/);
        }
        if (condition.conditions) {
          condition.conditions.forEach(checkPropName);
        }
        if (condition.condition) {
          checkPropName(condition.condition);
        }
      };

      checkPropName(firstDynamic.condition);
    }
  });

  it("should not have pseudo-equivalent state values in dynamic conditions", () => {
    const dataManager = new DataManager(urockButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((urockButton as any).info.document);

    // pseudo-class에 해당하는 state 값(hover, active 등)은 dynamic이 아닌 pseudo에 있어야 함
    // 비-pseudo state 값(default, loading 등)은 dynamic에 있을 수 있음
    const pseudoValues = new Set(["hover", "active", "pressed", "focus", "disabled", "disable", "visited"]);

    const checkNoPseudoState = (cond: any): void => {
      if (cond.type === "eq" && (cond.prop === "state" || cond.prop === "states")) {
        expect(pseudoValues.has(String(cond.value).toLowerCase())).toBe(false);
      }
      if (cond.conditions) cond.conditions.forEach(checkNoPseudoState);
      if (cond.condition) checkNoPseudoState(cond.condition);
    };

    if (uiTree.root.styles?.dynamic) {
      for (const dynamic of uiTree.root.styles.dynamic) {
        checkNoPseudoState(dynamic.condition);
      }
    }
  });
});
