import { describe, test, expect, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import FigmaCodeGenerator from "@code-generator2";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import fixture from "../../fixtures/failing/Tagreview.json";

describe("Tagreview Tailwind 렌더링 디버그", () => {
  let Component: React.ComponentType<any>;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(fixture as any, { styleStrategy: "tailwind" });
    const code = await compiler.compile();
    Component = await renderReactComponent(code!);
  });

  test("Small 레이아웃 디버그", () => {
    const { container } = render(React.createElement(Component, { size: "Small", state: "Approved" }));
    const root = container.firstElementChild as HTMLElement;
    const group897 = root.querySelector("div") as HTMLElement;
    const textSpan = root.querySelector("span:last-of-type") as HTMLElement;

    const rootStyles = getComputedStyle(root);
    const groupStyles = getComputedStyle(group897);

    console.log("root display:", rootStyles.display);
    console.log("root flexDirection:", rootStyles.flexDirection);
    console.log("root gap:", rootStyles.gap);
    console.log("root padding:", rootStyles.padding);
    console.log("group897 width:", groupStyles.width);
    console.log("group897 height:", groupStyles.height);
    console.log("group897 position:", groupStyles.position);

    // Group897이 실제 크기를 가져야 텍스트가 겹치지 않음
    expect(groupStyles.width).toBe("16px");
    expect(groupStyles.position).toBe("relative");
    expect(rootStyles.display).toContain("flex");
  });
});
