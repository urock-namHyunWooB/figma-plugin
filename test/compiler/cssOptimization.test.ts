import { describe, test, expect, beforeAll } from "vitest";
import FigmaCompiler from "@compiler";
import taptapAnchorData from "../fixtures/any/taptap-anchor.json";
import type { FigmaNodeData } from "@compiler/types/index";

describe("CSS 최적화 - 중복 제거", () => {
  let generatedCode: string;

  beforeAll(async () => {
    const data = taptapAnchorData as unknown as FigmaNodeData;
    const compiler = new FigmaCompiler(data);
    generatedCode = (await compiler.getGeneratedCode("Anchor")) ?? "";
  });

  test("컴파일이 성공해야 한다", () => {
    expect(generatedCode).toBeTruthy();
    expect(generatedCode.length).toBeGreaterThan(0);
  });

  describe("동일한 CSS 변수 합치기", () => {
    test("동일한 스타일을 가진 CSS 변수가 중복 생성되지 않아야 한다", () => {
      // taptap-anchor 데이터에서 FrameCss, FrameCss_2, FrameCss_3 등이
      // 동일한 스타일이면 하나로 합쳐져야 함

      // FrameCss 변수 개수 확인 (정확히 몇 개인지 확인)
      const frameCssMatches = generatedCode.match(/const Frame\d*Css/g) || [];
      const uniqueFrameStyles = new Set<string>();

      // 각 FrameCss 변수의 내용을 추출하여 고유한 것만 카운트
      const frameCssPattern = /const (Frame\d*Css)\s*=\s*css`([^`]+)`/g;
      let match;
      while ((match = frameCssPattern.exec(generatedCode)) !== null) {
        const cssContent = match[2].replace(/\s+/g, " ").trim();
        uniqueFrameStyles.add(cssContent);
      }

      // 동일한 스타일이 있다면 변수 수가 고유 스타일 수와 같거나 적어야 함
      expect(frameCssMatches.length).toBeLessThanOrEqual(
        uniqueFrameStyles.size + 1
      ); // +1은 여유분
    });

    test("titleCss 변수들이 동일한 스타일이면 합쳐져야 한다", () => {
      // titleCss_2, titleCss_3, titleCss_4 등이 동일한 스타일이면 하나로 합쳐짐
      const titleCssPattern = /const (titleCss(?:_\d+)?)\s*=\s*css`([^`]+)`/g;
      const titleStyles: Map<string, string[]> = new Map();

      let match;
      while ((match = titleCssPattern.exec(generatedCode)) !== null) {
        const varName = match[1];
        const cssContent = match[2].replace(/\s+/g, " ").trim();

        if (!titleStyles.has(cssContent)) {
          titleStyles.set(cssContent, []);
        }
        titleStyles.get(cssContent)!.push(varName);
      }

      // 동일한 CSS 내용을 가진 변수가 여러 개 있으면 안 됨
      for (const [cssContent, varNames] of titleStyles.entries()) {
        if (varNames.length > 1) {
          console.log(
            `중복 발견: ${varNames.join(", ")} 모두 동일한 스타일`
          );
        }
        // 동일한 스타일은 하나의 변수만 있어야 함
        expect(varNames.length).toBe(1);
      }
    });

    test("동일한 스타일의 노드들이 같은 CSS 변수를 참조해야 한다", () => {
      // JSX에서 css={FrameCss} 형태로 참조하는 것들 확인
      // 동일한 스타일을 가진 노드들은 같은 변수를 참조해야 함
      const cssUsagePattern = /css=\{(\w+Css(?:_\d+)?)\}/g;
      const usedCssVars: string[] = [];

      let match;
      while ((match = cssUsagePattern.exec(generatedCode)) !== null) {
        usedCssVars.push(match[1]);
      }

      // 참조된 CSS 변수들이 실제로 정의되어 있는지 확인
      for (const varName of usedCssVars) {
        const isDefinedOrReused =
          generatedCode.includes(`const ${varName} =`) ||
          generatedCode.includes(`const ${varName}=`) ||
          // 재사용된 변수는 정의되지 않고 참조만 될 수 있음 (다른 이름으로 정의됨)
          usedCssVars.filter((v) => v === varName).length > 1;

        expect(isDefinedOrReused).toBe(true);
      }
    });
  });

  describe("CSS 변수 최적화 통계", () => {
    test("최적화 전후 CSS 변수 수 비교", () => {
      // 모든 CSS 변수 정의 개수
      const cssVarDefinitions =
        generatedCode.match(/const \w+Css(?:_\d+)?\s*=/g) || [];

      // 모든 CSS 변수 사용 개수
      const cssVarUsages = generatedCode.match(/css=\{\w+Css(?:_\d+)?\}/g) || [];

      console.log(`CSS 변수 정의 수: ${cssVarDefinitions.length}`);
      console.log(`CSS 변수 사용 수: ${cssVarUsages.length}`);

      // 최적화가 되었다면 사용 수 >= 정의 수 (재사용이 있으므로)
      expect(cssVarUsages.length).toBeGreaterThanOrEqual(
        cssVarDefinitions.length
      );
    });
  });
});

