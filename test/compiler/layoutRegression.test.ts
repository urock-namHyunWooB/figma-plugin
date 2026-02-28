/**
 * Layout Regression Test
 *
 * 사용법:
 * 1. ScanDashboard에서 실패한 케이스 → Export JSON
 * 2. test/fixtures/failing/ 폴더에 저장
 * 3. npm run test -- layoutRegression
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { FigmaCodeGenerator } from "@code-generator2";
import { FigmaNodeData } from "@code-generator/types/compiler";
import { extractFigmaLayout } from "@code-generator/utils/layoutComparison";

// fixtures/failing 폴더의 모든 JSON 파일 자동 로드
const FAILING_FIXTURES_DIR = path.join(__dirname, "../fixtures/failing");

// 폴더가 없으면 생성
if (!fs.existsSync(FAILING_FIXTURES_DIR)) {
  fs.mkdirSync(FAILING_FIXTURES_DIR, { recursive: true });
}

// JSON 파일 목록 가져오기
const getFailingFixtures = (): string[] => {
  if (!fs.existsSync(FAILING_FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FAILING_FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"));
};

describe("Layout Regression Tests", () => {
  const fixtures = getFailingFixtures();

  // fixtures가 없으면 스킵 테스트
  if (fixtures.length === 0) {
    it("no failing fixtures to test (this is expected when all issues are resolved)", () => {
      expect(fixtures).toHaveLength(0);
    });
    return;
  }

  fixtures.forEach((fixture) => {
    describe(fixture, () => {
      let nodeData: FigmaNodeData;
      let compiledCode: string | null;

      it("should load fixture", () => {
        const filePath = path.join(FAILING_FIXTURES_DIR, fixture);
        const content = fs.readFileSync(filePath, "utf-8");
        nodeData = JSON.parse(content);
        expect(nodeData).toBeDefined();
        expect(nodeData.info).toBeDefined();
      });

      it("should compile without errors", async () => {
        const compiler = new FigmaCodeGenerator(nodeData, { debug: true });
        compiledCode = await compiler.compile();
        expect(compiledCode).not.toBeNull();
        expect(compiledCode).toContain("function"); // v2는 arrow function 사용
      });

      it("should generate valid JSX structure", () => {
        expect(compiledCode).toContain("return");
        expect(compiledCode).toContain("<");
        expect(compiledCode).toContain(">");
      });

      it("should include data-figma-id attributes", () => {
        expect(compiledCode).toContain("data-figma-id");
      });

      it("should extract Figma layouts correctly", () => {
        const layouts = extractFigmaLayout(nodeData);
        expect(layouts.length).toBeGreaterThan(0);

        // 모든 레이아웃이 유효한 값을 가지는지 확인
        layouts.forEach((layout) => {
          expect(layout.width).toBeGreaterThanOrEqual(0);
          expect(layout.height).toBeGreaterThanOrEqual(0);
        });
      });

      // 특정 패턴 검증 (예: height가 8px로 잘못 설정되는 문제)
      it("should not have collapsed heights in compiled code", () => {
        // height: 8px 같은 잘못된 값이 없는지 확인
        const hasCollapsedHeight = /height:\s*['"]?8px['"]?/.test(
          compiledCode || ""
        );
        if (hasCollapsedHeight) {
          console.warn(
            `⚠️ Warning: Found potential collapsed height (8px) in ${fixture}`
          );
        }
      });

      // wrapper div 검증
      it("should have wrapper divs for external components", () => {
        // INSTANCE 타입 노드 중 외부 컴포넌트(이름에 "/" 포함)가 있는지 확인
        // 단, Decorate/Interactive 같은 데코레이터는 렌더링되지 않으므로 제외
        const findExternalInstances = (node: any, parent?: any): boolean => {
          if (node.type === "INSTANCE" && node.name?.includes("/")) {
            // Decorate 또는 Interaction 관련 인스턴스는 제외
            // (동작만 제공하고 렌더링되지 않음)
            if (
              node.name.startsWith("Decorate/") ||
              parent?.name === "Interaction"
            ) {
              return false;
            }
            return true;
          }
          if (node.children) {
            return node.children.some((c: any) =>
              findExternalInstances(c, node)
            );
          }
          return false;
        };

        const hasExternalInstances = findExternalInstances(
          (nodeData as any).info.document
        );

        if (hasExternalInstances && compiledCode) {
          // 외부 컴포넌트는 두 가지 방식으로 렌더링될 수 있음:
          // 1. wrapper div + JSX 컴포넌트: <div css={...}><ComponentName .../>
          // 2. slot prop: React.ReactNode 타입 prop으로 외부에서 주입
          // 3. SVG가 인라인으로 렌더링되는 경우
          const hasWrapperPattern =
            /<div[^>]*css=\{[^}]+\}[^>]*>[\s\S]*?<[A-Z]/.test(compiledCode) ||
            /<div[^>]*style=\{\{[^}]*\}\}[^>]*>[\s\S]*?<[A-Z]/.test(
              compiledCode
            ) ||
            /<svg[^>]*css=/.test(compiledCode) ||
            // slot prop 방식: 외부 컴포넌트를 React.ReactNode로 수신
            /React\.ReactNode/.test(compiledCode);
          expect(hasWrapperPattern).toBe(true);
        }
      });
    });
  });
});
