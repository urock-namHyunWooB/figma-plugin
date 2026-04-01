import { describe, test, expect, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import FigmaCodeGenerator from "@code-generator2";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import fixture from "../../fixtures/failing/Tagreview.json";

describe("Tagreview Tailwind 렌더링", () => {
  let Component: React.ComponentType<any>;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(fixture as any, { styleStrategy: "tailwind" });
    const code = await compiler.compile();
    Component = await renderReactComponent(code!);
  });

  test("Small — 아이콘과 텍스트 겹침 안 됨", () => {
    const { container } = render(React.createElement(Component, { size: "Small", state: "Approved", label: "Approved" }));
    const root = container.firstElementChild as HTMLElement;
    const group897 = root.querySelector("div") as HTMLElement;
    const ellipse = group897?.querySelector("span") as HTMLElement;

    const rootS = getComputedStyle(root);
    const groupS = getComputedStyle(group897);
    const ellipseS = ellipse ? getComputedStyle(ellipse) : null;

    console.log("ROOT:", "display:", rootS.display, "flexDir:", rootS.flexDirection, "gap:", rootS.gap, "padding:", rootS.padding);
    console.log("GROUP:", "w:", groupS.width, "h:", groupS.height, "pos:", groupS.position, "overflow:", groupS.overflow);
    console.log("ELLIPSE:", "w:", ellipseS?.width, "h:", ellipseS?.height, "pos:", ellipseS?.position, "left:", ellipseS?.left);

    // 기본 레이아웃
    expect(rootS.display).toContain("flex");
    expect(groupS.position).toBe("relative");
    expect(groupS.width).toBe("16px");

    // Ellipse는 Group897 내에서 absolute이고 Group897과 같은 크기여야 함
    if (ellipseS) {
      expect(ellipseS.position).toBe("absolute");
      expect(ellipseS.width).toBe("16px");
    }

    // 텍스트가 아이콘 영역 뒤에 있어야 함
    const allSpans = root.querySelectorAll(":scope > span");
    const textSpan = allSpans[allSpans.length - 1] as HTMLElement;
    if (textSpan && group897) {
      const groupRight = group897.offsetLeft + group897.offsetWidth;
      console.log("TEXT:", "offsetLeft:", textSpan.offsetLeft, "groupRight:", groupRight);
      expect(textSpan.offsetLeft).toBeGreaterThanOrEqual(groupRight - 2);
    }
  });
});
