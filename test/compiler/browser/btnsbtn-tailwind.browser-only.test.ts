/**
 * Btnsbtn Tailwind 브라우저 렌더링 테스트
 *
 * cva polyfill + arbitrary class CSS 주입이 올바르게 동작하여
 * 실제 브라우저에서 computed style이 기대값과 일치하는지 검증.
 *
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
    // 텍스트 span은 buttonText를 포함하는 span
    for (const span of spans) {
      if (span.textContent === "button") return span;
    }
    throw new Error("Text span not found");
  }

  // ── 배경색 ──

  test("default+filled+blue 배경색은 #628CF5", () => {
    const { container } = renderButton({
      state: "default",
      style: "filled",
      tone: "blue",
    });
    const root = getRootElement(container);
    const bg = getComputedStyle(root).backgroundColor;
    expect(bg).toBe("rgb(98, 140, 245)");
  });

  test("default+filled+red 배경색은 #FF8484", () => {
    const { container } = renderButton({
      state: "default",
      style: "filled",
      tone: "red",
    });
    const root = getRootElement(container);
    const bg = getComputedStyle(root).backgroundColor;
    expect(bg).toBe("rgb(255, 132, 132)");
  });

  test("default+outlined+blue 배경색은 #F7F9FE", () => {
    const { container } = renderButton({
      state: "default",
      style: "outlined",
      tone: "blue",
    });
    const root = getRootElement(container);
    const bg = getComputedStyle(root).backgroundColor;
    expect(bg).toBe("rgb(247, 249, 254)");
  });

  // ── 텍스트 색상 ──

  test("default+filled+blue 텍스트는 흰색", () => {
    const { container } = renderButton({
      state: "default",
      style: "filled",
      tone: "blue",
      buttonText: "button",
    });
    const textEl = getTextElement(container);
    const color = getComputedStyle(textEl).color;
    expect(color).toBe("rgb(255, 255, 255)");
  });

  test("default+outlined+blue 텍스트는 파란색(#4978EB)", () => {
    const { container } = renderButton({
      state: "default",
      style: "outlined",
      tone: "blue",
      buttonText: "button",
    });
    const textEl = getTextElement(container);
    const color = getComputedStyle(textEl).color;
    expect(color).toBe("rgb(73, 120, 235)");
  });

  test("default+outlined+red 텍스트는 빨간색(#EE4C54)", () => {
    const { container } = renderButton({
      state: "default",
      style: "outlined",
      tone: "red",
      buttonText: "button",
    });
    const textEl = getTextElement(container);
    const color = getComputedStyle(textEl).color;
    expect(color).toBe("rgb(238, 76, 84)");
  });

  // ── border ──

  test("default+outlined+blue에 border가 있어야 한다", () => {
    const { container } = renderButton({
      state: "default",
      style: "outlined",
      tone: "blue",
    });
    const root = getRootElement(container);
    const border = getComputedStyle(root).border;
    expect(border).toContain("solid");
  });
});
