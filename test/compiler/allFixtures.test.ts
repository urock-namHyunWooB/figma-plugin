import { describe, test, expect, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";
import { getCachedCompile, warmupCache } from "../utils/shared-compile-cache";

// ===== Fixtures Lazy 로드 =====
// import.meta.glob으로 fixtures 폴더 하위 모든 JSON 파일의 로더 함수 수집
const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

// fixtures 배열 생성 (경로와 로더만 포함, 데이터는 나중에 로드)
const allFixtures = Object.entries(fixtureLoaders).map(([path, loader]) => {
  // path: "../fixtures/button/tadaButton.json" → name: "button/tadaButton"
  const name = path.replace("../fixtures/", "").replace(".json", "");
  return {
    name,
    loader,
  };
});

// ===== 모든 fixture 데이터 사전 로드 =====
const fixtureDataCache = new Map<string, unknown>();

beforeAll(async () => {
  // 모든 fixture 데이터 로드
  await Promise.all(
    allFixtures.map(async ({ name, loader }) => {
      const module = await loader();
      fixtureDataCache.set(name, module.default);
    })
  );

  // 공유 캐시로 모든 fixture 컴파일 (캐시 워밍업)
  const fixturesForCache = allFixtures.map(({ name }) => ({
    name,
    data: fixtureDataCache.get(name)!,
  }));
  await warmupCache(fixturesForCache);
});

describe("모든 Fixture 렌더링 테스트", () => {
  // 컴파일 테스트는 렌더링 테스트에서 암묵적으로 검증됨 (code !== null 체크)
  
  describe("Emotion 전략", () => {
    test.concurrent.each(allFixtures)("$name - 렌더링 성공", async ({ name }) => {
      const data = fixtureDataCache.get(name);
      expect(data).toBeDefined();

      const cached = await getCachedCompile(name, data);
      const code = cached.emotion;

      expect(code).not.toBeNull();
      expect(code!.length).toBeGreaterThan(0);

      try {
        const Component = await renderReactComponent(code!);
        const { container } = render(React.createElement(Component, {}));

        expect(container).toBeInTheDocument();
        expect(container.firstElementChild).not.toBeNull();
      } catch (error) {
        console.error(`[${name}] 렌더링 실패:`, error);
        console.error(
          `[${name}] 생성된 코드 (처음 500자):\n`,
          code?.slice(0, 500)
        );
        throw error;
      }
    });
  });

  describe("Tailwind 전략", () => {
    test.concurrent.each(allFixtures)("$name - 렌더링 성공", async ({ name }) => {
      const data = fixtureDataCache.get(name);
      expect(data).toBeDefined();

      const cached = await getCachedCompile(name, data);
      const code = cached.tailwind;

      expect(code).not.toBeNull();
      expect(code!.length).toBeGreaterThan(0);

      try {
        const Component = await renderReactComponent(code!);
        const { container } = render(React.createElement(Component, {}));

        expect(container).toBeInTheDocument();
        expect(container.firstElementChild).not.toBeNull();
      } catch (error) {
        console.error(`[${name}] Tailwind 렌더링 실패:`, error);
        console.error(
          `[${name}] 생성된 코드 (처음 500자):\n`,
          code?.slice(0, 500)
        );
        throw error;
      }
    });
  });
});

describe("컴파일/렌더링 통계", () => {
  test("fixture 개수 확인 (동적 로드)", () => {
    console.log(`로드된 fixture 개수: ${allFixtures.length}`);
    console.log("Fixtures:", allFixtures.map((f) => f.name).join(", "));
    expect(allFixtures.length).toBeGreaterThan(0);
  });
});
