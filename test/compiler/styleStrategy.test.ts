import { describe, test, expect, beforeAll } from "vitest";
import FigmaCompiler from "@compiler";
import type { FigmaCompilerOptions } from "@compiler/FigmaCompiler";
import { getCachedCompile, warmupCache } from "../utils/shared-compile-cache";

// Fixtures - 샘플 테스트용 fixtures
import tadaButton from "../fixtures/button/tadaButton.json";
import urockChips from "../fixtures/chip/urock-chips.json";
import airtableSelectButton from "../fixtures/item-slot-likes/airtable-select-button.json";

// 스타일 전략 정의
const strategies: Array<{
  name: string;
  options: FigmaCompilerOptions;
  expectedStyleAttr: string;
  unexpectedImport: string;
}> = [
  {
    name: "Emotion",
    options: {},
    expectedStyleAttr: "css={",
    unexpectedImport: "", // Emotion은 기본이므로 제외할 import 없음
  },
  {
    name: "Tailwind",
    options: { styleStrategy: { type: "tailwind" } },
    expectedStyleAttr: "className={",
    unexpectedImport: "@emotion/react",
  },
];

// 샘플 fixtures (컴파일러 로직 테스트용 - 대표 3개)
// - tadaButton: Boolean prop (customDisabled), font-family, font-weight 포함
// - urockChips: Boolean prop 포함
// - airtableSelectButton: 다양한 스타일 포함
const sampleFixtures = [
  { name: "tadaButton", data: tadaButton },
  { name: "airtableSelectButton", data: airtableSelectButton },
  { name: "urockChips", data: urockChips },
];

// ===== 테스트 시작 전 샘플 fixture 캐시 워밍업 =====
beforeAll(async () => {
  await warmupCache(sampleFixtures);
});

describe("StyleStrategy 테스트 - Emotion/Tailwind 둘 다 실행", () => {
  // 각 전략별로 테스트 실행
  // NOTE: "컴파일 성공 테스트"는 allFixtures.test.ts에서 31개 fixture로 이미 커버되므로 제거됨
  describe.each(strategies)("$name 전략", (strategy) => {
    // 스타일 속성 테스트: 컴파일러 로직 검증이므로 샘플만 테스트
    describe("스타일 속성 테스트", () => {
      test.concurrent.each(sampleFixtures)(
        `$name이 ${strategy.expectedStyleAttr} 속성을 사용해야 한다`,
        async ({ name, data }) => {
          const cached = await getCachedCompile(name, data);
          const code =
            strategy.name === "Emotion" ? cached.emotion : cached.tailwind;

          expect(code).toContain(strategy.expectedStyleAttr);
        }
      );
    });

    // import 검증: 컴파일러 로직 검증이므로 샘플만 테스트
    if (strategy.unexpectedImport) {
      describe("import 검증 테스트", () => {
        test.concurrent.each(sampleFixtures)(
          `$name이 ${strategy.unexpectedImport}를 import하지 않아야 한다`,
          async ({ name, data }) => {
            const cached = await getCachedCompile(name, data);
            const code =
              strategy.name === "Emotion" ? cached.emotion : cached.tailwind;

            expect(code).not.toContain(strategy.unexpectedImport);
          }
        );
      });
    }
  });

  // Props 인터페이스 동일성: 컴파일러 로직 검증이므로 샘플만 테스트
  describe("Props 인터페이스 동일성 테스트", () => {
    test.concurrent.each(sampleFixtures)(
      "$name의 Props 인터페이스가 Emotion/Tailwind에서 동일해야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);

        // Props 인터페이스 추출
        const propsRegex = /export interface \w+Props[^{]*\{[\s\S]*?\}/;
        const emotionProps = cached.emotion?.match(propsRegex)?.[0];
        const tailwindProps = cached.tailwind?.match(propsRegex)?.[0];

        // 공백 정규화 후 비교 (들여쓰기 차이 무시)
        const normalize = (s?: string) => s?.replace(/\s+/g, " ").trim();
        expect(normalize(emotionProps)).toBe(normalize(tailwindProps));
      }
    );
  });

  // 구조 동일성: 컴파일러 로직 검증이므로 샘플만 테스트
  describe("컴포넌트 함수 구조 동일성 테스트", () => {
    test.concurrent.each(sampleFixtures)(
      "$name의 컴포넌트 구조가 Emotion/Tailwind에서 유사해야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);

        // 함수 선언 추출 (export default function ComponentName)
        const funcRegex = /export default function (\w+)/;
        const emotionFunc = cached.emotion?.match(funcRegex)?.[1];
        const tailwindFunc = cached.tailwind?.match(funcRegex)?.[1];

        // 같은 컴포넌트 이름이어야 함
        expect(emotionFunc).toBe(tailwindFunc);
      }
    );
  });
});

