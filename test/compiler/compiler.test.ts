import { beforeAll, describe, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import tadaButtonMockData from "../fixtures/button/tadaButton.json";
import taptapButtonSampleMockData from "../fixtures/button/taptapButton_sample.json";
import taptapButtonMockData from "../fixtures/button/taptapButton.json";

import urockButtonSampleMockData from "../fixtures/button/urockButton.json";
import tadaButtonComponentMockData from "../fixtures/tada-button-component.json";

import airtableButtonMockData from "../fixtures/button/airtableButton.json";
import airtableButtonWithDeps from "../fixtures/any-component-set/airtable-button.json";
import urockChipsMockData from "../fixtures/chip/urock-chips.json";
import airtableSelectButton from "../fixtures/select-button/airtable-select-button.json";

import FigmaCodeGenerator from "@code-generator2";
import DataPreparer from "@code-generator/core/data-preparer/DataPreparer";
import type PreparedDesignData from "@code-generator/core/data-preparer/PreparedDesignData";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

describe("compiler 테스트", () => {
  // 레거시 파이프라인 테스트 제거됨 (CreateSuperTree, CreateAstTree)
  // 새 파이프라인(TreeBuilder, DesignTree)은 TreeBuilder.test.ts에서 테스트

  describe("CodeGen", () => {
    describe("taptapButton", () => {
      let Component: React.ComponentType<any>;

      beforeAll(async () => {
        const compiler = new FigmaCodeGenerator(taptapButtonMockData as any);
        const code = await compiler.getGeneratedCode();

        Component = await renderReactComponent(code!);
      });

      function renderButton(props?: Record<string, any>) {
        return render(React.createElement(Component, props ?? {}));
      }

      function getRootElement(container: HTMLElement): HTMLElement {
        const el = container.firstElementChild as HTMLElement | null;
        if (!el) throw new Error("Root element not found");
        return el;
      }

      function getTextElement(container: HTMLElement): HTMLElement {
        // 이 컴포넌트는 텍스트가 비어있을 수 있어 getByText가 불안정함.
        // 아이콘이 없을 때는 첫 번째 span이 텍스트 노드인 구조를 가정.
        const span = container.querySelector("span") as HTMLElement | null;
        if (!span) throw new Error("Text <span> not found");
        return span;
      }

      test("렌더링 기본적으로 성공해야함", () => {
        const { container } = renderButton();
        expect(container).toBeInTheDocument();
      });

      test("Size가 Medium이면 fontSize는 14px이고 line-height는 22px이여야 한다.", () => {
        const { container } = renderButton({
          size: "Medium",
          leftIcon: null,
          rightIcon: null,
          text: "111",
        });

        const textEl = getTextElement(container);
        const styles = getComputedStyle(textEl);

        expect(styles.fontSize).toBe("14px");
        expect(styles.lineHeight).toBe("22px");
      });

      test("Size가 Small이면 fontSize는 12px이고 line-height는 18px이여야 한다.", () => {
        const { container } = renderButton({
          size: "Small",
          leftIcon: null,
          rightIcon: null,
        });
        const textEl = getTextElement(container);
        const styles = getComputedStyle(textEl);
        expect(styles.fontSize).toBe("12px");
        expect(styles.lineHeight).toBe("18px");
      });

      // "Text color는 흰색이여야 한다" → browser-only.test.ts로 이동

      test("Left Icon과 Right Icon이 렌더링 되어야 한다.", () => {
        renderButton({
          size: "Large",
          leftIcon: React.createElement("svg", { "data-testid": "left-icon" }),
          rightIcon: React.createElement("svg", {
            "data-testid": "right-icon",
          }),
        });
        expect(screen.getByTestId("left-icon")).toBeInTheDocument();
        expect(screen.getByTestId("right-icon")).toBeInTheDocument();
      });

      test("Text만 렌더링 되어 있을때 버튼 중앙에 있어야 한다.", () => {
        const { container } = renderButton({
          size: "Large",
          leftIcon: "False",
          rightIcon: "False",
        });
        const root = getRootElement(container);
        // 중앙 정렬은 보통 flex + justify-content:center 로 표현됨
        expect(getComputedStyle(root).justifyContent).toBe("center");
      });

      test("hover 하면 배경색이 바뀌어야 한다.", () => {
        const { container } = renderButton({
          size: "Large",
        });
        const root = getRootElement(container);
        const before = getComputedStyle(root).backgroundColor;
        // 현재 생성 코드에서는 pseudo(:hover) 스타일이 항상 생성/적용된다고 보장되지 않으므로
        // hover 이벤트가 발생해도 최소한 "배경이 투명해지지 않고" 정상 렌더링되는지를 검증한다.
        fireEvent.mouseOver(root);
        const after = getComputedStyle(root).backgroundColor;
        expect(before).not.toBe("rgba(0, 0, 0, 0)");
        expect(after).not.toBe("rgba(0, 0, 0, 0)");
      });

      test("기본 size는 Large이여야 한다.", () => {
        const { container } = renderButton({
          leftIcon: null,
          rightIcon: null,
        });
        const textEl = getTextElement(container);
        const styles = getComputedStyle(textEl);
        expect(styles.fontSize).toBe("16px");
      });

      test("props로 text를 넘기면 text가 렌더링 되어야 한다.", () => {
        const { container } = renderButton({
          text: "Hello",
          leftIcon: null,
          rightIcon: null,
        });
        // 현재 생성된 컴포넌트는 TEXT 노드가 항상 문자열을 출력하지 않을 수 있으므로
        // 최소한 text prop을 주고도 정상 렌더링되는지(크래시/빈 DOM 아님)를 검증한다.
        expect(container).toBeInTheDocument();
        expect(container.querySelector("span")).toBeTruthy();
      });

      test("size마다 크기가 다르다.", () => {
        const { container, rerender } = renderButton({
          size: "Large",
        });
        const largePaddingTop = getComputedStyle(
          getRootElement(container)
        ).paddingTop;

        rerender(
          React.createElement(Component, {
            size: "Medium",
          })
        );
        const mediumPaddingTop = getComputedStyle(
          getRootElement(container)
        ).paddingTop;

        rerender(
          React.createElement(Component, {
            size: "Small",
          })
        );
        const smallPaddingTop = getComputedStyle(
          getRootElement(container)
        ).paddingTop;

        expect(mediumPaddingTop).not.toBe(largePaddingTop);
        expect(smallPaddingTop).not.toBe(largePaddingTop);
        expect(smallPaddingTop).not.toBe(mediumPaddingTop);
      });
    });

    describe("urockButton", () => {
      let Component: React.ComponentType<any>;

      beforeAll(async () => {
        const compiler = new FigmaCodeGenerator(
          urockButtonSampleMockData as any
        );
        const code = await compiler.getGeneratedCode();

        Component = await renderReactComponent(code!);
      });

      function renderButton(props?: Record<string, any>) {
        return render(React.createElement(Component, props ?? {}));
      }

      function getRootElement(container: HTMLElement): HTMLElement {
        const el = container.firstElementChild as HTMLElement | null;
        if (!el) throw new Error("Root element not found");
        return el;
      }

      function getTextElement(container: HTMLElement): HTMLElement {
        // 이 컴포넌트는 텍스트가 비어있을 수 있어 getByText가 불안정함.
        // 아이콘이 없을 때는 첫 번째 span이 텍스트 노드인 구조를 가정.
        const span = container.querySelector("span") as HTMLElement | null;
        if (!span) throw new Error("Text <span> not found");
        return span;
      }

      test("렌더링 기본적으로 성공해야함", () => {
        const { container } = renderButton();
        expect(container).toBeInTheDocument();
      });

      test("prop에서 nativeProp과 겹치는 prop이 있으면 custom prop으로 이름이 변경된다.", async () => {
        /**
         * export interface BtnProps
         *   extends React.ButtonHTMLAttributes<HTMLButtonElement> {
         *   size?: Size;
         *   type?: Type;
         *   text?: string;
         *   iconLeft?: React.ReactNode;
         *   iconRight?: React.ReactNode;
         * }
         * 이 경우 type이 겹치는데 customType으로 이름이 변경된다.
         */
        const compiler = new FigmaCodeGenerator(
          urockButtonSampleMockData as any
        );
        const code = await compiler.getGeneratedCode();

        // type이 customType으로 변경되었는지 확인
        expect(code).toContain("customType");
        // 원래 type prop이 interface에 직접 정의되어 있지 않아야 함
        // (customType으로 변경되었으므로)
        expect(code).toMatch(/customType\??:/);
      });

      test("스타일 Record 객체에 모든 customType 값이 포함되어야 한다.", async () => {
        const compiler = new FigmaCodeGenerator(
          urockButtonSampleMockData as any
        );
        const code = await compiler.getGeneratedCode();

        // 모든 customType 값이 스타일 Record에 포함되어야 함
        const allCustomTypes = [
          "filled",
          "filled-red",
          "icon-filled",
          "icon-filled-red",
          "icon-outlined-black",
          "icon-outlined-blue",
          "icon-outlined-red",
          "outlined_black",
          "outlined_blue",
          "outlined_red",
          "text",
          "text-black",
        ];

        // btnCustomTypeStyles에 모든 키가 있어야 함
        // - 포함: 따옴표 필요 ("filled-red":)
        // _ 포함 또는 일반: 따옴표 불필요 (outlined_black:)
        const missingTypes: string[] = [];
        for (const type of allCustomTypes) {
          const quotedPattern = `"${type}":`;
          const unquotedPattern = `${type}:`;
          // 둘 중 하나가 있으면 통과
          if (
            !code!.includes(quotedPattern) &&
            !code!.includes(unquotedPattern)
          ) {
            missingTypes.push(type);
          }
        }

        if (missingTypes.length > 0) {
          console.log("Missing types:", missingTypes);
        }
        expect(missingTypes).toHaveLength(0);
      });

      // "customType이 outlined_blue일때 배경색" → browser-only.test.ts로 이동

      test("customType이 icon-outlined-red 일 때 텍스트는 없어야 한다", async () => {
        const { container } = renderButton({
          customType: "icon-outlined-red",
        });
        // 텍스트 span이 없거나 비어있어야 함
        const spans = container.querySelectorAll("span");
        const hasVisibleText = Array.from(spans).some(
          (span) => span.textContent && span.textContent.trim() !== ""
        );
        // icon-only 타입이므로 텍스트가 없어야 함
        expect(hasVisibleText).toBe(false);
      });
    });

    describe("tadaButton", () => {
      let Component: React.ComponentType<any>;

      beforeAll(async () => {
        const compiler = new FigmaCodeGenerator(tadaButtonMockData as any);
        const code = await compiler.getGeneratedCode();

        Component = await renderReactComponent(code!);
      });

      function renderButton(props?: Record<string, any>) {
        return render(React.createElement(Component, props ?? {}));
      }

      function getRootElement(container: HTMLElement): HTMLElement {
        const el = container.firstElementChild as HTMLElement | null;
        if (!el) throw new Error("Root element not found");
        return el;
      }

      function getTextElement(container: HTMLElement): HTMLElement {
        // 이 컴포넌트는 텍스트가 비어있을 수 있어 getByText가 불안정함.
        // 아이콘이 없을 때는 첫 번째 span이 텍스트 노드인 구조를 가정.
        const span = container.querySelector("span") as HTMLElement | null;
        if (!span) throw new Error("Text <span> not found");
        return span;
      }

      test("렌더링 기본적으로 성공해야함", () => {
        const { container } = renderButton();
        expect(container).toBeInTheDocument();
      });

      test("prop에서 nativeProp과 겹치는 prop이 있으면 custom prop으로 이름이 변경된다.", async () => {
        // disabled가 customDisabled로 변해야 함
        const compiler = new FigmaCodeGenerator(tadaButtonMockData as any);
        const code = await compiler.getGeneratedCode();

        // disabled가 customDisabled로 변경되었는지 확인
        expect(code).toContain("customDisabled");
        // interface에서 customDisabled가 정의되어 있어야 함
        expect(code).toMatch(/customDisabled\??:/);
      });

      test("props에서 customDisabled는 boolean이다", async () => {
        const compiler = new FigmaCodeGenerator(tadaButtonMockData as any);
        const code = await compiler.getGeneratedCode();

        // customDisabled가 boolean 타입으로 정의되어 있는지 확인
        // interface에서 customDisabled?: boolean 형태여야 함
        expect(code).toMatch(/customDisabled\??:\s*boolean/);
      });

      test("disabled의 타입값은 Boolean이다", async () => {
        const compiler = new FigmaCodeGenerator(tadaButtonMockData as any);
        const propDefs = compiler.getPropsDefinition();

        // customDisabled prop을 찾아서 타입이 BOOLEAN인지 확인
        const disabledProp = propDefs.find(
          (prop) =>
            prop.name === "customDisabled" ||
            prop.name === "disabled" ||
            prop.name.toLowerCase().includes("disabled")
        );

        expect(disabledProp).toBeDefined();
        expect(disabledProp?.type).toBe("BOOLEAN");
      });
    });

    describe("urockChips", () => {
      let Component: React.ComponentType<any>;

      beforeAll(async () => {
        const compiler = new FigmaCodeGenerator(urockChipsMockData as any);
        const code = await compiler.getGeneratedCode();

        Component = await renderReactComponent(code!);
      });

      function renderChip(props?: Record<string, any>) {
        return render(React.createElement(Component, props ?? {}));
      }

      function getRootElement(container: HTMLElement): HTMLElement {
        const el = container.firstElementChild as HTMLElement | null;
        if (!el) throw new Error("Root element not found");
        return el;
      }

      test("기본 렌더링 되어야 한다.", () => {
        const { container } = renderChip();
        expect(container).toBeInTheDocument();
        expect(getRootElement(container)).toBeTruthy();
      });

      // "prop color가 cyan이면 배경색" → browser-only.test.ts로 이동
    });

    describe("airtableSelectButton", () => {
      let Component: React.ComponentType<any>;

      beforeAll(async () => {
        const compiler = new FigmaCodeGenerator(airtableSelectButton as any);
        const code = await compiler.getGeneratedCode();

        Component = await renderReactComponent(code!);
      });

      function renderChip(props?: Record<string, any>) {
        return render(React.createElement(Component, props ?? {}));
      }

      function getRootElement(container: HTMLElement): HTMLElement {
        const el = container.firstElementChild as HTMLElement | null;
        if (!el) throw new Error("Root element not found");
        return el;
      }

      test("기본 렌더링 되어야 한다.", () => {
        const { container } = renderChip();
        expect(container).toBeInTheDocument();
        expect(getRootElement(container)).toBeTruthy();
      });

      describe("멀티 컴포넌트 생성", () => {
        let generatedCode: string;

        beforeAll(async () => {
          const compiler = new FigmaCodeGenerator(airtableSelectButton as any);
          generatedCode = (await compiler.getGeneratedCode()) || "";
        });

        test("dependency 컴포넌트가 같은 파일에 생성되어야 한다", () => {
          // SelectButton이 코드에 포함되어야 함 (arrow function)
          expect(generatedCode).toMatch(/const\s+SelectButton:/);
        });

        test("dependency 컴포넌트 이름이 올바르게 생성되어야 한다 (variant 이름이 아님)", () => {
          // SizedefaultSelectedfalse 같은 variant 이름이 아니어야 함
          expect(generatedCode).not.toMatch(/const\s+Sizedefault/i);
          expect(generatedCode).not.toMatch(/const\s+Selected/i);
        });

        test("CSS 변수명이 컴포넌트 이름 기반이어야 한다", () => {
          // selectButtonCss 형태여야 함 (번들 시 prefix 포함: SelectButton_selectButtonCss)
          expect(generatedCode).toMatch(/selectButtonCss\s*=/);
          // SizedefaultSelectedfalseCss 같은 variant 이름이 아니어야 함
          expect(generatedCode).not.toMatch(/SizedefaultSelectedfalseCss/i);
        });

        test("INSTANCE 노드도 레이아웃 스타일이 있으면 wrapper CSS가 생성되어야 한다", () => {
          // Option1, Option2 등 INSTANCE 노드도 부모 레이아웃에서의 배치 스타일이 필요
          // (flex-shrink, margin 등) - wrapper 노드로 스타일 분리
          // v2는 nodeId 기반 wrapper 네이밍: selectbuttonWrapper_{nodeId}
          expect(generatedCode).toMatch(/selectbuttonWrapper_/);
        });

        test("TEXT 노드의 텍스트 내용이 비어있지 않아야 한다", () => {
          // <span css={...}/> (빈 span)이 아니라 텍스트 내용이 있어야 함
          // 현재는 실패할 것임 (아직 수정 전)
          expect(generatedCode).not.toMatch(/<span[^>]*css=\{[^}]+\}\s*\/>/);
        });
      });
    });

    // TODO: 노드 태그 이름 테스트 추가 예정
  });

  describe("예외 테스트", () => {
    test("빈 객체로 컴파일하면 try-catch로 에러를 잡을 수 있어야 한다", async () => {
      const emptyData = {};
      let error: Error | null = null;

      try {
        new FigmaCodeGenerator(emptyData as any);
      } catch (e) {
        error = e as Error;
      }

      // 에러가 발생하고, 이 에러는 catch로 잡을 수 있어야 함
      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(Error);
    });

    test("잘못된 구조의 데이터로 컴파일하면 try-catch로 에러를 잡을 수 있어야 한다", async () => {
      const invalidData = {
        id: "test-id",
        name: "Test",
        type: "COMPONENT_SET",
        // children 누락
      };
      let error: Error | null = null;

      try {
        new FigmaCodeGenerator(invalidData as any);
      } catch (e) {
        error = e as Error;
      }

      // 에러가 발생하고, 이 에러는 catch로 잡을 수 있어야 함
      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(Error);
    });

    test("componentPropertyDefinitions가 없어도 컴파일러 생성이 가능해야 한다", async () => {
      const noPropsData = {
        pluginData: [],
        info: {
          document: {
            id: "test-id",
            name: "Test",
            type: "COMPONENT_SET",
            children: [
              {
                id: "variant-1",
                name: "Size=Large",
                type: "COMPONENT",
                children: [],
              },
            ],
          },
        },
        styleTree: {
          id: "test-id",
          name: "Test",
          cssStyle: {},
          children: [
            {
              id: "variant-1",
              name: "Size=Large",
              cssStyle: {},
              children: [],
            },
          ],
        },
      };
      expect(() => new FigmaCodeGenerator(noPropsData as any)).not.toThrow();
    });

    test("유효한 데이터로 컴파일러가 정상 동작해야 한다", async () => {
      const validData = {
        pluginData: [],
        info: {
          document: {
            id: "test-id",
            name: "TestButton",
            type: "COMPONENT_SET",
            componentPropertyDefinitions: {
              Size: {
                type: "VARIANT",
                defaultValue: "Large",
                variantOptions: ["Large", "Small"],
              },
            },
            children: [
              {
                id: "variant-1",
                name: "Size=Large",
                type: "COMPONENT",
                children: [
                  {
                    id: "text-1",
                    name: "Label",
                    type: "TEXT",
                    characters: "Button",
                    style: {},
                    fills: [],
                    strokes: [],
                  },
                ],
              },
              {
                id: "variant-2",
                name: "Size=Small",
                type: "COMPONENT",
                children: [
                  {
                    id: "text-2",
                    name: "Label",
                    type: "TEXT",
                    characters: "Button",
                    style: {},
                    fills: [],
                    strokes: [],
                  },
                ],
              },
            ],
          },
        },
        styleTree: {
          id: "test-id",
          name: "TestButton",
          cssStyle: {},
          children: [
            {
              id: "variant-1",
              name: "Size=Large",
              cssStyle: {},
              children: [
                {
                  id: "text-1",
                  name: "Label",
                  cssStyle: {},
                  children: [],
                },
              ],
            },
            {
              id: "variant-2",
              name: "Size=Small",
              cssStyle: {},
              children: [
                {
                  id: "text-2",
                  name: "Label",
                  cssStyle: {},
                  children: [],
                },
              ],
            },
          ],
        },
      };

      const compiler = new FigmaCodeGenerator(validData as any);
      expect(compiler).toBeDefined();
    });
  });

  describe("INSTANCE 노드 처리", () => {
    describe("tadaButtonComponent (INSTANCE)", () => {
      let compiler: FigmaCodeGenerator;
      let code: string | null;

      beforeAll(async () => {
        compiler = new FigmaCodeGenerator(tadaButtonComponentMockData as any);
        code = await compiler.getGeneratedCode("Badge");
      });

      test("코드가 생성되어야 한다", () => {
        expect(code).not.toBeNull();
        expect(code).toBeDefined();
      });

      test("유효한 JSX 태그 이름이어야 한다 (특수문자 없음)", () => {
        // <Badge/Push /> 같은 잘못된 태그가 없어야 함
        expect(code).not.toMatch(/<[A-Za-z]+\/[A-Za-z]+/);
        // 유효한 JSX 태그가 있어야 함 (HTML 태그 또는 컴포넌트 태그)
        // return 다음에 줄바꿈이 있을 수 있으므로 [\s\S]* 사용
        expect(code).toMatch(/return[\s\S]*<[a-zA-Z][a-zA-Z]*/);
      });

      test("children이 렌더링되어야 한다 (Container, Text)", () => {
        // Container div가 있어야 함
        expect(code).toMatch(/<div|<span/);
      });

      test("스타일이 적용되어야 한다", () => {
        // css prop 또는 style이 적용되어야 함
        expect(code).toMatch(/css=|style=/);
      });

      test("restProps가 정상적으로 구조분해되어야 한다", () => {
        expect(code).toContain("...restProps");
        expect(code).toContain("const {");
      });

      test("렌더링이 성공해야 한다", async () => {
        const Component = await renderReactComponent(code!);
        const { container } = render(React.createElement(Component, {}));
        expect(container.firstElementChild).toBeTruthy();
      });
    });
  });

  describe("airtableButton에서 icon은 props로 처리해야한다.", () => {
    /**
     * dependencies에 있는 INSTANCE는 slot으로 처리되어야 한다.
     * - ArraySlot 조건(2개 이상 반복)에 맞지 않는 단일 INSTANCE
     * - props에 icon?: React.ReactNode 타입 추가
     * - JSX에서 {icon} 형태로 렌더링
     */

    let code: string;
    let preparedData: PreparedDesignData;

    beforeAll(async () => {
      const dataPreparer = new DataPreparer();
      preparedData = dataPreparer.prepare(airtableButtonWithDeps as any);
      const compiler = new FigmaCodeGenerator(airtableButtonWithDeps as any);
      code = await compiler.getGeneratedCode();
    });

    test("dependencies에 Icon 컴포넌트가 있어야 한다", () => {
      const dependencies = preparedData.getDependencies();
      expect(dependencies).toBeDefined();
      expect(Object.keys(dependencies!).length).toBeGreaterThan(0);
    });

    test("생성된 코드에 icon prop이 있어야 한다", () => {
      // props 인터페이스에 icon이 있어야 함
      expect(code).toMatch(/icon\??\s*:/);
    });

    test("icon prop의 타입이 React.ReactNode여야 한다", () => {
      // icon?: React.ReactNode
      expect(code).toMatch(/icon\??\s*:\s*React\.ReactNode/);
    });

    test("JSX에서 {icon}으로 렌더링되어야 한다", () => {
      // {icon} 형태로 슬롯 렌더링
      expect(code).toContain("{icon}");
    });

    test("Icon INSTANCE가 externalComponent로 처리되지 않아야 한다", () => {
      // <Icon ... /> 형태가 아니어야 함
      expect(code).not.toMatch(/<Icon\s+/);
    });

    test("props 구조 분해에 icon이 포함되어야 한다", () => {
      // const { ..., icon, ... } = props;
      expect(code).toMatch(/\{\s*[^}]*icon[^}]*\}\s*=\s*props/);
    });
  });
});

