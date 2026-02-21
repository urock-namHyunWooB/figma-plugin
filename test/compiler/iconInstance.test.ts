import { describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import frame03MockData from "../fixtures/any/frame-03.json";

import FigmaCodeGenerator from "@code-generator2";
import DataPreparer from "@code-generator/core/data-preparer/DataPreparer";

describe("INSTANCE 아이콘 SVG 합성 테스트", () => {
  describe("frame-03.json", () => {
    const dataPreparer = new DataPreparer();
    const preparedData = dataPreparer.prepare(frame03MockData as any);

    test("PreparedDesignData.getVectorSvgsByInstanceId가 INSTANCE 내부 Vector들을 반환해야 한다", () => {
      // INSTANCE ID: 3285:3250
      const vectors = preparedData.getVectorSvgsByInstanceId("3285:3250");

      // vectorSvgs에 I3285:3250;... 형태의 키가 2개 있어야 함
      expect(vectors.length).toBe(2);
      expect(vectors[0].svg).toContain("<svg");
      expect(vectors[0].svg).toContain("<path");
    });

    test("PreparedDesignData.mergeInstanceVectorSvgs가 합성된 SVG를 반환해야 한다", () => {
      const mergedSvg = preparedData.mergeInstanceVectorSvgs("3285:3250");

      expect(mergedSvg).toBeDefined();
      expect(mergedSvg).toContain("<svg");
      expect(mergedSvg).toContain("<path");
      // 합성된 SVG는 viewBox를 가져야 함
      expect(mergedSvg).toContain("viewBox");
    });

    test("FigmaCodeGenerator 결과의 생성된 코드에 svg 요소가 포함되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.getGeneratedCode();

      // 생성된 코드에 svg가 포함되어야 함
      expect(code).toBeDefined();
      expect(code).toContain("svg");
    });

    test("의존 컴포넌트(Iconanchor)가 SVG를 내부에 포함해야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.getGeneratedCode();

      expect(code).toBeDefined();

      // Iconanchor 컴포넌트 정의 부분 추출
      const iconanchorMatch = code!.match(
        /function Iconanchor\([^)]*\)\s*\{[\s\S]*?return\s*([\s\S]*?);\s*\}/
      );
      expect(iconanchorMatch).not.toBeNull();

      const iconanchorReturn = iconanchorMatch![1];

      // Iconanchor가 <svg> 또는 vectorSvg를 포함해야 함
      expect(iconanchorReturn).toMatch(/<svg[^>]*>|dangerouslySetInnerHTML/);
      expect(iconanchorReturn).toMatch(/<path|dangerouslySetInnerHTML/);
    });

    test("메인 컴포넌트(Frame)에서 Iconanchor를 self-closing 태그로 참조해야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.getGeneratedCode();

      expect(code).toBeDefined();

      // Frame 컴포넌트 정의 부분 추출 (대소문자 무관)
      const frameMatch = code!.match(
        /function Frame\([^)]*\)\s*\{[\s\S]*?return\s*\(?([\s\S]*?)\)?;\s*\}/
      );
      expect(frameMatch).not.toBeNull();

      const frameReturn = frameMatch![1];

      // Frame에서 Iconanchor는 self-closing (<Iconanchor ... />) 이어야 함
      expect(frameReturn).toMatch(/<Iconanchor[^>]*\/>/);

      // Frame 내부에 직접적인 <svg> 태그가 없어야 함 (Iconanchor 참조만 있어야 함)
      expect(frameReturn).not.toMatch(/<svg[^>]*>/);
    });

    test("의존 컴포넌트에 vectorSvg가 주입되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const result = await compiler.getGeneratedCodeWithDependencies();

      // dependencies에 Iconanchor가 있어야 함 (v2는 배열)
      const deps = result.dependencies || [];
      expect(deps.length).toBeGreaterThan(0);

      // 의존 컴포넌트 코드에 svg가 포함되어야 함
      const firstDep = deps[0];
      expect(firstDep.code).toContain("<svg");
      expect(firstDep.code).toContain("<path");
    });

    test("여러 인스턴스가 있어도 의존 컴포넌트는 하나만 생성되어야 한다", async () => {
      const compiler = new FigmaCodeGenerator(frame03MockData as any);
      const code = await compiler.getGeneratedCode();

      expect(code).toBeDefined();

      // Iconanchor 함수 정의가 정확히 1개만 있어야 함
      const iconanchorDefMatches = code!.match(/function Iconanchor\(/g);
      expect(iconanchorDefMatches).not.toBeNull();
      expect(iconanchorDefMatches!.length).toBe(1);

      // Frame에서 Iconanchor 사용은 3번 (frame-03.json에 3개의 인스턴스가 있음)
      const iconanchorUsageMatches = code!.match(/<Iconanchor[^>]*\/>/g);
      expect(iconanchorUsageMatches).not.toBeNull();
      expect(iconanchorUsageMatches!.length).toBe(3);
    });
  });
});
