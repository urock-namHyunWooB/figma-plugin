/**
 * NewPipeline 테스트
 *
 * 새 파이프라인 (DataPreparer → TreeBuilder → ReactEmitter)과
 * 레거시 파이프라인의 출력을 비교합니다.
 */

import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@compiler";
import tadaButtonMockData from "../fixtures/button/tadaButton.json";
import taptapButtonSampleMockData from "../fixtures/button/taptapButton_sample.json";

describe("NewPipeline 테스트", () => {
  describe("새 파이프라인 기본 동작", () => {
    it("useNewPipeline: true로 코드 생성 가능", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { useNewPipeline: true }
      );

      const code = await generator.compile();

      expect(code).toBeTruthy();
      expect(code).toContain("import");
      expect(code).toContain("function");
      // Emotion CSS-in-JS 스타일 포함 확인
      expect(code).toContain("css");
    });

    it("컴포넌트 이름 지정 가능", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { useNewPipeline: true }
      );

      const code = await generator.compile("CustomButton");

      expect(code).toContain("CustomButton");
    });

    it("debug 모드 지원", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { useNewPipeline: true, debug: true }
      );

      const code = await generator.compile();

      expect(code).toBeTruthy();
      // debug 모드에서는 data-figma-id 속성이 추가됨
      expect(code).toContain("data-figma-id");
    });
  });

  describe("레거시 vs 새 파이프라인 비교", () => {
    it("두 파이프라인 모두 코드 생성 성공", async () => {
      const legacyGen = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { useNewPipeline: false }
      );
      const newGen = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { useNewPipeline: true }
      );

      const legacyCode = await legacyGen.compile();
      const newCode = await newGen.compile();

      expect(legacyCode).toBeTruthy();
      expect(newCode).toBeTruthy();

      // 둘 다 React 컴포넌트 구조를 포함
      expect(legacyCode).toContain("import React from");
      expect(newCode).toContain("import React from");
    });

    it("tadaButton도 새 파이프라인에서 처리 가능", async () => {
      const generator = new FigmaCodeGenerator(tadaButtonMockData as any, {
        useNewPipeline: true,
      });

      const code = await generator.compile();

      expect(code).toBeTruthy();
      expect(code).toContain("css");
    });
  });

  describe("Props 정의", () => {
    it("새 파이프라인에서 props 정의 반환", () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { useNewPipeline: true }
      );

      const props = generator.getPropsDefinition();

      expect(Array.isArray(props)).toBe(true);
    });
  });
});
