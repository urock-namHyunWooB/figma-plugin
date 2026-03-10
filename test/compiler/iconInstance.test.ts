import { describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import frame03MockData from "../fixtures/any/frame-03.json";

import FigmaCodeGenerator from "@code-generator2";

describe("INSTANCE 아이콘 SVG 합성 테스트", () => {
  describe("frame-03.json", () => {
    test("FigmaCodeGenerator 결과의 생성된 코드에 svg 요소가 포함되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      // 생성된 코드에 svg가 포함되어야 함
      expect(code).toBeDefined();
      expect(code).toContain("svg");
    });

    test("vector-only 의존 컴포넌트는 인라인 SVG로 렌더링되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Frame 컴포넌트 내부에 직접 SVG가 포함되어야 함
      const frameMatch = code!.match(
        /function Frame\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\)?;\s*\}/
      );
      expect(frameMatch).not.toBeNull();

      const frameReturn = frameMatch![1];

      // 인라인 SVG가 Frame 내부에 직접 존재해야 함
      expect(frameReturn).toContain("<svg");
      expect(frameReturn).toContain("<path");
    });

    test("vector-only 의존 컴포넌트는 별도 컴포넌트로 분리되지 않아야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Iconanchor 컴포넌트 정의가 없어야 함 (인라인됨)
      expect(code).not.toMatch(/const Iconanchor/);

      // Frame에서 <Iconanchor> 참조도 없어야 함
      expect(code).not.toMatch(/<Iconanchor/);
    });

    test("vector-only 의존 컴포넌트의 SVG가 메인 컴포넌트에 인라인되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Frame 컴포넌트의 return 부분에 SVG가 직접 포함되어야 함
      const frameMatch = code!.match(
        /function Frame\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\)?;\s*\}/
      );
      expect(frameMatch).not.toBeNull();

      const frameReturn = frameMatch![1];

      // dangerouslySetInnerHTML로 SVG가 인라인됨
      expect(frameReturn).toMatch(/dangerouslySetInnerHTML|<svg/);
    });

    test("여러 인스턴스에서도 각각 인라인 SVG가 렌더링되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.compile();

      expect(code).toBeDefined();

      // Frame 컴포넌트의 return 부분 추출
      const frameMatch = code!.match(
        /function Frame\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\)?;\s*\}/
      );
      expect(frameMatch).not.toBeNull();

      const frameReturn = frameMatch![1];

      // frame-03.json에 3개의 인스턴스가 있으므로 SVG도 3개 있어야 함
      const svgMatches = frameReturn.match(/<svg[^>]*>/g);
      expect(svgMatches).not.toBeNull();
      expect(svgMatches!.length).toBe(3);
    });
  });
});