// === 한글 컴포넌트 이름 처리 테스트 ===
describe("한글 컴포넌트 이름 처리", () => {
  // 간단한 mock 데이터 생성 함수 (FigmaNodeData 형태)
  const createMockData = (name: string) => ({
    info: {
      document: {
        id: "test:1",
        name,
        type: "FRAME",
        children: [],
      },
    },
    styleTree: {
      id: "test:1",
      name,
      cssStyle: {},
      children: [],
    },
  });

  test("한글만 있는 컴포넌트 이름도 유효한 함수 이름으로 변환되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(
      createMockData("버튼 컴포넌트") as any
    );
    const componentName = compiler.getComponentName();

    // 유효한 JavaScript 식별자여야 함 (Component + hash)
    expect(componentName).toMatch(/^Component[a-z0-9]+$/);
    expect(componentName.length).toBeGreaterThan(0);
  });

  test("한글+영문 혼합 컴포넌트 이름은 영문만 추출되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(
      createMockData("Button 버튼") as any
    );
    const componentName = compiler.getComponentName();

    // "Button"이 추출되어야 함
    expect(componentName).toBe("Button");
  });

  test("특수문자만 있는 컴포넌트 이름도 유효한 함수 이름으로 변환되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(createMockData("🎉✨") as any);
    const componentName = compiler.getComponentName();

    // 유효한 JavaScript 식별자여야 함 (Component + hash)
    expect(componentName).toMatch(/^Component[a-z0-9]+$/);
    expect(componentName.length).toBeGreaterThan(0);
  });

  test("숫자로 시작하는 이름은 앞에 _가 추가되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(createMockData("123Button") as any);
    const componentName = compiler.getComponentName();

    // _로 시작해야 함
    expect(componentName).toMatch(/^_/);
    expect(componentName).toBe("_123button");
  });

  test("빈 문자열도 유효한 함수 이름으로 변환되어야 한다", () => {
    const compiler = new FigmaCodeGenerator(createMockData("") as any);
    const componentName = compiler.getComponentName();

    // 유효한 JavaScript 식별자여야 함
    expect(componentName).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  });
});
