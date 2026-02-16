import { describe, it, expect } from "vitest";
import { InputHeuristic } from "./InputHeuristic";
import type { BuildContext } from "../../workers/BuildContext";
import type { InternalNode } from "../../workers/interfaces/core";

const heuristic = new InputHeuristic();

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Mock BuildContext 생성
 */
function createMockCtx(options: {
  name: string;
  type?: string;
  nodes?: Partial<InternalNode>[];
  nodeSpecs?: Record<string, any>;
  styleSpecs?: Record<string, any>;
}): BuildContext {
  const internalTree: InternalNode = {
    id: "root",
    name: options.name,
    type: "FRAME",
    parent: null,
    children: [],
    mergedNode: [],
  };

  // children 추가 (parent 참조 설정)
  internalTree.children = (options.nodes ?? []).map((n, i) => ({
    id: n.id ?? `node-${i}`,
    name: n.name ?? `Node ${i}`,
    type: n.type ?? "FRAME",
    parent: internalTree,
    children: n.children ?? [],
    mergedNode: n.mergedNode ?? [],
  })) as InternalNode[];

  return {
    data: {
      document: {
        name: options.name,
        type: options.type ?? "COMPONENT_SET",
      },
      getNodeById: (id: string) => options.nodeSpecs?.[id] ?? null,
      getStyleById: (id: string) => options.styleSpecs?.[id] ?? null,
    },
    internalTree,
    totalVariantCount: 1,
    conditionals: [],
    slots: [],
    arraySlots: [],
    propsMap: new Map(), // processAnalysis에서 필요
    semanticRoles: new Map(), // processAnalysis에서 필요
  } as unknown as BuildContext;
}

// ============================================================================
// canProcess() Tests - 이름 패턴
// ============================================================================

