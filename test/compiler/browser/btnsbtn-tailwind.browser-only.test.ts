/**
 * Btnsbtn Tailwind 브라우저 렌더링 테스트
 *
 * cva polyfill + arbitrary class CSS 주입이 올바르게 동작하여
 * 실제 브라우저에서 computed style이 기대값과 일치하는지 검증.
 *
 * Figma 디자인 기준 전체 variant 매트릭스 커버.
 * 실행: npm run test:browser
 */
import { describe, test, expect, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import FigmaCodeGenerator from "@code-generator2";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";

import btnsbtnFixture from "../../fixtures/button/Btnsbtn.json";

describe("Btnsbtn Tailwind 브라우저 렌더링", () => {
  let Component: React.ComponentType<any>;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(btnsbtnFixture as any, {
      styleStrategy: "tailwind",
    });
    const code = await compiler.compile();
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
    const spans = container.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent === "button") return span;
    }
    throw new Error("Text span not found");
  }

  // ── 배경색: default ──

  describe("배경색 - default state", () => {
    test("filled+blue → #628CF5", () => {
      const { container } = renderButton({ state: "default", style: "filled", tone: "blue" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(98, 140, 245)");
    });

    test("filled+red → #FF8484", () => {
      const { container } = renderButton({ state: "default", style: "filled", tone: "red" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(255, 132, 132)");
    });

    test("outlined+blue → #F7F9FE", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "blue" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(247, 249, 254)");
    });

    test("outlined+red → #FFF (white)", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "red" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(255, 255, 255)");
    });

    test("outlined+basic → #FFF (white)", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "basic" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(255, 255, 255)");
    });
  });

  // ── 배경색: loading ──

  describe("배경색 - loading state", () => {
    test("filled+blue → #FFF (white)", () => {
      const { container } = renderButton({ state: "loading", style: "filled", tone: "blue" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(255, 255, 255)");
    });

    test("filled+red → #FFF (white)", () => {
      const { container } = renderButton({ state: "loading", style: "filled", tone: "red" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(255, 255, 255)");
    });

    test("outlined+blue → #FFF (white)", () => {
      const { container } = renderButton({ state: "loading", style: "outlined", tone: "blue" });
      expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe("rgb(255, 255, 255)");
    });
  });

  // ── 텍스트 색상: default + filled (흰색) ──

  describe("텍스트 색상 - default+filled (흰색)", () => {
    test("filled+blue → 흰색", () => {
      const { container } = renderButton({ state: "default", style: "filled", tone: "blue", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(255, 255, 255)");
    });

    test("filled+red → 흰색", () => {
      const { container } = renderButton({ state: "default", style: "filled", tone: "red", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(255, 255, 255)");
    });
  });

  // ── 텍스트 색상: default + outlined (tone 색상) ──

  describe("텍스트 색상 - default+outlined (tone 색상)", () => {
    test("outlined+blue → #4978EB", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "blue", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(73, 120, 235)");
    });

    test("outlined+red → #EE4C54", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "red", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(238, 76, 84)");
    });

    test("outlined+basic → #1A1A1A", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "basic", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(26, 26, 26)");
    });
  });

  // ── 텍스트 색상: loading + filled (tone 색상, 흰색 아님) ──

  describe("텍스트 색상 - loading+filled (tone 색상)", () => {
    test("filled+blue → #4978EB (파란색)", () => {
      const { container } = renderButton({ state: "loading", style: "filled", tone: "blue", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(73, 120, 235)");
    });

    test("filled+red → #EE4C54 (빨간색)", () => {
      const { container } = renderButton({ state: "loading", style: "filled", tone: "red", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(238, 76, 84)");
    });
  });

  // ── 텍스트 색상: loading + outlined (tone 색상) ──

  describe("텍스트 색상 - loading+outlined (tone 색상)", () => {
    test("outlined+blue → #4978EB", () => {
      const { container } = renderButton({ state: "loading", style: "outlined", tone: "blue", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(73, 120, 235)");
    });

    test("outlined+red → #EE4C54", () => {
      const { container } = renderButton({ state: "loading", style: "outlined", tone: "red", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(238, 76, 84)");
    });

    test("outlined+basic → #1A1A1A", () => {
      const { container } = renderButton({ state: "loading", style: "outlined", tone: "basic", buttonText: "button" });
      expect(getComputedStyle(getTextElement(container)).color).toBe("rgb(26, 26, 26)");
    });
  });

  // ── border ──

  describe("border", () => {
    test("default+outlined+blue에 border가 있어야 한다", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "blue" });
      expect(getComputedStyle(getRootElement(container)).border).toContain("solid");
    });

    test("default+outlined+red에 border가 있어야 한다", () => {
      const { container } = renderButton({ state: "default", style: "outlined", tone: "red" });
      expect(getComputedStyle(getRootElement(container)).border).toContain("solid");
    });

    test("loading+outlined에 border가 있어야 한다", () => {
      const { container } = renderButton({ state: "loading", style: "outlined", tone: "blue" });
      expect(getComputedStyle(getRootElement(container)).border).toContain("solid");
    });
  });
});
