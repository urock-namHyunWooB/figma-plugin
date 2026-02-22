import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { CodeEmitter } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";

import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";

describe("CodeEmitter", () => {
  it("should generate code from taptapButton", async () => {
    // 1. UITree 생성
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    // 2. 코드 생성
    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    console.log("=== taptapButton Generated Code ===");
    console.log(result.code);

    // 3. 검증
    expect(result.componentName).toBe("Primary");
    expect(result.code).toContain("import React");
    expect(result.code).toContain("import { css }");
    expect(result.code).toContain("interface PrimaryProps");
    expect(result.code).toContain("function Primary(");
    expect(result.code).toContain("export default Primary");
  });

  it("should generate code from airtableButton", async () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((airtableButton as any).info.document);

    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    console.log("=== airtableButton Generated Code ===");
    console.log(result.code);

    expect(result.componentName).toBe("Button");
    expect(result.code).toContain("interface ButtonProps");
  });

  it("should include props in interface", async () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    // Props 확인 (state는 pseudo-class로 처리되어 제외됨)
    expect(result.code).toContain("size");
    expect(result.code).toContain("leftIcon");
    expect(result.code).toContain("rightIcon");
  });

  it("should generate styles", async () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build((taptapButton as any).info.document);

    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    // 스타일 확인
    expect(result.code).toContain("css`");
  });
});
