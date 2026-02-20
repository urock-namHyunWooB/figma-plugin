import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { CodeEmitter } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";

import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";
import urockButton from "../fixtures/button/urockButton.json";

describe("CodeEmitter Review", () => {
  it("taptapButton 코드 생성 검토", async () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(taptapButton as any);

    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    // 파일로 저장
    writeFileSync("test/code-emitter/generated-taptap.tsx", result.code);

    // 기본 검증
    expect(result.componentName).toBe("Primary");
    expect(result.code).toContain("React.FC<PrimaryProps>");
  });

  it("airtableButton 코드 생성 검토", async () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(airtableButton as any);

    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    writeFileSync("test/code-emitter/generated-airtable.tsx", result.code);

    expect(result.componentName).toBe("Button");
  });

  it("urockButton 코드 생성 검토", async () => {
    const dataManager = new DataManager(urockButton as any);
    const treeBuilder = new TreeBuilder(dataManager);
    const uiTree = treeBuilder.build(urockButton as any);

    const emitter = new CodeEmitter();
    const result = await emitter.emit(uiTree);

    writeFileSync("test/code-emitter/generated-urock.tsx", result.code);

    expect(result.componentName).toBe("Btn");
  });
});
