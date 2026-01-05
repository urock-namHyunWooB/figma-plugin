import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import groupNode01 from "../fixtures/any/group-node-01.json";
import type { FigmaNodeData } from "@compiler/types/index";

describe("노드 타입 지원 테스트", () => {
  describe("이미지 URL 처리", () => {
    test("imageUrls 맵이 없으면 placeholder가 유지된다", async () => {
      // imageUrls가 없는 데이터 복사본 생성
      const data = JSON.parse(
        JSON.stringify(groupNode01)
      ) as unknown as FigmaNodeData;
      delete data.imageUrls;

      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");

      // imageUrls가 없으면 placeholder 유지
      expect(code).toContain("<path-to-image>");
    });

    test("imageUrls 맵이 있으면 placeholder가 실제 URL로 교체된다", async () => {
      const data = JSON.parse(
        JSON.stringify(groupNode01)
      ) as unknown as FigmaNodeData;

      // imageUrls 맵 추가
      data.imageUrls = {
        "48dc7678f6ad4a7fd7b1dcb194118c5a0f6a2b1e":
          "https://example.com/image1.png",
        "4201c9377fef273eb9b49ee63d8c826211da1a6b":
          "https://example.com/image2.png",
      };

      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");

      // 해당 이미지에 대해서는 실제 URL로 교체됨
      expect(code).toContain("https://example.com/image1.png");
      expect(code).toContain("https://example.com/image2.png");
    });
  });

  describe("GROUP 노드", () => {
    test("GROUP 노드가 포함된 데이터가 컴파일되어야 한다", async () => {
      const data = groupNode01 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");
      
      expect(code).not.toBeNull();
      expect(code).toBeDefined();
    });

    test("GROUP 노드가 div로 렌더링되어야 한다", async () => {
      const data = groupNode01 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");
      
      // GROUP은 div로 렌더링됨
      expect(code).toContain("<div");
    });
  });

  describe("RECTANGLE 노드", () => {
    test("RECTANGLE 노드 (이미지 포함)가 렌더링되어야 한다", async () => {
      const data = groupNode01 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");
      
      // RECTANGLE은 container로 div로 렌더링됨
      expect(code).toBeDefined();
    });
  });

  describe("VECTOR 노드", () => {
    test("VECTOR 노드가 렌더링되어야 한다", async () => {
      const data = groupNode01 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");
      
      // VECTOR는 svg 또는 div로 렌더링됨
      expect(code).toBeDefined();
    });

    test("vectorSvgs가 없으면 빈 svg 태그로 렌더링된다", async () => {
      const data = JSON.parse(
        JSON.stringify(groupNode01)
      ) as unknown as FigmaNodeData;
      delete data.vectorSvgs;

      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");

      // vectorSvgs가 없으면 빈 svg 태그
      expect(code).toContain("<svg");
    });

    test("vectorSvgs가 있으면 SVG가 JSX로 변환되어 렌더링된다", async () => {
      const data = JSON.parse(
        JSON.stringify(groupNode01)
      ) as unknown as FigmaNodeData;

      // vectorSvgs 맵 추가 (VECTOR 노드 ID: 1313:58606)
      data.vectorSvgs = {
        "1313:58606": '<svg width="1800" height="1"><line x1="0" y1="0" x2="1800" y2="0" stroke="black"/></svg>',
      };

      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");

      // SVG가 JSX로 변환됨 (dangerouslySetInnerHTML 대신 네이티브 JSX)
      expect(code).toContain("<svg");
      expect(code).toContain("<line");
      // dangerouslySetInnerHTML은 더 이상 사용하지 않음
      expect(code).not.toContain("dangerouslySetInnerHTML");
    });

    test("SVG 속성이 JSX camelCase로 변환된다", async () => {
      const data = JSON.parse(
        JSON.stringify(groupNode01)
      ) as unknown as FigmaNodeData;

      // kebab-case 속성이 있는 SVG
      data.vectorSvgs = {
        "1313:58606": '<svg width="24" height="24"><path d="M0 0L10 10" stroke-width="2" stroke-linecap="round"/></svg>',
      };

      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");

      // stroke-width → strokeWidth 변환 확인
      expect(code).toContain("strokeWidth");
      expect(code).toContain("strokeLinecap");
      // 원본 kebab-case는 없어야 함
      expect(code).not.toContain("stroke-width");
      expect(code).not.toContain("stroke-linecap");
    });

    test("숫자 속성값이 JSX Expression으로 변환된다", async () => {
      const data = JSON.parse(
        JSON.stringify(groupNode01)
      ) as unknown as FigmaNodeData;

      data.vectorSvgs = {
        "1313:58606": '<svg width="100" height="50"><rect x="10" y="20" width="80" height="30"/></svg>',
      };

      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("TestComponent");

      // 숫자 속성은 JSX Expression으로: width={100}
      expect(code).toMatch(/width=\{100\}/);
      expect(code).toMatch(/height=\{50\}/);
    });
  });
});

