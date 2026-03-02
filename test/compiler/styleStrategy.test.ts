import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaCodeGeneratorOptions } from "@code-generator2";
import { getCachedCompile, warmupCache } from "../utils/shared-compile-cache";

// Fixtures - 샘플 테스트용 fixtures
import tadaButton from "../fixtures/button/tadaButton.json";
import urockChips from "../fixtures/chip/urock-chips.json";
import airtableSelectButton from "../fixtures/item-slot-likes/airtable-select-button.json";

// 스타일 전략 정의
const strategies: Array<{
  name: string;
  options: FigmaCodeGeneratorOptions;
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
  test("cva import가 포함되어야 한다", async () => {
    const cached = await getCachedCompile(
      "airtableSelectButton",
      airtableSelectButton
    );
    const code = cached.tailwind;

    expect(code).not.toBeNull();
    expect(code).toContain('import { cva } from "class-variance-authority"');
    // cn 함수는 더 이상 사용하지 않음
    expect(code).not.toContain("const cn =");
    expect(code).not.toContain("import { cn }");
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
      // export default ComponentName; 형태 제거
      cleanedCode = cleanedCode.replace(/export\s+default\s+\w+;?\s*/g, "");
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

      // eval 시도 (React 등 필요한 변수 제공)
      const testCode = `
        'use strict';
        var React = { createElement: function() { return null; } };
        var useState = function() { return [null, function(){}]; };
        var css = function() { return ''; };
        var cx = function() { return ''; };
        var cva = function(base, config) {
          return function(props) {
            var classes = [base];
            if (config && config.variants && props) {
              for (var key in config.variants) {
                var propVal = props[key];
                if (propVal != null) {
                  var cls = config.variants[key][String(propVal)];
                  if (cls) classes.push(cls);
                }
              }
            }
            return classes.filter(Boolean).join(" ");
          };
        };

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

  test("cva 함수가 런타임에서 올바르게 작동해야 한다", async () => {
    const cached = await getCachedCompile(
      sampleFixtures[0].name,
      sampleFixtures[0].data
    );
    const code = cached.tailwind;

    expect(code).not.toBeNull();

    // cva import가 있어야 함
    expect(code).toContain('import { cva } from "class-variance-authority"');

    // 런타임 실행 가능해야 함
    const result = await canExecuteCode(code!);

    if (!result.success) {
      console.log("=== cva 런타임 테스트 실패 ===");
      console.log("Error:", result.error);
      console.log("=== Generated Code (first 800 chars) ===");
      console.log(code?.substring(0, 800));
    }

    expect(result.success).toBe(true);
  });
});

describe("TailwindStrategy CSS-to-Tailwind 변환 테스트", () => {
  describe("정확한 값 매핑", () => {
    test.concurrent.each(sampleFixtures)(
      "$name에서 display: flex가 'flex' 클래스로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // flex 레이아웃을 가진 컴포넌트는 'flex' 클래스가 있어야 함
        if (code.includes("display") || code.includes("flex-direction")) {
          expect(code).toMatch(/\bflex\b/);
        }
      }
    );

    test.concurrent.each(sampleFixtures)(
      "$name에서 position 값이 Tailwind 클래스로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // 잘못된 패턴: position-[absolute] (arbitrary value 사용)
        // 올바른 패턴: absolute, relative, fixed 등
        expect(code).not.toMatch(/position-\[/);
      }
    );

    test.concurrent.each(sampleFixtures)(
      "$name에서 justify-content가 justify- 클래스로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // 잘못된 패턴: [justify-content:center]
        // 올바른 패턴: justify-center, justify-start 등
        expect(code).not.toMatch(/\[justify-content:/);
      }
    );
  });

  describe("Arbitrary value 변환", () => {
    test.concurrent.each(sampleFixtures)(
      "$name에서 픽셀 값이 arbitrary value로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // 픽셀 값은 w-[123px], h-[456px] 형태로 변환되어야 함
        // 잘못된 패턴: width-[123px] (prefix 오류)
        expect(code).not.toMatch(/\bwidth-\[/);
        expect(code).not.toMatch(/\bheight-\[/);

        // w-[...px], h-[...px]가 있으면 올바른 형태인지 확인
        // (w-[123px] ✓, w-[abcpx] ✗)
        const whMatches = code.match(/[wh]-\[[^\]]*px\]/g) || [];
        for (const m of whMatches) {
          expect(m).toMatch(/[wh]-\[\d+(\.\d+)?px\]/);
        }
      }
    );

    test.concurrent.each(sampleFixtures)(
      "$name에서 100% 값이 w-full/h-full로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // 잘못된 패턴: w-[100%], h-[100%]
        expect(code).not.toMatch(/w-\[100%\]/);
        expect(code).not.toMatch(/h-\[100%\]/);
      }
    );
  });

  describe("rgba/hsla 색상 처리", () => {
    test.concurrent.each(sampleFixtures)(
      "$name에서 rgba 값이 잘리지 않아야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // 잘못된 패턴: bg-[rgba(0] (잘린 rgba)
        expect(code).not.toMatch(/bg-\[rgba\(\d+\]/);

        // rgba가 있다면 완전한 형태여야 함: bg-[rgba(0,_0,_0,_0.38)]
        const rgbaMatches = code.match(/bg-\[rgba\([^\]]+\]/g);
        if (rgbaMatches) {
          for (const match of rgbaMatches) {
            // 4개의 값이 있어야 함 (r, g, b, a)
            const commaCount = (match.match(/,/g) || []).length;
            expect(commaCount).toBe(3);
          }
        }
      }
    );

    test.concurrent.each(sampleFixtures)(
      "$name에서 CSS 변수가 arbitrary property로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // CSS 변수가 있는 경우 [background-color:var(...)] 형태로 변환되어야 함
        if (code.includes("var(--")) {
          // background-color의 var()는 arbitrary property로 처리
          expect(code).toMatch(/\[(background-color|color|fill):/);
        }
      }
    );
  });

  describe("특수 속성 처리", () => {
    test.concurrent.each(sampleFixtures)(
      "$name에서 border-radius가 rounded- 클래스로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // border-radius는 rounded-[...] 형태로 변환되어야 함
        if (code.includes("radius") || code.includes("rounded")) {
          expect(code).toMatch(/rounded-/);
          expect(code).not.toMatch(/\[border-radius:/);
        }
      }
    );

    test.concurrent.each(sampleFixtures)(
      "$name에서 gap이 gap- 클래스로 변환되어야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) return;

        // gap은 gap-[...] 형태로 변환되어야 함
        if (code.includes("gap")) {
          expect(code).toMatch(/gap-/);
          expect(code).not.toMatch(/\[gap:/);
        }
      }
    );
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

  // cva import 검증: 컴파일러 로직 검증이므로 샘플만 테스트
  describe("cva import 검증", () => {
    test.concurrent.each(sampleFixtures)(
      "$name Tailwind 코드가 cva import를 포함해야 한다",
      async ({ name, data }) => {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        expect(code).not.toBeNull();
        // cva import가 있어야 함
        expect(code).toContain('import { cva } from "class-variance-authority"');
        // cn 함수는 더 이상 사용하지 않음
        expect(code).not.toContain("const cn =");
        expect(code).not.toContain("import { cn }");
      }
    );
  });

  describe("Boolean prop 처리", () => {
    test("Boolean prop이 cva variants에 포함되어야 한다", async () => {
      // Boolean prop (customDisabled 등)이 있는 fixture 찾기
      for (const { name, data } of sampleFixtures) {
        const cached = await getCachedCompile(name, data);
        const code = cached.tailwind;

        if (!code) continue;

        // cva variants에 boolean 값("True"/"False" 또는 "true"/"false")이 있으면
        // cva() 함수 호출로 처리됨
        const hasBooleanVariant =
          /cva\([^)]*\{[\s\S]*?(True|true|False|false)\s*:/m.test(code);

        if (hasBooleanVariant) {
          // cva 패턴이 올바르게 생성되어야 함
          expect(code).toContain("cva(");
          expect(code).toContain("variants:");
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
