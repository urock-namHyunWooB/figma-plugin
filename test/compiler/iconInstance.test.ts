import { describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import frame03MockData from "../fixtures/any/frame-03.json";

import FigmaCodeGenerator from "@code-generator2";

describe("INSTANCE 아이콘 SVG 합성 테스트", () => {
  describe("frame-03.json", () => {
    test("FigmaCodeGenerator 결과의 생성된 코드에 svg 요소가 포함되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      // 생성된 코드에 svg가 포함되어야 함 (서브 컴포넌트 정의 안에)
      expect(code).toBeDefined();
      expect(code).toContain("svg");
    });

    test("vector-only 의존 컴포넌트는 컴포넌트 참조로 렌더링되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Iconanchor 서브 컴포넌트가 정의되어야 함
      expect(code).toMatch(/Iconanchor/);

      // Frame에서 <Iconanchor> 참조가 있어야 함
      expect(code).toMatch(/<Iconanchor/);
    });

    test("서브 컴포넌트 정의에 SVG가 포함되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Iconanchor 컴포넌트 정의 안에 SVG가 있어야 함
      const iconMatch = code!.match(
        /const Iconanchor[\s\S]*?return\s*\(?([\s\S]*?)\);\s*\};/
      );
      expect(iconMatch).not.toBeNull();
      expect(iconMatch![1]).toContain("<svg");
    });

    test("메인 컴포넌트에서 SVG가 인라인되지 않고 컴포넌트 참조로 사용되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Frame 컴포넌트의 return 부분 추출
      const frameMatch = code!.match(
        /function Frame\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\)?;\s*\}/
      );
      expect(frameMatch).not.toBeNull();

      const frameReturn = frameMatch![1];

      // Frame 내부에 인라인 SVG가 아닌 컴포넌트 참조가 있어야 함
      expect(frameReturn).toMatch(/<Iconanchor/);
    });

    test("여러 인스턴스에서도 각각 컴포넌트 참조로 렌더링되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Frame 컴포넌트의 return 부분 추출
      const frameMatch = code!.match(
        /function Frame\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\)?;\s*\}/
      );
      expect(frameMatch).not.toBeNull();

      const frameReturn = frameMatch![1];

      // frame-03.json에 3개의 인스턴스가 있으므로 참조도 3개 있어야 함
      const refMatches = frameReturn.match(/<Iconanchor/g);
      expect(refMatches).not.toBeNull();
      expect(refMatches!.length).toBe(3);
    });
  });
});
