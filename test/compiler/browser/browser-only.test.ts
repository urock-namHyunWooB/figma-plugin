/**
 * 브라우저 전용 테스트
 * getComputedStyle 등 실제 브라우저 CSS 엔진이 필요한 테스트
 *
 * 실행: npm run test:browser
 */
import { describe, test, expect, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import FigmaCodeGenerator from "@code-generator";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";

import taptapButtonMockData from "../../fixtures/button/taptapButton.json";
import urockButtonSampleMockData from "../../fixtures/button/urockButton.json";
import urockChipsMockData from "../../fixtures/chip/urock-chips.json";

describe("브라우저 전용 스타일 테스트", () => {
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

    function getTextElement(container: HTMLElement): HTMLElement {
      const span = container.querySelector("span") as HTMLElement | null;
      if (!span) throw new Error("Text <span> not found");
      return span;
    }

    test("Text color는 흰색이여야 한다.", () => {
      const { container } = renderButton({
        size: "Large",
        leftIcon: null,
        rightIcon: null,
      });
      const textEl = getTextElement(container);
      const styles = getComputedStyle(textEl);
      expect(styles.color).toBe("rgb(255, 255, 255)");
    });
  });

  describe("urockButton", () => {
    let Component: React.ComponentType<any>;

    beforeAll(async () => {
      const compiler = new FigmaCodeGenerator(urockButtonSampleMockData as any);
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

    test("customType이 outlined_blue일때 배경색은 #F7F9FE 이다.", async () => {
      const { container } = renderButton({
        customType: "outlined_blue",
      });
      const root = getRootElement(container);
      const styles = getComputedStyle(root);
      expect(styles.backgroundColor).toBe("rgb(247, 249, 254)");
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

    test("prop color가 cyan이면 배경색은 #AEF2F6 이다", () => {
      const { container } = renderChip({
        color: "cyan",
      });
      const root = getRootElement(container);
      const styles = getComputedStyle(root);
      expect(styles.backgroundColor).toBe("rgb(174, 242, 246)");
    });
  });
});