describe("Tailwind 전용 테스트", () => {
  test("기본값으로 인라인 cn 함수를 사용해야 한다", async () => {
    const cached = await getCachedCompile(
      "airtableSelectButton",
      airtableSelectButton
    );
    const code = cached.tailwind;

    expect(code).not.toBeNull();
    expect(code).toContain("const cn =");
    expect(code).not.toContain("import { cn }");
  });

  test("inlineCn: false일 때 커스텀 cn import 경로를 사용할 수 있어야 한다", async () => {
    // 이 테스트는 다른 옵션을 사용하므로 직접 컴파일
    const compiler = new FigmaCompiler(airtableSelectButton as any, {
      styleStrategy: {
        type: "tailwind",
        tailwind: {
          inlineCn: false,
          cnImportPath: "@/utils/cn",
        },
      },
    });
    const code = await compiler.compile();

    expect(code).not.toBeNull();
    expect(code).toContain('import { cn } from "@/utils/cn"');
    expect(code).not.toContain("const cn =");
  });

  test("flex 레이아웃이 Tailwind 클래스로 변환되어야 한다", async () => {
    const cached = await getCachedCompile(
      "airtableSelectButton",
      airtableSelectButton
    );
    const code = cached.tailwind;

    // flex 관련 클래스 확인
    expect(code).toMatch(/flex|flex-row|flex-col/);
  });
});

describe("Tailwind 런타임 실행 검증 테스트", () => {
  /**
   * Sucrase로 코드 변환 후 실행 가능한지 확인
   */
  async function canExecuteCode(code: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Sucrase import
      const { transform } = await import("sucrase");

      // import 문 제거
      let cleanedCode = code.replace(
        /import\s+.*?from\s+['"][^'"]+['"];?\s*/g,
        ""
      );

      // export 문 변환
      cleanedCode = cleanedCode.replace(
        /export\s+default\s+function\s+(\w+)/g,
        "function $1"
      );
      cleanedCode = cleanedCode.replace(
        /export\s+interface\s+(\w+)/g,
        "interface $1"
      );
      cleanedCode = cleanedCode.replace(/export\s+type\s+(\w+)/g, "type $1");
      cleanedCode = cleanedCode.replace(/export\s+const\s+(\w+)/g, "const $1");

      // Sucrase 변환
      const result = transform(cleanedCode, {
        transforms: ["typescript", "jsx"],
        jsxRuntime: "classic",
      });

      const transformed = result.code;

      if (!transformed) {
        return { success: false, error: "Sucrase transformation failed" };
      }

      // 생성된 코드에 인라인 cn 함수가 있는지 확인
      const hasInlineCn =
        transformed?.includes("var cn") || transformed?.includes("const cn");

      // eval 시도 (React 등 필요한 변수 제공)
      const testCode = `
        'use strict';
        var React = { createElement: function() { return null; } };
        var useState = function() { return [null, function(){}]; };
        var css = function() { return ''; };
        var cx = function() { return ''; };
        ${hasInlineCn ? "" : "var cn = function() { return arguments.length ? Array.from(arguments).filter(Boolean).join(' ') : ''; };"}
        
        ${transformed}
        
        true
      `;

      eval(testCode);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 런타임 실행 검증: allFixtures.test.ts에서 렌더링으로 이미 커버되므로 샘플만 테스트
  describe("중복 변수 선언으로 인한 런타임 에러 방지", () => {
    test.concurrent.each(sampleFixtures)(
      "$name Tailwind 코드가 런타임에서 실행 가능해야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        expect(code).not.toBeNull();

        const result = await canExecuteCode(code!);

        if (!result.success) {
          console.log(`=== ${name} Runtime Error ===`);
          console.log(result.error);
          console.log("=== Generated Code ===");
          console.log(code?.substring(0, 500));
        }

        expect(result.success).toBe(true);
      }
    );

    test.concurrent.each(sampleFixtures)(
      "$name Emotion 코드가 런타임에서 실행 가능해야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.emotion;

        expect(code).not.toBeNull();

        const result = await canExecuteCode(code!);

        if (!result.success) {
          console.log(`=== ${name} Emotion Runtime Error ===`);
          console.log(result.error);
        }

        expect(result.success).toBe(true);
      }
    );
  });

  test("인라인 cn 함수가 var cn과 충돌하지 않아야 한다", async () => {
    const cached = await getCachedCompile(
      sampleFixtures[0].name,
      sampleFixtures[0].data
    );
    const code = cached.tailwind;

    expect(code).not.toBeNull();

    // const cn = ... 형태로 선언되어야 함
    expect(code).toContain("const cn =");

    // 런타임 실행 가능해야 함
    const result = await canExecuteCode(code!);

    if (!result.success) {
      console.log("=== cn 충돌 테스트 실패 ===");
      console.log("Error:", result.error);
      console.log("=== Generated Code (first 800 chars) ===");
      console.log(code?.substring(0, 800));
    }

    expect(result.success).toBe(true);
  });
});

