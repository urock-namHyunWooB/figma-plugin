import { describe, test, expect, beforeAll } from "vitest";
import { FigmaCompiler } from "@compiler/FigmaCompiler";
import anySpec from "../fixtures/any/any-01.json";

// ===== 컴파일 결과 캐시 =====
let cachedEmotionCode: string | null = null;
let cachedTailwindCode: string | null = null;

beforeAll(async () => {
  // 테스트 시작 전 한 번만 컴파일
  const [emotionCode, tailwindCode] = await Promise.all([
    new FigmaCompiler(anySpec as any, {
      styleStrategy: { type: "emotion" },
    }).compile(),
    new FigmaCompiler(anySpec as any, {
      styleStrategy: { type: "tailwind" },
    }).compile(),
  ]);

  cachedEmotionCode = emotionCode;
  cachedTailwindCode = tailwindCode;
});

describe("Emotion vs Tailwind 비교", () => {
  test("CSS 변수 background가 background-color로 변환되는지 확인", () => {
    const tailwindCode = cachedTailwindCode;

    // CSS 변수를 포함한 background가 [background-color:var(...)]로 변환되어야 함
    // bg-[var(...)]는 twind에서 background-image로 해석되므로 사용하면 안됨
    const softYellowMatch = tailwindCode?.includes(
      "[background-color:var(--Color-soft-yellow,_#FFF4CE)]"
    );
    const softRedMatch = tailwindCode?.includes(
      "[background-color:var(--Color-soft-red,_#FFEAEA)]"
    );
    const bgWhiteMatch = tailwindCode?.includes(
      "[background-color:var(--Color-bg-00,_#FFF)]"
    );

    // bg-[var(...)] 형태가 없어야 함 (background-image로 잘못 해석됨)
    const wrongBgVarPattern = /bg-\[var\(--Color-/;
    const hasWrongPattern = wrongBgVarPattern.test(tailwindCode || "");

    expect(softYellowMatch).toBe(true);
    expect(softRedMatch).toBe(true);
    expect(bgWhiteMatch).toBe(true);
    expect(hasWrongPattern).toBe(false);
  });

  test("모든 background 스타일 비교", () => {
    const emotionCode = cachedEmotionCode;
    const tailwindCode = cachedTailwindCode;

    console.log("\n=== Emotion - 모든 background 스타일 ===");
    const emotionBgMatches = emotionCode?.match(/background:[^;`]+/g) || [];
    emotionBgMatches.forEach((m) => console.log(m));

    console.log("\n=== Tailwind - 모든 bg- 클래스 ===");
    const tailwindBgMatches = tailwindCode?.match(/bg-\[[^\]]+\]/g) || [];
    const unique = [...new Set(tailwindBgMatches)];
    unique.forEach((m) => console.log(m));

    expect(emotionCode).toBeTruthy();
    expect(tailwindCode).toBeTruthy();
  });

  test("Imgwatch 이미지 배경 스타일 비교", () => {
    const emotionCode = cachedEmotionCode;
    const tailwindCode = cachedTailwindCode;

    console.log("\n=== Emotion - Imgwatch CSS ===");
    const emotionImgwatch = emotionCode?.match(
      /const ImgwatchCss[\s\S]*?`;/
    )?.[0];
    console.log(emotionImgwatch || "Not found");

    console.log("\n=== Tailwind - Imgwatch className ===");
    // Imgwatch 함수 전체를 찾아서 className 확인
    const tailwindImgwatchFunc = tailwindCode?.match(
      /function Imgwatch[\s\S]*?return[\s\S]*?<div[\s\S]*?className=\{[\s\S]*?\}/
    )?.[0];
    console.log(tailwindImgwatchFunc || "Not found");

    expect(emotionCode).toBeTruthy();
    expect(tailwindCode).toBeTruthy();
  });

  test("Row 레이아웃 스타일 비교", () => {
    const emotionCode = cachedEmotionCode;
    const tailwindCode = cachedTailwindCode;

    console.log("\n=== Emotion - Row CSS ===");
    const emotionRow = emotionCode?.match(/const RowCss[\s\S]*?`;/)?.[0];
    console.log(emotionRow || "Not found");

    console.log("\n=== Tailwind - Row className ===");
    const tailwindRowMatch = tailwindCode?.match(
      /export default function Row[\s\S]*?className=\{([^}]+)\}/
    );
    console.log(tailwindRowMatch?.[1] || "Not found");

    expect(emotionCode).toBeTruthy();
    expect(tailwindCode).toBeTruthy();
  });
});
