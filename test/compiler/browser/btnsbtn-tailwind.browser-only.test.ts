/**
 * Btnsbtn Tailwind 브라우저 렌더링 테스트
 *
 * 전체 variant 매트릭스 (default/loading/disable × filled/outlined × blue/red/basic)
 * 배경색 + 텍스트 색상 + border를 실제 브라우저에서 computed style로 검증.
 *
 * hover/active는 CSS pseudo-class라서 getComputedStyle로 테스트 불가.
 * → 코드 문자열 테스트(test-btnsbtn-decompose.test.ts)에서 hover: 클래스 존재 검증.
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

// Figma 디자인 기준 기대값
// prettier-ignore
const EXPECTED = {
  bg: {
    "default+filled+blue":    "rgb(98, 140, 245)",   // #628CF5
    "default+filled+red":     "rgb(255, 132, 132)",   // #FF8484
    "default+outlined+blue":  "rgb(247, 249, 254)",   // #F7F9FE
    "default+outlined+red":   "rgb(255, 255, 255)",   // #FFF
    "default+outlined+basic": "rgb(255, 255, 255)",   // #FFF
    "loading+filled+blue":    "rgb(255, 255, 255)",   // #FFF
    "loading+filled+red":     "rgb(255, 255, 255)",   // #FFF
    "loading+outlined+blue":  "rgb(255, 255, 255)",   // #FFF
    "loading+outlined+red":   "rgb(255, 255, 255)",   // #FFF
    "loading+outlined+basic": "rgb(255, 255, 255)",   // #FFF
    "disable+filled+blue":    "rgb(230, 230, 230)",   // #E6E6E6
    "disable+filled+red":     "rgb(230, 230, 230)",
    "disable+outlined+blue":  "rgb(230, 230, 230)",
    "disable+outlined+red":   "rgb(230, 230, 230)",
    "disable+outlined+basic": "rgb(230, 230, 230)",
  },
  textColor: {
    // default+filled: 흰색
    "default+filled+blue":    "rgb(255, 255, 255)",   // #FFF
    "default+filled+red":     "rgb(255, 255, 255)",   // #FFF
    // default+outlined: tone 색상
    "default+outlined+blue":  "rgb(73, 120, 235)",    // #4978EB
    "default+outlined+red":   "rgb(238, 76, 84)",     // #EE4C54
    "default+outlined+basic": "rgb(26, 26, 26)",      // #1A1A1A
    // loading+filled: tone 색상
    "loading+filled+blue":    "rgb(73, 120, 235)",    // #4978EB
    "loading+filled+red":     "rgb(238, 76, 84)",     // #EE4C54
    // loading+outlined: tone 색상
    "loading+outlined+blue":  "rgb(73, 120, 235)",    // #4978EB
    "loading+outlined+red":   "rgb(238, 76, 84)",     // #EE4C54
    "loading+outlined+basic": "rgb(26, 26, 26)",      // #1A1A1A
    // disable: 회색
    "disable+filled+blue":    "rgb(118, 118, 118)",   // #767676
    "disable+filled+red":     "rgb(118, 118, 118)",
    "disable+outlined+blue":  "rgb(118, 118, 118)",
    "disable+outlined+red":   "rgb(118, 118, 118)",
    "disable+outlined+basic": "rgb(118, 118, 118)",
  },
} as const;

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

  // ── 배경색 전체 매트릭스 ──

  describe("배경색", () => {
    for (const [key, expected] of Object.entries(EXPECTED.bg)) {
      const [state, style, tone] = key.split("+");
      test(`${state}+${style}+${tone} → ${expected}`, () => {
        const { container } = renderButton({ state, style, tone });
        expect(getComputedStyle(getRootElement(container)).backgroundColor).toBe(expected);
      });
    }
  });

  // ── 텍스트 색상 전체 매트릭스 ──

  describe("텍스트 색상", () => {
    for (const [key, expected] of Object.entries(EXPECTED.textColor)) {
      const [state, style, tone] = key.split("+");
      test(`${state}+${style}+${tone} → ${expected}`, () => {
        const { container } = renderButton({ state, style, tone, buttonText: "button" });
        expect(getComputedStyle(getTextElement(container)).color).toBe(expected);
      });
    }
  });

  // ── border ──

  describe("border", () => {
    const outlinedCombos = [
      { state: "default", tone: "blue" },
      { state: "default", tone: "red" },
      { state: "default", tone: "basic" },
      { state: "loading", tone: "blue" },
      { state: "loading", tone: "red" },
      { state: "loading", tone: "basic" },
    ];

    for (const { state, tone } of outlinedCombos) {
      test(`${state}+outlined+${tone}에 border가 있어야 한다`, () => {
        const { container } = renderButton({ state, style: "outlined", tone });
        expect(getComputedStyle(getRootElement(container)).border).toContain("solid");
      });
    }
  });
});