describe("Tailwind 코드 품질 검증 테스트", () => {
  // NOTE: "중복 변수 선언 검증"은 "런타임 실행 검증"에서 이미 커버되므로 제거됨
  // (중복 변수가 있으면 eval에서 실패함)

  // 클래스 맵 유효성: 컴파일러 로직 검증이므로 샘플만 테스트
  describe("Tailwind 클래스 맵 유효성 검증", () => {
    test.concurrent.each(sampleFixtures)(
      "$name의 Tailwind 클래스 맵이 올바르게 머지되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        expect(code).not.toBeNull();

        // const xxxClasses = { ... } 형태의 선언 확인
        const classMapRegex = /const\s+(\w+Classes)\s*=\s*\{/g;
        const classMapNames: string[] = [];

        let match;
        while ((match = classMapRegex.exec(code!)) !== null) {
          classMapNames.push(match[1]);
        }

        // 중복 클래스 맵 이름이 없어야 함
        const uniqueNames = [...new Set(classMapNames)];
        expect(classMapNames.length).toBe(uniqueNames.length);
      }
    );
  });

  // cn 함수 검증: 컴파일러 로직 검증이므로 샘플만 테스트
  describe("cn 함수 검증", () => {
    test.concurrent.each(sampleFixtures)(
      "$name Tailwind 코드가 인라인 cn 함수를 포함해야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        expect(code).not.toBeNull();
        // 인라인 cn 함수가 생성되어야 함
        expect(code).toContain("const cn =");
        expect(code).toContain(".filter(Boolean).join");
        // import가 없어야 함 (인라인이므로)
        expect(code).not.toContain("import { cn }");
      }
    );

    test("inlineCn: false일 때 cn import를 사용해야 한다", async () => {
      // 이 테스트는 다른 옵션을 사용하므로 직접 컴파일
      const compiler = new FigmaCompiler(sampleFixtures[0].data as any, {
        styleStrategy: {
          type: "tailwind",
          tailwind: {
            inlineCn: false,
            cnImportPath: "@/utils/cn",
          },
        },
      });
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code).toContain('import { cn } from "@/utils/cn"');
      expect(code).not.toContain("const cn =");
    });
  });

  describe("Boolean prop 처리", () => {
    test("Boolean prop은 ternary로 클래스맵에 접근해야 한다", async () => {
      // Boolean prop (customDisabled 등)이 있는 fixture 찾기 (sampleFixtures에 Boolean prop 있음)
      for (const { name, data } of sampleFixtures) {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) continue;

        // Boolean prop이 있는 클래스맵 찾기 (True/False 키가 있으면 boolean prop)
        const hasBooleanClassMap =
          /\w+Classes\s*=\s*\{[^}]*"True":[^}]*"False":/s.test(code);

        if (hasBooleanClassMap) {
          // Boolean prop은 ternary로 접근해야 함: prop ? "True" : "False"
          // 잘못된 패턴: Classes[customDisabled] (boolean을 직접 key로 사용)
          // 올바른 패턴: Classes[customDisabled ? "True" : "False"]
          const wrongPattern =
            /\w+Classes\[(customDisabled|disabled|selected|checked)\]/;
          const correctPattern =
            /\w+Classes\[\w+\s*\?\s*"True"\s*:\s*"False"\]/;

          expect(code).not.toMatch(wrongPattern);
          expect(code).toMatch(correctPattern);
        }
      }
    });
  });

  describe("CSS 변수 언더스코어 이스케이프", () => {
    test("Tailwind arbitrary value에서 언더스코어가 올바르게 이스케이프되어야 한다", async () => {
      // TailwindStrategy의 _escapeArbitraryValue 로직이 올바르게 동작하는지 확인
      for (const { name, data } of sampleFixtures) {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) continue;

        // arbitrary value 내에서 _가 이스케이프 없이 바로 다음에 공백 대체로 사용되면 안 됨
        // 올바른 처리: 원래 _ → \\_, 공백 → _
        // 잘못된 처리: 원래 _와 공백 대체 _가 구분 안 됨

        // 잘못된 패턴: Tailwind에서 공백이 들어가면 안 되는 곳에 공백 처리된 결과
        // (실제 CSS 변수 이름에서 공백이 생기면 문제)
        const brokenCssVar = /var\(--[^,)]*\s[^,)]*,/;
        expect(code).not.toMatch(brokenCssVar);
      }
    });
  });

  describe("Arbitrary value 유효성", () => {
    test("Tailwind arbitrary value에 CSS 주석이 없어야 한다", async () => {
      for (const { name, data } of sampleFixtures) {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) continue;

        // CSS 주석이 arbitrary value 안에 있으면 안 됨
        // 잘못된 패턴: leading-[18px /* 138.462% */]
        const cssCommentInArbitrary = /\[[^\]]*\/\*[^\]]*\*\/[^\]]*\]/;
        expect(code).not.toMatch(cssCommentInArbitrary);
      }
    });

    test("font-family가 올바른 arbitrary 문법으로 생성되어야 한다", async () => {
      for (const { name, data } of sampleFixtures) {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) continue;

        // font-family가 있는 경우
        if (code.includes("font-family") || code.includes("[font-family:")) {
          // 올바른 패턴: [font-family:...] 형태
          // 잘못된 패턴: font-[Pretendard] (이건 font-size용)
          const wrongFontFamily = /\bfont-\[[A-Za-z]/; // font-[로 시작하고 바로 알파벳 (font-size 문법)
          const correctFontFamily = /\[font-family:/;

          // font-family가 있으면 올바른 형태여야 함
          if (correctFontFamily.test(code) || wrongFontFamily.test(code)) {
            expect(code).not.toMatch(wrongFontFamily);
          }
        }
      }
    });

    test("font-weight가 올바른 arbitrary 문법으로 생성되어야 한다", async () => {
      for (const { name, data } of sampleFixtures) {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) continue;

        // 숫자 font-weight가 있는 경우 확인
        if (/font-weight:\s*\d+/.test(code) || /\[font-weight:/.test(code)) {
          // 올바른 패턴: [font-weight:500] 또는 font-medium 등
          // 잘못된 패턴: font-[500] (이건 font-size용)
          const wrongFontWeight = /\bfont-\[\d+\]/; // font-[숫자] (font-size 문법)
          expect(code).not.toMatch(wrongFontWeight);
        }
      }
    });
  });
});
