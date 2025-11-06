import { describe, test, expect } from "vitest";
import {
  generateReactCode,
  validateGeneratedCode,
  findInCode,
} from "./utils/test-helpers";
import simpleButtonSpec from "./fixtures/simple-button.json";

describe("React Code Generator", () => {
  describe("기본 구조 생성", () => {
    test("SimpleButton: 모든 필수 요소 포함", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      const validation = validateGeneratedCode(result.code);

      expect(validation.hasInterface).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasStyles).toBe(true);
      expect(validation.hasReturn).toBe(true);
      expect(validation.hasExport).toBe(true);
    });

    test("코드가 비어있지 않음", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code.length).toBeGreaterThan(0);
    });
  });

  describe("Props Interface 생성", () => {
    test("Props Interface 이름 형식", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain("interface URButtonProps");
    });

    test("Optional prop 테스트", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "onClick", type: "function", required: false },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("onClick?:");
    });

    test("Required prop은 ? 없이 생성", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [{ name: "title", type: "string", required: true }],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("title: string");
      expect(result.code).not.toContain("title?: string");
    });

    test("Function type 변환", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "onClick",
            type: "function",
            required: true,
            parameters: [{ name: "e", type: "MouseEvent" }],
            returnType: "void",
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("(e: MouseEvent) => void");
    });

    test("Function type - 파라미터 없는 함수", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "onClose",
            type: "function",
            required: false,
            parameters: [],
            returnType: "void",
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("() => void");
    });

    test("Function type - 여러 파라미터", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "onChange",
            type: "function",
            required: false,
            parameters: [
              { name: "value", type: "string" },
              { name: "index", type: "number" },
            ],
            returnType: "boolean",
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain(
        "(value: string, index: number) => boolean"
      );
    });

    test("React.ReactNode type 변환", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "children", type: "component", required: false },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("React.ReactNode");
    });

    test("number type 변환", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [{ name: "count", type: "number", required: true }],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("count: number");
    });

    test("boolean type 변환", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "disabled", type: "boolean", required: false },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("disabled?: boolean");
    });

    test("object type은 any로 변환", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [{ name: "data", type: "object", required: true }],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("data: any");
    });

    test("array type은 any[]로 변환", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [{ name: "items", type: "array", required: true }],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("items: any[]");
    });
  });

  describe("Variant Props - 유니온 타입 생성", () => {
    test("size variant가 유니온 타입으로 생성됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "size",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["S", "M", "L"],
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('size?: "S" | "M" | "L"');
    });

    test("type variant가 유니온 타입으로 생성됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "type",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["primary", "secondary", "tertiary"],
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain(
        'type?: "primary" | "secondary" | "tertiary"'
      );
    });

    test("variantOptions가 많을 때도 올바르게 생성", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "color",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["red", "blue", "green", "yellow", "purple"],
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain(
        'color?: "red" | "blue" | "green" | "yellow" | "purple"'
      );
    });

    test("size와 type이 함께 있을 때 둘 다 유니온 타입", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "size",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["S", "M", "L"],
          },
          {
            name: "type",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["filled", "outlined"],
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('size?: "S" | "M" | "L"');
      expect(result.code).toContain('type?: "filled" | "outlined"');
    });

    test("variantOptions가 없으면 string으로 생성", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "customProp",
            type: "string",
            required: false,
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("customProp?: string");
      expect(result.code).not.toContain("|");
    });
  });

  describe("Props 기본값 처리", () => {
    test("string prop의 기본값이 destructuring에 포함됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "title",
            type: "string",
            required: false,
            defaultValue: "Hello",
          },
        ],
        componentStructure: { elements: [] },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('title = "Hello"');
    });

    test("number prop의 기본값", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "count", type: "number", required: false, defaultValue: 0 },
        ],
        componentStructure: { elements: [] },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("count = 0");
    });

    test("boolean prop의 기본값", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "disabled",
            type: "boolean",
            required: false,
            defaultValue: false,
          },
        ],
        componentStructure: { elements: [] },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("disabled = false");
    });

    test("빈 문자열 기본값은 제외됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "title", type: "string", required: false, defaultValue: "" },
        ],
        componentStructure: { elements: [] },
      };

      const result = await generateReactCode(spec);
      // "title = """ 형태가 아니라 "title" 만 있어야 함
      expect(result.code).toContain("{ title }");
      expect(result.code).not.toContain('title = ""');
    });

    test("여러 props에 기본값", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "size", type: "string", required: false, defaultValue: "M" },
          { name: "count", type: "number", required: false, defaultValue: 10 },
          {
            name: "disabled",
            type: "boolean",
            required: false,
            defaultValue: true,
          },
        ],
        componentStructure: { elements: [] },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('size = "M"');
      expect(result.code).toContain("count = 10");
      expect(result.code).toContain("disabled = true");
    });
  });

  describe("Styles 생성", () => {
    test("styles 객체가 함수 외부에 생성됨", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      const validation = validateGeneratedCode(result.code);

      expect(validation.stylesBeforeFunction).toBe(true);
    });

    test("container 스타일에 layout 정보 포함", async () => {
      const result = await generateReactCode(simpleButtonSpec);

      expect(result.code).toContain("container: {");
      expect(result.code).toContain("display: 'flex'");
      expect(result.code).toContain("flexDirection: 'row'");
      expect(result.code).toContain("alignItems: 'center'");
    });

    test("중복된 이름은 고유 키로 생성", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            { id: "1", name: "icon", type: "INSTANCE", width: 24, height: 24 },
            { id: "2", name: "icon", type: "INSTANCE", width: 24, height: 24 },
          ],
        },
      };

      const result = await generateReactCode(spec);

      expect(result.code).toContain("icon:");
      expect(result.code).toContain("icon2:");
    });
  });

  describe("Element Bindings", () => {
    test("TEXT 요소가 prop에 바인딩됨", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain("{text}");
    });

    test("prop: prefix가 제거됨", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain("{text}");
      expect(result.code).not.toContain("{prop:text}");
    });

    test("INSTANCE 요소도 바인딩 가능", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "leftIcon", type: "component", required: false },
        ],
        componentStructure: {
          elements: [{ id: "1", name: "icon", type: "INSTANCE" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            connectedPropName: "prop:leftIcon",
            visibleMode: "always",
          },
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("{leftIcon}");
    });
  });

  describe("Internal State 생성", () => {
    test("useState import가 포함됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        internalStateDefinition: [
          { name: "count", type: "number", initialValue: 0 },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain('import { useState } from "react"');
    });

    test("useState 호출이 생성됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        internalStateDefinition: [
          { name: "count", type: "number", initialValue: 0 },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("const [count, setCount] = useState(0);");
    });

    test("state가 없으면 import도 없음", async () => {
      const spec = {
        metadata: { name: "Test" },
        internalStateDefinition: [],
      };

      const result = await generateReactCode(spec);
      expect(result.code).not.toContain("import { useState }");
    });
  });

  describe("Visibility 조건부 렌더링", () => {
    test("visibleMode: hidden은 렌더링 안 됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "HiddenText" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            visibleMode: "hidden",
          },
        },
      };

      const result = await generateReactCode(spec);
      // return 문 안에 해당 요소가 없어야 함
      const returnSection = result.code.split("return (")[1];
      expect(returnSection).toBeDefined();
      // span 태그가 없어야 함 (TEXT는 span으로 변환됨)
      const returnLines = returnSection?.split("}")[0] || "";
      expect(returnLines.includes("<span")).toBe(false);
    });

    test("visibleMode: expression은 조건부 렌더링", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "showTitle", type: "boolean", required: false },
        ],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "Title" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            connectedPropName: "prop:title",
            visibleMode: "expression",
            visibleExpression: "prop:showTitle",
          },
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("{showTitle &&");
    });

    test("visibleExpression에서 prop:/state: prefix 제거", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [{ name: "isOpen", type: "boolean", required: false }],
        internalStateDefinition: [
          { name: "count", type: "number", initialValue: 0 },
        ],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "Text" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            visibleMode: "expression",
            visibleExpression: "prop:isOpen && state:count > 0",
          },
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("{isOpen && count > 0 &&");
      expect(result.code).not.toContain("prop:");
      expect(result.code).not.toContain("state:");
    });
  });

  describe("rootElement 처리", () => {
    test("rootElement가 button이면 <button> 사용", async () => {
      const spec = {
        metadata: { name: "Test", rootElement: "button" },
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "text" }],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("<button");
      expect(result.code).toContain("</button>");
    });

    test("rootElement가 div이면 Fragment 사용", async () => {
      const spec = {
        metadata: { name: "Test", rootElement: "div" },
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "text" }],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("<>");
      expect(result.code).toContain("</>");
    });
  });

  describe("Export 문", () => {
    test("export default 포함", async () => {
      const result = await generateReactCode(simpleButtonSpec);
      expect(result.code).toContain("export default URButton;");
    });
  });

  describe("중첩된 컴포넌트 구조", () => {
    test("children이 있는 요소 렌더링", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "container",
              children: [{ id: "2", type: "TEXT", name: "text" }],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("<div>");
      expect(result.code).toContain("<span>");
    });

    test("깊은 중첩 구조", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "outer",
              children: [
                {
                  id: "2",
                  type: "FRAME",
                  name: "middle",
                  children: [{ id: "3", type: "TEXT", name: "inner" }],
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      // 3 depth의 div가 있어야 함
      const divCount = (result.code.match(/<div>/g) || []).length;
      expect(divCount).toBeGreaterThanOrEqual(2);
    });

    test("여러 children", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "container",
              children: [
                { id: "2", type: "TEXT", name: "text1" },
                { id: "3", type: "TEXT", name: "text2" },
                { id: "4", type: "TEXT", name: "text3" },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      const spanCount = (result.code.match(/<span>/g) || []).length;
      expect(spanCount).toBe(3);
    });
  });

  describe("여러 State 조합", () => {
    test("여러 state가 모두 생성됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        internalStateDefinition: [
          { name: "count", type: "number", initialValue: 0 },
          { name: "isOpen", type: "boolean", initialValue: false },
          { name: "text", type: "string", initialValue: "hello" },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("const [count, setCount] = useState(0);");
      expect(result.code).toContain(
        "const [isOpen, setIsOpen] = useState(false);"
      );
      expect(result.code).toContain(
        'const [text, setText] = useState("hello");'
      );
    });

    test("setter 이름이 올바르게 생성됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        internalStateDefinition: [
          { name: "isVisible", type: "boolean", initialValue: true },
          { name: "userName", type: "string", initialValue: "" },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("setIsVisible");
      expect(result.code).toContain("setUserName");
    });
  });

  describe("복잡한 Visibility 조건", () => {
    test("여러 조건이 조합된 expression", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "showTitle", type: "boolean", required: false },
          { name: "hasIcon", type: "boolean", required: false },
        ],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "text" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            visibleMode: "expression",
            visibleExpression: "prop:showTitle && prop:hasIcon",
          },
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("{showTitle && hasIcon &&");
    });

    test("state를 포함한 복잡한 조건", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "enabled", type: "boolean", required: false },
        ],
        internalStateDefinition: [
          { name: "count", type: "number", initialValue: 0 },
        ],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "text" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            visibleMode: "expression",
            visibleExpression: "prop:enabled && state:count > 5",
          },
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("{enabled && count > 5 &&");
    });
  });

  describe("엣지 케이스", () => {
    test("props가 없는 컴포넌트", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "text" }],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).not.toContain("interface");
      expect(result.code).toContain("function Test()");
    });

    test("state와 props가 모두 없는 컴포넌트", async () => {
      const spec = {
        metadata: { name: "EmptyComponent" },
        propsDefinition: [],
        internalStateDefinition: [],
        componentStructure: { elements: [] },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("function EmptyComponent()");
      expect(result.code).not.toContain("interface");
      expect(result.code).not.toContain("useState");
    });

    test("바인딩이 없는 TEXT 요소는 내용 없음", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "text" }],
        },
        elementBindings: {},
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("<span></span>");
    });

    test("매우 긴 variantOptions 목록", async () => {
      const options = Array.from({ length: 20 }, (_, i) => `option${i + 1}`);
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          {
            name: "variant",
            type: "string",
            required: false,
            variantOptions: options,
          },
        ],
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("option1");
      expect(result.code).toContain("option20");
      expect(result.code).toContain("|");
    });

    test("특수 문자가 포함된 prop 이름 처리", async () => {
      const spec = {
        metadata: { name: "Test" },
        propsDefinition: [
          { name: "data-testid", type: "string", required: false },
        ],
      };

      const result = await generateReactCode(spec);
      // 특수 문자가 있어도 정상 생성되어야 함
      expect(result.code.length).toBeGreaterThan(0);
    });
  });

  describe("색상 및 스타일 처리", () => {
    test("baseVariant의 배경색이 container에 적용됨", async () => {
      const spec = {
        metadata: { name: "Test", rootElement: "button" },
        componentStructure: {
          elements: [],
          boundingBox: { width: 100, height: 40 },
          fills: [
            {
              type: "SOLID",
              color: { r: 98, g: 140, b: 245 },
              opacity: 1,
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("background: 'rgb(98, 140, 245)'");
    });

    test("baseVariant의 cornerRadius가 적용됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [],
          boundingBox: { width: 100, height: 40 },
          cornerRadius: 12,
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("borderRadius: '12px'");
    });

    test("TEXT 노드는 color 사용 (background 아님)", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "TEXT",
              name: "text",
              fills: [
                {
                  type: "SOLID",
                  color: { r: 255, g: 255, b: 255 },
                  opacity: 1,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("color: 'rgb(255, 255, 255)'");
      expect(result.code).not.toContain("background: 'rgb(255, 255, 255)'");
    });

    test("TEXT 노드는 width/height 제외", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "TEXT",
              name: "text",
              width: 100,
              height: 24,
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      const textStyleMatch = result.code.match(/text:\s*{[^}]+}/);

      if (textStyleMatch) {
        expect(textStyleMatch[0]).not.toContain("width:");
        expect(textStyleMatch[0]).not.toContain("height:");
      }
    });

    test("FRAME/RECTANGLE은 background 사용", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "RECTANGLE",
              name: "rect",
              fills: [
                {
                  type: "SOLID",
                  color: { r: 100, g: 100, b: 100 },
                  opacity: 1,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("background: 'rgb(100, 100, 100)'");
    });

    test("테두리 색상과 두께 적용", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "RECTANGLE",
              name: "rect",
              strokes: [
                {
                  type: "SOLID",
                  color: { r: 0, g: 0, b: 0 },
                },
              ],
              strokeWeight: 2,
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("border: '2px solid rgb(0, 0, 0)'");
    });

    test("opacity가 1 미만일 때 rgba 사용", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "container",
              fills: [
                {
                  type: "SOLID",
                  color: { r: 255, g: 0, b: 0 },
                  opacity: 0.5,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("background: 'rgba(255, 0, 0, 0.5)'");
    });
  });

  describe("Absolute Positioning 처리", () => {
    test("layoutMode: NONE인 부모는 position: relative", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "container",
              layout: { layoutMode: "NONE", itemSpacing: 0 },
              children: [
                {
                  id: "2",
                  type: "RECTANGLE",
                  name: "child",
                  x: 10,
                  y: 20,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("position: 'relative'");
    });

    test("layoutMode: NONE 부모의 자식은 position: absolute", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "container",
              layout: { layoutMode: "NONE", itemSpacing: 0 },
              children: [
                {
                  id: "2",
                  type: "RECTANGLE",
                  name: "child",
                  x: 10,
                  y: 20,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("position: 'absolute'");
      expect(result.code).toContain("left: '10px'");
      expect(result.code).toContain("top: '20px'");
    });

    test("슬라이더 구조 (겹친 요소들)", async () => {
      const spec = {
        metadata: { name: "Slider" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "track-container",
              layout: { layoutMode: "NONE", itemSpacing: 0 },
              children: [
                {
                  id: "2",
                  type: "RECTANGLE",
                  name: "track",
                  x: 0,
                  y: 7,
                  width: 100,
                  height: 6,
                },
                {
                  id: "3",
                  type: "RECTANGLE",
                  name: "range",
                  x: 0,
                  y: 7,
                  width: 50,
                  height: 6,
                },
                {
                  id: "4",
                  type: "ELLIPSE",
                  name: "thumb",
                  x: 45,
                  y: 0,
                  width: 20,
                  height: 20,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);

      // 부모: position: relative
      expect(result.code).toContain("position: 'relative'");

      // 자식들: position: absolute
      const absoluteCount = (result.code.match(/position: 'absolute'/g) || [])
        .length;
      expect(absoluteCount).toBe(3); // track, range, thumb
    });
  });

  describe("ELLIPSE 타입 처리", () => {
    test("ELLIPSE는 borderRadius: 50%", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "ELLIPSE",
              name: "circle",
              width: 20,
              height: 20,
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("borderRadius: '50%'");
    });

    test("ELLIPSE with background color", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "ELLIPSE",
              name: "circle",
              width: 20,
              height: 20,
              fills: [
                {
                  type: "SOLID",
                  color: { r: 255, g: 0, b: 0 },
                  opacity: 1,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      expect(result.code).toContain("borderRadius: '50%'");
      expect(result.code).toContain("background: 'rgb(255, 0, 0)'");
    });
  });

  describe("Visibility 처리", () => {
    test("visible: false인 요소는 렌더링 안 됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "TEXT",
              name: "visible-text",
              visible: true,
            },
            {
              id: "2",
              type: "TEXT",
              name: "hidden-text",
              visible: false,
            },
          ],
        },
      };

      const result = await generateReactCode(spec);

      // return 문 확인
      const returnSection = result.code.split("return (")[1]?.split("}\n\n")[0];

      if (returnSection) {
        // span이 1개만 있어야 함 (visible: true만)
        const spanCount = (returnSection.match(/<span/g) || []).length;
        expect(spanCount).toBe(1);
      }
    });

    test("visible: false는 스타일도 생성 안 됨", async () => {
      const spec = {
        metadata: { name: "Test" },
        componentStructure: {
          elements: [
            {
              id: "hidden-elem",
              type: "TEXT",
              name: "hiddenText",
              visible: false,
              fills: [
                {
                  type: "SOLID",
                  color: { r: 255, g: 0, b: 0 },
                  opacity: 1,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);

      // hiddenText 스타일이 생성되지 않아야 함
      expect(result.code).not.toContain("hiddenText:");
    });
  });

  describe("Integration: 전체 코드 생성", () => {
    test("SimpleButton: 완전한 코드 생성", async () => {
      const result = await generateReactCode(simpleButtonSpec);

      // 전체 구조 검증
      const validation = validateGeneratedCode(result.code);
      expect(validation.hasInterface).toBe(true);
      expect(validation.hasStyles).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasReturn).toBe(true);
      expect(validation.hasExport).toBe(true);
      expect(validation.stylesBeforeFunction).toBe(true);

      // 내용 검증
      expect(result.code).toContain("interface");
      expect(result.code).toContain("const styles = {");
      expect(result.code).toContain("container: {");
      expect(result.code).toContain("function");
      expect(result.code).toContain("export default");

      // 출력 (디버깅용)
      console.log("\n=== Generated Code ===\n");
      console.log(result.code);
      console.log("\n=== End ===\n");
    });

    test("복잡한 컴포넌트: 모든 기능 통합", async () => {
      const spec = {
        metadata: { name: "ComplexButton", rootElement: "button" },
        propsDefinition: [
          {
            name: "size",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["S", "M", "L"],
            defaultValue: "M",
          },
          {
            name: "type",
            type: "string",
            required: false,
            readonly: true,
            variantOptions: ["primary", "secondary"],
            defaultValue: "primary",
          },
          { name: "text", type: "string", required: true },
          {
            name: "disabled",
            type: "boolean",
            required: false,
            defaultValue: false,
          },
          {
            name: "onClick",
            type: "function",
            required: false,
            parameters: [{ name: "e", type: "MouseEvent" }],
            returnType: "void",
          },
        ],
        internalStateDefinition: [
          { name: "isHovered", type: "boolean", initialValue: false },
          { name: "clickCount", type: "number", initialValue: 0 },
        ],
        componentStructure: {
          baseVariantName: "size=M, type=primary",
          elements: [
            {
              id: "elem-1",
              type: "FRAME",
              name: "container",
              width: 120,
              height: 40,
              children: [
                { id: "elem-2", type: "TEXT", name: "label" },
                { id: "elem-3", type: "TEXT", name: "badge" },
              ],
            },
          ],
        },
        elementBindings: {
          "elem-2": {
            elementId: "elem-2",
            elementName: "label",
            elementType: "TEXT",
            connectedPropName: "prop:text",
            visibleMode: "always",
          },
          "elem-3": {
            elementId: "elem-3",
            elementName: "badge",
            elementType: "TEXT",
            connectedPropName: null,
            visibleMode: "expression",
            visibleExpression: "state:clickCount > 0",
          },
        },
      };

      const result = await generateReactCode(spec);

      // Variant props가 유니온 타입으로
      expect(result.code).toContain('size?: "S" | "M" | "L"');
      expect(result.code).toContain('type?: "primary" | "secondary"');

      // 기본값
      expect(result.code).toContain('size = "M"');
      expect(result.code).toContain("disabled = false");

      // Internal state
      expect(result.code).toContain('import { useState } from "react"');
      expect(result.code).toContain(
        "const [isHovered, setIsHovered] = useState(false);"
      );
      expect(result.code).toContain(
        "const [clickCount, setClickCount] = useState(0);"
      );

      // Element bindings
      expect(result.code).toContain("{text}");
      expect(result.code).toContain("{clickCount > 0 &&");

      // Root element
      expect(result.code).toContain("<button");

      // 전체 구조
      const validation = validateGeneratedCode(result.code);
      expect(validation.hasInterface).toBe(true);
      expect(validation.hasStyles).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasReturn).toBe(true);
      expect(validation.hasExport).toBe(true);
    });
  });
});
