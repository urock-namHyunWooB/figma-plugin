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
});
