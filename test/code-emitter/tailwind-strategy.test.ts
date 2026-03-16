import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeManager from "@frontend/ui/domain/code-generator2/layers/tree-manager/TreeManager";
import { CodeEmitter } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";
// TreeBuilder 직접 호출 대신 TreeManager.build()로 UITreeOptimizer 포함 (decompose 필요)

import taptapButton from "../fixtures/button/taptapButton.json";
import airtableButton from "../fixtures/any-component-set/airtable-button.json";

describe("TailwindStrategy", () => {
  it("should generate Tailwind classes from taptapButton", async () => {
    const dataManager = new DataManager(taptapButton as any);
    const treeManager = new TreeManager(dataManager);
    const { main: uiTree } = treeManager.build();

    const emitter = new CodeEmitter({ styleStrategy: "tailwind" });
    const result = await emitter.emit(uiTree);

    console.log("=== taptapButton Tailwind Code ===");
    console.log(result.code);

    // 기본 검증
    expect(result.componentName).toBe("Primary");
    expect(result.code).toContain("className=");
    expect(result.code).toContain("cva(");
    // Tailwind arbitrary value 문법 확인
    expect(result.code).toContain("[");
  });

  it("should generate Tailwind classes from airtableButton", async () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeManager = new TreeManager(dataManager);
    const { main: uiTree } = treeManager.build();

    const emitter = new CodeEmitter({ styleStrategy: "tailwind" });
    const result = await emitter.emit(uiTree);

    console.log("=== airtableButton Tailwind Code ===");
    console.log(result.code);

    expect(result.componentName).toBe("Button");
    expect(result.code).toContain("className=");
  });

  it("should use standard Tailwind classes when possible", async () => {
    const dataManager = new DataManager(airtableButton as any);
    const treeManager = new TreeManager(dataManager);
    const { main: uiTree } = treeManager.build();

    const emitter = new CodeEmitter({ styleStrategy: "tailwind" });
    const result = await emitter.emit(uiTree);

    // 표준 Tailwind 클래스 사용 확인
    expect(result.code).toContain("inline-flex");
    expect(result.code).toContain("items-center");
  });
});
