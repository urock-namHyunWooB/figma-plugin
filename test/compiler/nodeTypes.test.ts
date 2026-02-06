import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@compiler";
import groupNode01 from "../fixtures/any/group-node-01.json";
import type { FigmaNodeData } from "@compiler/types/index";

// ===== 컴파일 결과 캐시 =====
interface CachedResult {
  code: string | null;
  data: FigmaNodeData;
}

const cache: Record<string, CachedResult> = {};

// 테스트 시작 전 캐시 워밍업
beforeAll(async () => {
  // 데이터 준비
  const baseData = groupNode01 as unknown as FigmaNodeData;

  const noImageUrls = JSON.parse(JSON.stringify(groupNode01)) as FigmaNodeData;
  delete noImageUrls.imageUrls;

  const withImageUrls = JSON.parse(JSON.stringify(groupNode01)) as FigmaNodeData;
  withImageUrls.imageUrls = {
    "48dc7678f6ad4a7fd7b1dcb194118c5a0f6a2b1e": "https://example.com/image1.png",
    "4201c9377fef273eb9b49ee63d8c826211da1a6b": "https://example.com/image2.png",
  };

  const noVectorSvgs = JSON.parse(JSON.stringify(groupNode01)) as FigmaNodeData;
  delete noVectorSvgs.vectorSvgs;

  const withVectorSvgs = JSON.parse(JSON.stringify(groupNode01)) as FigmaNodeData;
  withVectorSvgs.vectorSvgs = {
    "1313:58606":
      '<svg width="1800" height="1"><line x1="0" y1="0" x2="1800" y2="0" stroke="black"/></svg>',
  };

  // 병렬 컴파일
  const [baseCode, noImageUrlsCode, withImageUrlsCode, noVectorSvgsCode, withVectorSvgsCode] =
    await Promise.all([
      new FigmaCodeGenerator(baseData).getGeneratedCode("TestComponent"),
      new FigmaCodeGenerator(noImageUrls).getGeneratedCode("TestComponent"),
      new FigmaCodeGenerator(withImageUrls).getGeneratedCode("TestComponent"),
      new FigmaCodeGenerator(noVectorSvgs).getGeneratedCode("TestComponent"),
      new FigmaCodeGenerator(withVectorSvgs).getGeneratedCode("TestComponent"),
    ]);

  // 캐시 저장
  cache["base"] = { code: baseCode, data: baseData };
  cache["noImageUrls"] = { code: noImageUrlsCode, data: noImageUrls };
  cache["withImageUrls"] = { code: withImageUrlsCode, data: withImageUrls };
  cache["noVectorSvgs"] = { code: noVectorSvgsCode, data: noVectorSvgs };
  cache["withVectorSvgs"] = { code: withVectorSvgsCode, data: withVectorSvgs };
});

describe("노드 타입 지원 테스트", () => {
  describe("이미지 URL 처리", () => {
    test("imageUrls 맵이 없으면 placeholder가 유지된다", () => {
      const code = cache["noImageUrls"].code;
      expect(code).toContain("<path-to-image>");
    });

    test("imageUrls 맵이 있으면 placeholder가 실제 URL로 교체된다", () => {
      const code = cache["withImageUrls"].code;
      expect(code).toContain("https://example.com/image1.png");
      expect(code).toContain("https://example.com/image2.png");
    });
  });

  describe("GROUP 노드", () => {
    test("GROUP 노드가 div로 렌더링되어야 한다", () => {
      const code = cache["base"].code;
      expect(code).toContain("<div");
    });
  });

  describe("VECTOR 노드", () => {
    test("vectorSvgs가 없으면 div 태그로 렌더링된다 (배경색 적용)", () => {
      const code = cache["noVectorSvgs"].code;
      // vectorSvg가 없으면 svg 대신 div로 렌더링 (fill → background 변환)
      expect(code).toContain("<div");
    });

    test("vectorSvgs가 있으면 SVG가 JSX로 변환되어 렌더링된다", () => {
      const code = cache["withVectorSvgs"].code;
      expect(code).toContain("<svg");
      expect(code).toContain("<line");
      expect(code).not.toContain("dangerouslySetInnerHTML");
    });
    // camelCase, 숫자 속성 테스트는 svgToJsx.test.ts에서 커버
  });
});