describe("InputHeuristic", () => {
  describe("canProcess() - 이름 패턴", () => {
    it("InputBox → true", () => {
      const ctx = createMockCtx({ name: "InputBox" });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("TextField → true", () => {
      const ctx = createMockCtx({ name: "TextField" });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("TextInput → true", () => {
      const ctx = createMockCtx({ name: "TextInput" });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("SearchBar → true", () => {
      const ctx = createMockCtx({ name: "SearchBar" });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("SearchField → true", () => {
      const ctx = createMockCtx({ name: "SearchField" });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("input (소문자) → true", () => {
      const ctx = createMockCtx({ name: "input" });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("Button → false", () => {
      const ctx = createMockCtx({ name: "Button" });
      expect(heuristic.canProcess(ctx)).toBe(false);
    });

    it("Card → false", () => {
      const ctx = createMockCtx({ name: "Card" });
      expect(heuristic.canProcess(ctx)).toBe(false);
    });

    it("Modal → false", () => {
      const ctx = createMockCtx({ name: "Modal" });
      expect(heuristic.canProcess(ctx)).toBe(false);
    });
  });

  // ============================================================================
  // canProcess() Tests - Caret 패턴
  // ============================================================================

  describe("canProcess() - Caret 패턴", () => {
    it("TEXT 노드에 '|' 문자만 있으면 → true", () => {
      const ctx = createMockCtx({
        name: "FormEntry", // input 패턴 아님
        nodes: [{ id: "caret", type: "TEXT" }],
        nodeSpecs: {
          caret: { characters: "|" },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("TEXT 노드에 '|' 앞뒤 공백 있어도 → true", () => {
      const ctx = createMockCtx({
        name: "FormEntry",
        nodes: [{ id: "caret", type: "TEXT" }],
        nodeSpecs: {
          caret: { characters: "  |  " },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("TEXT 노드에 일반 텍스트 → false", () => {
      const ctx = createMockCtx({
        name: "FormEntry",
        nodes: [{ id: "text", type: "TEXT" }],
        nodeSpecs: {
          text: { characters: "Hello World" },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(false);
    });

    it("얇은 세로 RECTANGLE (2px x 16px) → true", () => {
      const ctx = createMockCtx({
        name: "FormEntry",
        nodes: [{ id: "caret", type: "RECTANGLE" }],
        nodeSpecs: {
          caret: {
            absoluteBoundingBox: { width: 2, height: 16 },
          },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("얇은 세로 LINE (1px x 20px) → true", () => {
      const ctx = createMockCtx({
        name: "FormEntry",
        nodes: [{ id: "caret", type: "LINE" }],
        nodeSpecs: {
          caret: {
            absoluteBoundingBox: { width: 1, height: 20 },
          },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(true);
    });

    it("일반 RECTANGLE (100px x 40px) → false", () => {
      const ctx = createMockCtx({
        name: "FormEntry",
        nodes: [{ id: "rect", type: "RECTANGLE" }],
        nodeSpecs: {
          rect: {
            absoluteBoundingBox: { width: 100, height: 40 },
          },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(false);
    });

    it("정사각형 RECTANGLE (10px x 10px) → false", () => {
      const ctx = createMockCtx({
        name: "FormEntry",
        nodes: [{ id: "rect", type: "RECTANGLE" }],
        nodeSpecs: {
          rect: {
            absoluteBoundingBox: { width: 10, height: 10 },
          },
        },
      });
      expect(heuristic.canProcess(ctx)).toBe(false);
    });
  });

  // ============================================================================
  // processAnalysis() Tests - Placeholder 감지
  // ============================================================================

  describe("processAnalysis() - Placeholder 감지", () => {
    it("회색 텍스트 + 검정 텍스트 variant → nodeSemanticTypes에 textInput 설정", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-gray", name: "text", variantName: "Guide Text=True" },
              { id: "text-black", name: "text", variantName: "Guide Text=False" },
            ],
          },
        ],
        nodeSpecs: {
          "text-gray": {
            characters: "Enter your name",
            fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }],
          },
          "text-black": {
            characters: "John Doe",
            fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          },
        },
      });

      // processAnalysis 직접 호출 (placeholder 감지 테스트)
      const result = heuristic.processAnalysis(ctx);

      expect(result.nodeSemanticTypes?.get("text-node")).toEqual({
        type: "textInput",
        placeholder: "Enter your name",
      });
    });

    it("guideText prop → excludePropsFromStyles에 추가", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-gray", name: "text", variantName: "Guide Text=True" },
              { id: "text-black", name: "text", variantName: "Guide Text=False" },
            ],
          },
        ],
        nodeSpecs: {
          "text-gray": {
            characters: "Placeholder",
            fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }],
          },
          "text-black": {
            characters: "Value",
            fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          },
        },
      });

      // processAnalysis 직접 호출
      const result = heuristic.processAnalysis(ctx);

      expect(result.excludePropsFromStyles?.has("guideText")).toBe(true);
    });

    it("placeholder 키워드가 없으면 감지 안함 (disabled 상태 회색 텍스트)", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-gray", name: "text", variantName: "State=Disabled" },
              { id: "text-black", name: "text", variantName: "State=Normal" },
            ],
          },
        ],
        nodeSpecs: {
          "text-gray": {
            characters: "Disabled text",
            fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }],
          },
          "text-black": {
            characters: "Normal text",
            fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          },
        },
      });

      // processAnalysis 직접 호출
      const result = heuristic.processAnalysis(ctx);

      expect(result.nodeSemanticTypes?.get("text-node")).toBeUndefined();
    });
  });

  // ============================================================================
  // componentType
  // ============================================================================

  describe("componentType", () => {
    it("componentType은 'input'", () => {
      expect(heuristic.componentType).toBe("input");
    });
  });

  // ============================================================================
  // detectLabelAndHelperText Tests
  // ============================================================================

  describe("detectLabelAndHelperText", () => {
    it("Input 위의 TEXT 노드 → label prop 생성 및 바인딩", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          // Label (위)
          { id: "label-text", type: "TEXT", mergedNode: [] },
          // Input 영역 (placeholder)
          {
            id: "input-text",
            type: "TEXT",
            mergedNode: [
              { id: "input-gray", name: "text", variantName: "Guide Text=True" },
              { id: "input-black", name: "text", variantName: "Guide Text=False" },
            ],
          },
        ],
        nodeSpecs: {
          "label-text": {
            characters: "Username",
            absoluteBoundingBox: { x: 0, y: 10, width: 100, height: 20 },
          },
          "input-gray": {
            characters: "Enter username",
            absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 20 },
            fills: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }],
          },
          "input-black": {
            characters: "john_doe",
            absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 20 },
            fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
          },
          "input-text": {
            absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 20 },
          },
        },
      });

      // processAnalysis 호출 (placeholder 감지를 위해 필요)
      let result = heuristic.processAnalysis(ctx);

      // detectLabelAndHelperText는 process() 내에서 호출되지만,
      // 직접 테스트를 위해 private 메서드를 (heuristic as any)로 접근
      result = (heuristic as any).detectLabelAndHelperText(result);

      // label prop 생성 확인
      expect(result.propsMap?.get("label")).toEqual({
        name: "label",
        type: "string",
        defaultValue: "Username",
        required: false,
      });

      // nodePropBindings 확인
      expect(result.nodePropBindings?.get("label-text")).toEqual({
        characters: "label",
      });
    });

    it("Input 아래의 TEXT 노드 → helperText prop 생성 및 바인딩", () => {
      // Input 영역 아래에 helper text가 있는 경우
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          // Input 영역 (caret)
          { id: "caret-text", type: "TEXT", mergedNode: [] },
          // Helper text (아래)
          { id: "helper-text", type: "TEXT", mergedNode: [] },
        ],
        nodeSpecs: {
          "caret-text": {
            characters: "|",
            absoluteBoundingBox: { x: 0, y: 50, width: 2, height: 20 },
          },
          "root": {
            absoluteBoundingBox: { x: 0, y: 30, width: 200, height: 50 },
          },
          "helper-text": {
            characters: "Enter a valid email address",
            absoluteBoundingBox: { x: 0, y: 100, width: 200, height: 16 },
          },
        },
      });

      // caret 노드의 부모 설정
      (ctx.internalTree!.children[0] as any).parent = ctx.internalTree;
      (ctx.internalTree!.children[1] as any).parent = ctx.internalTree;

      // processAnalysis 먼저 호출
      let result = heuristic.processAnalysis(ctx);

      // detectLabelAndHelperText 호출
      result = (heuristic as any).detectLabelAndHelperText(result);

      // helperText prop 생성 확인
      expect(result.propsMap?.get("helperText")).toEqual({
        name: "helperText",
        type: "string",
        defaultValue: "Enter a valid email address",
        required: false,
      });

      // nodePropBindings 확인
      expect(result.nodePropBindings?.get("helper-text")).toEqual({
        characters: "helperText",
      });
    });

    it("Input 영역 없으면 감지 안함", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          { id: "some-text", type: "TEXT", mergedNode: [] },
        ],
        nodeSpecs: {
          "some-text": {
            characters: "Some text",
            absoluteBoundingBox: { x: 0, y: 10, width: 100, height: 20 },
          },
        },
      });

      // detectLabelAndHelperText 호출
      const result = (heuristic as any).detectLabelAndHelperText(ctx);

      // props 없음
      expect(result.propsMap?.get("label")).toBeUndefined();
      expect(result.propsMap?.get("helperText")).toBeUndefined();
    });

    it("기존 showLabel boolean prop 제거하고 label string prop으로 대체", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          // Label (위)
          { id: "label-text", type: "TEXT", mergedNode: [] },
          // Input 영역 (caret)
          { id: "caret-text", type: "TEXT", mergedNode: [] },
        ],
        nodeSpecs: {
          "label-text": {
            characters: "Username",
            absoluteBoundingBox: { x: 0, y: 10, width: 100, height: 20 },
          },
          "caret-text": {
            characters: "|",
            absoluteBoundingBox: { x: 0, y: 50, width: 2, height: 20 },
          },
        },
      });

      // 기존 propsMap에 showLabel boolean prop 설정
      ctx.propsMap = new Map([
        ["showLabel", {
          name: "showLabel",
          type: "boolean",
          defaultValue: true,
          required: false,
        } as any],
        ["labelText", {
          name: "labelText",
          type: "string",
          defaultValue: "Username",
          required: false,
        } as any],
      ]);

      // 기존 nodePropBindings 설정 (visible, characters 바인딩)
      ctx.nodePropBindings = new Map([
        ["label-text", { visible: "showLabel", characters: "labelText" }],
      ]);

      // 부모 참조 설정
      (ctx.internalTree!.children[0] as any).parent = ctx.internalTree;
      (ctx.internalTree!.children[1] as any).parent = ctx.internalTree;

      // detectLabelAndHelperText 호출
      const result = (heuristic as any).detectLabelAndHelperText(ctx);

      // 기존 prop 제거 확인
      expect(result.propsMap?.get("showLabel")).toBeUndefined();
      expect(result.propsMap?.get("labelText")).toBeUndefined();

      // 새 label prop 생성 확인
      expect(result.propsMap?.get("label")).toEqual({
        name: "label",
        type: "string",
        defaultValue: "Username",
        required: false,
      });

      // nodePropBindings 교체 확인
      expect(result.nodePropBindings?.get("label-text")).toEqual({
        characters: "label",
      });
    });

    it("부모 FRAME의 visible 바인딩도 제거", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          // Label wrapper FRAME (위)
          {
            id: "label-wrapper",
            type: "FRAME",
            mergedNode: [],
            children: [
              { id: "label-text", type: "TEXT", mergedNode: [], children: [] },
            ],
          },
          // Input 영역 (caret)
          { id: "caret-text", type: "TEXT", mergedNode: [] },
        ],
        nodeSpecs: {
          "label-wrapper": {
            absoluteBoundingBox: { x: 0, y: 10, width: 100, height: 20 },
            componentPropertyReferences: { visible: "Show Label#123:0" },
          },
          "label-text": {
            characters: "Email",
            absoluteBoundingBox: { x: 0, y: 10, width: 100, height: 20 },
          },
          "caret-text": {
            characters: "|",
            absoluteBoundingBox: { x: 0, y: 50, width: 2, height: 20 },
          },
        },
      });

      // 기존 propsMap에 showLabel boolean prop 설정 (originalKey 포함)
      ctx.propsMap = new Map([
        ["showLabel", {
          name: "showLabel",
          type: "boolean",
          defaultValue: true,
          required: false,
          originalKey: "Show Label#123:0",
        } as any],
      ]);

      // 부모 참조 설정
      const labelWrapper = ctx.internalTree!.children[0] as any;
      labelWrapper.parent = ctx.internalTree;
      labelWrapper.children[0].parent = labelWrapper;
      (ctx.internalTree!.children[1] as any).parent = ctx.internalTree;

      // detectLabelAndHelperText 호출
      const result = (heuristic as any).detectLabelAndHelperText(ctx);

      // 부모의 visible 바인딩에 연결된 prop도 제거됨
      expect(result.propsMap?.get("showLabel")).toBeUndefined();

      // 새 label prop 생성 확인
      expect(result.propsMap?.get("label")).toBeDefined();
    });
  });

  // ============================================================================
  // detectErrorState Tests
  // ============================================================================

  describe("detectErrorState", () => {
    it("빨간색 TEXT fills가 있는 variant → error boolean prop 생성", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-normal", name: "text", variantName: "Status=Default" },
              { id: "text-error", name: "text", variantName: "Status=Error" },
            ],
          },
        ],
        nodeSpecs: {
          "text-normal": {
            characters: "Normal text",
            fills: [{ type: "SOLID", color: { r: 0.3, g: 0.3, b: 0.3 } }],
          },
          "text-error": {
            characters: "Error text",
            fills: [{ type: "SOLID", color: { r: 0.9, g: 0.1, b: 0.1 } }], // 빨간색
          },
        },
        styleSpecs: {
          "text-normal": { cssStyle: { color: "rgb(77, 77, 77)" } },
          "text-error": { cssStyle: { color: "rgb(230, 26, 26)" } },
        },
      });

      // propsMap에 Status variant 추가
      ctx.propsMap = new Map([
        ["status", {
          name: "status",
          type: "variant",
          defaultValue: "Default",
          required: false,
          options: ["Default", "Hover", "Error", "Disabled"],
        } as any],
      ]);

      // detectErrorState 호출
      const result = (heuristic as any).detectErrorState(ctx);

      // error prop 생성 확인
      expect(result.propsMap?.get("error")).toEqual({
        name: "error",
        type: "boolean",
        defaultValue: false,
        required: false,
      });
    });

    it("빨간색 stroke가 있는 variant → error boolean prop 생성", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "frame-node",
            type: "FRAME",
            mergedNode: [
              { id: "frame-normal", name: "frame", variantName: "State=Normal" },
              { id: "frame-error", name: "frame", variantName: "State=Error" },
            ],
          },
        ],
        nodeSpecs: {
          "frame-normal": {
            strokes: [{ type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.7 } }],
          },
          "frame-error": {
            strokes: [{ type: "SOLID", color: { r: 0.95, g: 0.2, b: 0.2 } }], // 빨간색
          },
        },
        styleSpecs: {
          "frame-normal": { cssStyle: { borderColor: "rgb(179, 179, 179)" } },
          "frame-error": { cssStyle: { borderColor: "rgb(242, 51, 51)" } },
        },
      });

      ctx.propsMap = new Map([
        ["state", {
          name: "state",
          type: "variant",
          defaultValue: "Normal",
          required: false,
          options: ["Normal", "Error"],
        } as any],
      ]);

      const result = (heuristic as any).detectErrorState(ctx);

      expect(result.propsMap?.get("error")).toBeDefined();
      expect(result.propsMap?.get("error")?.type).toBe("boolean");
    });

    it("Status variant에서 Error 옵션 제거", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-normal", name: "text", variantName: "Status=Default" },
              { id: "text-error", name: "text", variantName: "Status=Error" },
            ],
          },
        ],
        nodeSpecs: {
          "text-normal": {
            characters: "Normal",
            fills: [{ type: "SOLID", color: { r: 0.3, g: 0.3, b: 0.3 } }],
          },
          "text-error": {
            characters: "Error",
            fills: [{ type: "SOLID", color: { r: 0.9, g: 0.1, b: 0.1 } }],
          },
        },
        styleSpecs: {
          "text-normal": { cssStyle: { color: "rgb(77, 77, 77)" } },
          "text-error": { cssStyle: { color: "rgb(230, 26, 26)" } },
        },
      });

      ctx.propsMap = new Map([
        ["status", {
          name: "status",
          type: "variant",
          defaultValue: "Default",
          required: false,
          options: ["Default", "Hover", "Error", "Disabled"],
        } as any],
      ]);

      const result = (heuristic as any).detectErrorState(ctx);

      // Status variant에서 Error 제거 확인
      const statusProp = result.propsMap?.get("status") as any;
      expect(statusProp?.options).not.toContain("Error");
      expect(statusProp?.options).toContain("Default");
      expect(statusProp?.options).toContain("Hover");
      expect(statusProp?.options).toContain("Disabled");
    });

    it("빨간색 없으면 error prop 생성 안함", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-normal", name: "text", variantName: "Status=Default" },
              { id: "text-hover", name: "text", variantName: "Status=Hover" },
            ],
          },
        ],
        nodeSpecs: {
          "text-normal": {
            characters: "Normal",
            fills: [{ type: "SOLID", color: { r: 0.3, g: 0.3, b: 0.3 } }],
          },
          "text-hover": {
            characters: "Hover",
            fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.9 } }], // 파란색
          },
        },
        styleSpecs: {
          "text-normal": { cssStyle: { color: "rgb(77, 77, 77)" } },
          "text-hover": { cssStyle: { color: "rgb(26, 26, 230)" } },
        },
      });

      ctx.propsMap = new Map([
        ["status", {
          name: "status",
          type: "variant",
          defaultValue: "Default",
          required: false,
          options: ["Default", "Hover"],
        } as any],
      ]);

      const result = (heuristic as any).detectErrorState(ctx);

      // error prop 없음
      expect(result.propsMap?.get("error")).toBeUndefined();
    });

    it("error 스타일을 nodeStyles.propStyles에 추가", () => {
      const ctx = createMockCtx({
        name: "InputBox",
        nodes: [
          {
            id: "text-node",
            type: "TEXT",
            mergedNode: [
              { id: "text-normal", name: "text", variantName: "Status=Default" },
              { id: "text-error", name: "text", variantName: "Status=Error" },
            ],
          },
        ],
        nodeSpecs: {
          "text-normal": {
            characters: "Normal",
            fills: [{ type: "SOLID", color: { r: 0.3, g: 0.3, b: 0.3 } }],
          },
          "text-error": {
            characters: "Error",
            fills: [{ type: "SOLID", color: { r: 0.9, g: 0.1, b: 0.1 } }],
          },
        },
      });

      ctx.propsMap = new Map([
        ["status", {
          name: "status",
          type: "variant",
          defaultValue: "Default",
          required: false,
          options: ["Default", "Error"],
        } as any],
      ]);

      // nodeStyles 초기화
      (ctx as any).nodeStyles = new Map([
        ["text-node", { base: { color: "#333" }, dynamic: [] }],
      ]);

      // StyleProcessor.getStyleById 모의
      (ctx.data as any).getStyleById = (id: string) => {
        if (id === "text-error") {
          return { cssStyle: { color: "rgb(230, 26, 26)" } };
        }
        if (id === "text-normal") {
          return { cssStyle: { color: "rgb(77, 77, 77)" } };
        }
        return null;
      };

      const result = (heuristic as any).detectErrorState(ctx);

      // propStyles에 error 추가 확인
      const nodeStyle = result.nodeStyles?.get("text-node");
      expect(nodeStyle?.propStyles?.error).toBeDefined();
      expect(nodeStyle?.propStyles?.error?.type).toBe("boolean");
    });
  });
});
