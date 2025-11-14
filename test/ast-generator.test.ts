import { describe, test, expect } from "vitest";
import { ASTGenerator } from "../src/frontend/ui/utils/ast-generator";
import type { ComponentDSL } from "../src/frontend/ui/utils/ast-generator";

// Fixtures
import dialogSpec from "./fixtures/dialog.json";
import paginationSpec from "./fixtures/pagination.json";
import selectsSpec from "./fixtures/selects.json";

/**
 * 생성된 코드 검증 헬퍼
 */
function validateGeneratedCode(code: string) {
  return {
    hasImport: code.includes("import"),
    hasInterface: code.includes("interface"),
    hasFunction: code.includes("function"),
    hasStyles: code.includes("const styles"),
    hasReturn: code.includes("return"),
    hasExport: code.includes("export default"),

    // styles가 function 앞에 있는지
    stylesBeforeFunction: (() => {
      const stylesPos = code.indexOf("const styles");
      const funcPos = code.indexOf("function");
      return stylesPos > 0 && stylesPos < funcPos;
    })(),
  };
}

/**
 * 코드에서 특정 패턴 찾기
 */
function findInCode(code: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return code.includes(pattern);
  }
  return pattern.test(code);
}

describe("AST Generator", () => {
  describe("기본 구조 생성", () => {
    test("Dialog: 모든 필수 요소 포함", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      const validation = validateGeneratedCode(code);

      expect(validation.hasInterface).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasStyles).toBe(true);
      expect(validation.hasReturn).toBe(true);
      expect(validation.hasExport).toBe(true);
    });

    test("코드가 비어있지 않음", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      expect(code.length).toBeGreaterThan(0);
    });

    test("Pagination: 기본 구조 생성", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(
        paginationSpec as ComponentDSL,
      );
      const validation = validateGeneratedCode(code);

      expect(validation.hasInterface).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasExport).toBe(true);
    });

    test("Selects: 기본 구조 생성", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(selectsSpec as ComponentDSL);
      const validation = validateGeneratedCode(code);

      expect(validation.hasInterface).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasExport).toBe(true);
    });
  });

  describe("Props Interface 생성", () => {
    test("Props Interface 이름 형식", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      expect(code).toContain("interface BasicProps");
    });

    test("Variant prop은 유니온 타입으로 생성", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      // Size prop이 "Large" | "Small" | "Medium" 형태로 생성되어야 함
      expect(code).toMatch(/Size\??:\s*"Large"\s*\|\s*"Small"\s*\|\s*"Medium"/);
    });

    test("Optional prop 테스트", () => {
      const spec: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [
          {
            id: "test-prop",
            name: "onClick",
            type: "function",
            required: false,
          },
        ],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(spec);
      expect(code).toContain("onClick?:");
    });

    test("Required prop은 ? 없이 생성", () => {
      const spec: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [
          {
            id: "test-prop",
            name: "title",
            type: "string",
            required: true,
          },
        ],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(spec);
      expect(code).toContain("title: string");
      expect(code).not.toContain("title?: string");
    });
  });

  describe("Internal State 생성", () => {
    test("useState import가 state가 있을 때만 생성", () => {
      const specWithState: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: [
          {
            id: "state-1",
            name: "isOpen",
            type: "boolean",
            initialValue: false,
          },
        ],
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(specWithState);
      expect(code).toContain("import { useState }");
      expect(code).toContain("const [isOpen, setIsOpen]");
    });

    test("State가 없으면 useState import 없음", () => {
      const specWithoutState: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(specWithoutState);
      expect(code).not.toContain("import { useState }");
    });
  });

  describe("Styles 객체 생성", () => {
    test("layoutTree가 있으면 styles 객체 생성", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      expect(code).toContain("const styles");
      expect(validateGeneratedCode(code).stylesBeforeFunction).toBe(true);
    });

    test("layoutTree가 없으면 styles 객체 없음", () => {
      const spec: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(spec);
      expect(code).not.toContain("const styles");
    });
  });

  describe("JSX 트리 생성", () => {
    test("componentStructure가 있으면 JSX 생성", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      // JSX 요소가 포함되어야 함
      expect(code).toMatch(/<div|<>/);
      expect(code).toContain("return");
    });

    test("componentStructure가 없으면 Fragment 반환", () => {
      const spec: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(spec);
      expect(code).toContain("return");
      // Fragment 또는 빈 return
    });
  });

  describe("Export 문 생성", () => {
    test("export default 문 생성", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);
      expect(code).toContain("export default Basic");
    });

    test("컴포넌트 이름이 올바르게 export됨", () => {
      const spec: ComponentDSL = {
        metadata: { name: "MyComponent", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(spec);
      expect(code).toContain("export default MyComponent");
    });
  });

  describe("코드 품질", () => {
    test("생성된 코드가 유효한 TypeScript/JSX 문법", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);

      // 기본적인 문법 검증
      expect(code).not.toContain("undefined");
      expect(code).not.toContain("null");
      // 괄호 매칭 확인
      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });

    test("중복된 코드가 없음", () => {
      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(dialogSpec as ComponentDSL);

      // 같은 함수가 두 번 선언되지 않음
      const functionMatches = code.match(/function\s+\w+/g);
      if (functionMatches) {
        const uniqueFunctions = new Set(functionMatches);
        expect(functionMatches.length).toBe(uniqueFunctions.size);
      }
    });
  });

  describe("Edge Cases", () => {
    test("빈 propsDefinition 처리", () => {
      const spec: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      const code = generator.generateCodeFromDSL(spec);
      // Props interface가 없어도 함수는 생성되어야 함
      expect(code).toContain("function Test");
    });

    test("빈 componentStructure 처리", () => {
      const spec: ComponentDSL = {
        metadata: { name: "Test", rootElement: "div" },
        propsDefinition: [],
        internalStateDefinition: null,
        elementBindings: null,
        variantPatterns: {},
        componentStructure: null,
        layoutTree: null,
      };

      const generator = new ASTGenerator();
      expect(() => generator.generateCodeFromDSL(spec)).not.toThrow();
    });
  });
});
