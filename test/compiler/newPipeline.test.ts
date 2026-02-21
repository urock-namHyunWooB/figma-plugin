/**
 * 새 파이프라인 테스트
 *
 * 새 파이프라인 (DataPreparer → TreeBuilder → ReactEmitter) 동작 검증
 */

import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import tadaButtonMockData from "../fixtures/button/tadaButton.json";
import taptapButtonSampleMockData from "../fixtures/button/taptapButton_sample.json";

describe("새 파이프라인 테스트", () => {
  describe("기본 동작", () => {
    it("코드 생성 가능", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any
      );

      const code = await generator.compile();

      expect(code).toBeTruthy();
      expect(code).toContain("import");
      expect(code).toContain("React.FC"); // v2는 arrow function 사용
      // Emotion CSS-in-JS 스타일 포함 확인
      expect(code).toContain("css");
    });

    it("컴포넌트 이름 반환", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any
      );

      const code = await generator.compile();
      const componentName = generator.getComponentName();

      // 컴포넌트 이름이 코드에 포함되어야 함
      expect(code).toContain(componentName);
      expect(componentName).toBeTruthy();
    });

    it("debug 모드 지원", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any,
        { debug: true }
      );

      const code = await generator.compile();

      expect(code).toBeTruthy();
      // debug 모드에서는 data-figma-id 속성이 추가됨
      expect(code).toContain("data-figma-id");
    });
  });

  describe("다양한 fixture 처리", () => {
    it("taptapButton 처리 가능", async () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any
      );

      const code = await generator.compile();

      expect(code).toBeTruthy();
      expect(code).toContain("import React from");
    });

    it("tadaButton 처리 가능", async () => {
      const generator = new FigmaCodeGenerator(tadaButtonMockData as any);

      const code = await generator.compile();

      expect(code).toBeTruthy();
      expect(code).toContain("css");
    });
  });

  describe("Props 정의", () => {
    it("props 정의 반환", () => {
      const generator = new FigmaCodeGenerator(
        taptapButtonSampleMockData as any
      );

      const props = generator.getPropsDefinition();

      expect(Array.isArray(props)).toBe(true);
    });
  });
});
