import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator";
import PrimaryFixture from "../fixtures/failing/Primary.json";
import * as fs from "fs";
import * as path from "path";

describe("Primary Button State Pseudo-class 테스트", () => {
  test("State별 배경색이 CSS pseudo-class로 생성되어야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();
    expect(code!.length).toBeGreaterThan(0);

    // 생성된 코드를 파일에 저장 (디버깅용)
    const outputPath = path.join(__dirname, "..", "fixtures", "failing", "Primary.generated.tsx");
    fs.writeFileSync(outputPath, code!);

    // pseudo-class 확인
    // :hover, :active, :disabled 가 생성되어야 함
    const hasHover = code!.includes(":hover");
    const hasActive = code!.includes(":active");
    const hasDisabled = code!.includes(":disabled");

    // 최소한 하나의 pseudo-class가 있어야 함
    expect(hasHover || hasActive || hasDisabled).toBe(true);
  });

  test("background가 State-specific으로 분류되어 pseudo-class에 포함되어야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // 생성된 코드에 :hover { ... background ... } 패턴이 있는지 확인
    // 또는 &:hover 패턴
    const hoverBackgroundPattern = /&:hover\s*\{[^}]*background/;
    const activeBackgroundPattern = /&:active\s*\{[^}]*background/;
    const disabledBackgroundPattern = /&:disabled\s*\{[^}]*background/;

    const hasHoverBackground = hoverBackgroundPattern.test(code!);
    const hasActiveBackground = activeBackgroundPattern.test(code!);
    const hasDisabledBackground = disabledBackgroundPattern.test(code!);

    // 최소한 하나의 State에서 background가 pseudo-class로 분류되어야 함
    expect(hasHoverBackground || hasActiveBackground || hasDisabledBackground).toBe(true);
  });

  test("state prop이 함수 인자로 전달되지 않아야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // PrimaryCss(size, state) 패턴이 없어야 함
    // PrimaryCss(size) 또는 PrimaryCss만 있어야 함
    const hasSizeAndState = /PrimaryCss\s*\(\s*size\s*,\s*state\s*\)/.test(code!);
    expect(hasSizeAndState).toBe(false);

    // StateStyles Record가 없어야 함
    const hasStateStyles = /PrimaryCssStateStyles/.test(code!);
    expect(hasStateStyles).toBe(false);
  });
});
