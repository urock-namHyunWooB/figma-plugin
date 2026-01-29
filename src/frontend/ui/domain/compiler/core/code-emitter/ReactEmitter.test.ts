/**
 * ReactEmitter Tests
 */

import { describe, it, expect } from "vitest";
import ReactEmitter from "./ReactEmitter";
import type { DesignTree, CodeEmitterPolicy } from "@compiler/types/architecture";

// 최소한의 DesignTree fixture 생성
function createMinimalDesignTree(): DesignTree {
  return {
    root: {
      id: "root-1",
      name: "TestButton",
      type: "container",
      styles: {
        base: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 24px",
          backgroundColor: "#3b82f6",
          borderRadius: "8px",
        },
        dynamic: [],
      },
      children: [
        {
          id: "text-1",
          name: "Label",
          type: "text",
          styles: {
            base: {
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "500",
            },
            dynamic: [],
          },
          children: [],
        },
      ],
    },
    props: [
      {
        name: "size",
        type: "variant",
        required: false,
        defaultValue: "Medium",
        options: ["Small", "Medium", "Large"],
      } as any,
    ],
    slots: [],
    conditionals: [],
    arraySlots: [],
  };
}

describe("ReactEmitter", () => {
  describe("emit", () => {
    it("should emit React component code", async () => {
      const emitter = new ReactEmitter();
      const tree = createMinimalDesignTree();
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "emotion",
      };

      const result = await emitter.emit(tree, policy);

      // 기본 검증
      expect(result.componentName).toBe("TestButton");
      expect(result.code).toBeTruthy();
      expect(typeof result.code).toBe("string");

      // 코드 구조 검증
      expect(result.code).toContain("TestButton");
    });

    it("should include correct componentName", async () => {
      const emitter = new ReactEmitter();
      const tree = createMinimalDesignTree();
      tree.root.name = "my-custom-button";

      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "emotion",
      };

      const result = await emitter.emit(tree, policy);

      // kebab-case → PascalCase 변환 확인
      expect(result.componentName).toBe("MyCustomButton");
    });

    it("should work with tailwind strategy", async () => {
      const emitter = new ReactEmitter();
      const tree = createMinimalDesignTree();
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "tailwind",
      };

      const result = await emitter.emit(tree, policy);

      expect(result.componentName).toBe("TestButton");
      expect(result.code).toBeTruthy();
    });

    it("should return EmittedCode structure", async () => {
      const emitter = new ReactEmitter();
      const tree = createMinimalDesignTree();
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "emotion",
      };

      const result = await emitter.emit(tree, policy);

      // EmittedCode 구조 확인
      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("imports");
      expect(result).toHaveProperty("types");
      expect(result).toHaveProperty("componentName");

      // imports는 배열
      expect(Array.isArray(result.imports)).toBe(true);

      // types는 문자열
      expect(typeof result.types).toBe("string");
    });

    it("should handle empty children", async () => {
      const emitter = new ReactEmitter();
      const tree: DesignTree = {
        root: {
          id: "root-1",
          name: "EmptyContainer",
          type: "container",
          styles: { base: { display: "flex" }, dynamic: [] },
          children: [],
        },
        props: [],
        slots: [],
        conditionals: [],
        arraySlots: [],
      };
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "emotion",
      };

      const result = await emitter.emit(tree, policy);

      expect(result.componentName).toBe("EmptyContainer");
      expect(result.code).toBeTruthy();
    });
  });
});
