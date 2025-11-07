import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { generateReactCode } from "./utils/test-helpers";
import { compileReactComponent } from "../src/ui/utils/component-compiler";

/**
 * 생성된 컴포넌트를 실제로 렌더링해서 DOM 검증
 *
 * 테스트 목적:
 * 1. 생성된 코드가 실제로 실행 가능한지
 * 2. DOM에 올바르게 렌더링되는지
 * 3. Props가 제대로 적용되는지
 * 4. 스타일이 올바르게 적용되는지
 */
describe("Component Runtime 렌더링 테스트", () => {
  describe("기본 렌더링", () => {
    test("생성된 버튼 컴포넌트가 렌더링됨", async () => {
      const spec = {
        metadata: { name: "Button", rootElement: "button" },
        propsDefinition: [{ name: "text", type: "string", required: true }],
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "TEXT",
              name: "label",
            },
          ],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            connectedPropName: "prop:text",
            visibleMode: "always",
          },
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      render(<Component />);

      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByText("Click me")).toBeInTheDocument();
    });

    test("div rootElement로 렌더링", async () => {
      const spec = {
        metadata: { name: "Card", rootElement: "div" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "TEXT",
              name: "title",
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      const { container } = render(<Component />);

      // Fragment로 렌더링되므로 직접 div 확인
      const divs = container.querySelectorAll("div");
      expect(divs.length).toBeGreaterThan(0);
    });
  });

  describe("Props 전달 및 렌더링", () => {
    test("string prop이 텍스트로 표시됨", async () => {
      const spec = {
        metadata: { name: "Label" },
        propsDefinition: [{ name: "text", type: "string", required: true }],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "label" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            connectedPropName: "prop:text",
            visibleMode: "always",
          },
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      render(<Component text="Hello World" />);

      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    test("기본값이 적용됨", async () => {
      const spec = {
        metadata: { name: "Button" },
        propsDefinition: [
          {
            name: "text",
            type: "string",
            required: false,
            defaultValue: "Default Text",
          },
        ],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "label" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            connectedPropName: "prop:text",
            visibleMode: "always",
          },
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      // prop 전달하지 않음 → 기본값 사용
      render(<Component />);

      expect(screen.getByText("Default Text")).toBeInTheDocument();
    });

    test("variant props가 유니온 타입으로 작동", async () => {
      const spec = {
        metadata: { name: "Button", rootElement: "button" },
        propsDefinition: [
          {
            name: "size",
            type: "string",
            required: false,
            variantOptions: ["S", "M", "L"],
            defaultValue: "M",
          },
          { name: "text", type: "string", required: true },
        ],
        componentStructure: {
          elements: [{ id: "1", type: "TEXT", name: "label" }],
        },
        elementBindings: {
          "1": {
            elementId: "1",
            connectedPropName: "prop:text",
            visibleMode: "always",
          },
        },
      };

      const result = await generateReactCode(spec);

      // 인터페이스 검증
      expect(result.code).toContain('size?: "S" | "M" | "L"');

      const Component = compileReactComponent(result.code);

      // 각 size 값으로 렌더링 가능
      const { rerender } = render(<Component size="S" text="Small" />);
      expect(screen.getByText("Small")).toBeInTheDocument();

      rerender(<Component size="M" text="Medium" />);
      expect(screen.getByText("Medium")).toBeInTheDocument();

      rerender(<Component size="L" text="Large" />);
      expect(screen.getByText("Large")).toBeInTheDocument();
    });
  });

  describe("스타일 렌더링", () => {
    test("배경색이 적용됨", async () => {
      const spec = {
        metadata: { name: "ColoredBox", rootElement: "div" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "FRAME",
              name: "box",
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
      const Component = compileReactComponent(result.code);

      const { container } = render(<Component />);
      const box = container.querySelector("div div"); // 두 번째 div

      expect(box).toHaveStyle({ background: "rgb(255, 0, 0)" });
    });

    test("테두리가 적용됨", async () => {
      const spec = {
        metadata: { name: "BorderedBox" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "RECTANGLE",
              name: "box",
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
      const Component = compileReactComponent(result.code);

      const { container } = render(<Component />);
      const box = container.querySelector("div");

      expect(box).toHaveStyle({ border: "2px solid rgb(0, 0, 0)" });
    });

    test("borderRadius가 적용됨", async () => {
      const spec = {
        metadata: { name: "RoundedBox" },
        componentStructure: {
          elements: [],
          boundingBox: { width: 100, height: 100 },
          cornerRadius: 16,
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      const { container } = render(<Component />);
      // container의 style 확인은 어려우므로 코드 검증
      expect(result.code).toContain("borderRadius: '16px'");
    });

    test("ELLIPSE는 원형으로 렌더링", async () => {
      const spec = {
        metadata: { name: "Circle" },
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "ELLIPSE",
              name: "circle",
              width: 50,
              height: 50,
              fills: [
                {
                  type: "SOLID",
                  color: { r: 0, g: 0, b: 255 },
                  opacity: 1,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      const { container } = render(<Component />);
      const circle = container.querySelector("div");

      expect(circle).toHaveStyle({
        borderRadius: "50%",
        background: "rgb(0, 0, 255)",
      });
    });
  });

  describe("조건부 렌더링", () => {
    test("visibleMode: expression이 작동함", async () => {
      const spec = {
        metadata: { name: "Conditional" },
        propsDefinition: [
          { name: "showTitle", type: "boolean", required: false },
          { name: "title", type: "string", required: false },
        ],
        componentStructure: {
          elements: [
            {
              id: "1",
              type: "TEXT",
              name: "title",
            },
          ],
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
      const Component = compileReactComponent(result.code);

      // showTitle: false → 텍스트 없음
      const { rerender } = render(
        <Component showTitle={false} title="Hidden" />
      );
      expect(screen.queryByText("Hidden")).not.toBeInTheDocument();

      // showTitle: true → 텍스트 표시
      rerender(<Component showTitle={true} title="Visible" />);
      expect(screen.getByText("Visible")).toBeInTheDocument();
    });
  });

  describe("Absolute Positioning 렌더링", () => {
    test("absolute positioned 요소들이 겹쳐서 렌더링됨", async () => {
      const spec = {
        metadata: { name: "OverlappedElements" },
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
                  name: "bg",
                  x: 0,
                  y: 0,
                  width: 100,
                  height: 100,
                },
                {
                  id: "3",
                  type: "RECTANGLE",
                  name: "overlay",
                  x: 10,
                  y: 10,
                  width: 80,
                  height: 80,
                },
              ],
            },
          ],
        },
      };

      const result = await generateReactCode(spec);
      const Component = compileReactComponent(result.code);

      const { container } = render(<Component />);

      // position: relative인 부모
      const parent = container.querySelector("[style*='position: relative']");
      expect(parent).toBeInTheDocument();

      // position: absolute인 자식들
      const absoluteElements = container.querySelectorAll(
        "[style*='position: absolute']"
      );
      expect(absoluteElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("에러 처리", () => {
    test("잘못된 코드는 에러 발생", () => {
      const invalidCode = "this is not valid code";

      expect(() => compileReactComponent(invalidCode)).toThrow();
    });

    test("export default 없는 코드는 에러", () => {
      const codeWithoutExport = `
        function MyComponent() {
          return <div>Hello</div>;
        }
      `;

      expect(() => compileReactComponent(codeWithoutExport)).toThrow();
    });
  });
});
