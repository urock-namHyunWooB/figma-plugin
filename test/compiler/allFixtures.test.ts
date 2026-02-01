import { describe, test, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import FigmaCodeGenerator from "@compiler";

// ===== Fixtures Lazy 로드 =====
const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

// fixtures 배열 생성
const allFixtures = Object.entries(fixtureLoaders).map(([path, loader]) => {
  const name = path.replace("../fixtures/", "").replace(".json", "");
  return { name, loader };
});

describe("모든 Fixture 렌더링 테스트", () => {
  describe("Emotion 전략", () => {
    test.each(allFixtures)("$name - 렌더링 성공", async ({ name, loader }) => {
      // 각 테스트에서 직접 데이터 로드
      const module = await loader();
      const data = module.default;
      expect(data).toBeDefined();

      // 컴파일
      const compiler = new FigmaCodeGenerator(data as any);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code!.length).toBeGreaterThan(0);

      // 렌더링
      const Component = await renderReactComponent(code!);
      const { container } = render(React.createElement(Component, {}));

      expect(container).toBeInTheDocument();
      expect(container.firstElementChild).not.toBeNull();
    });
  });

  describe("Tailwind 전략", () => {
    test.each(allFixtures)("$name - 렌더링 성공", async ({ name, loader }) => {
      // 각 테스트에서 직접 데이터 로드
      const module = await loader();
      const data = module.default;
      expect(data).toBeDefined();

      // 컴파일
      const compiler = new FigmaCodeGenerator(data as any, {
        styleStrategy: { type: "tailwind" },
      });
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code!.length).toBeGreaterThan(0);

      // 렌더링
      const Component = await renderReactComponent(code!);
      const { container } = render(React.createElement(Component, {}));

      expect(container).toBeInTheDocument();
      expect(container.firstElementChild).not.toBeNull();
    });
  });
});
