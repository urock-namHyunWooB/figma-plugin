import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator";
import PrimaryFixture from "../fixtures/any/Primary.json";
import * as fs from "fs";
import * as path from "path";

describe("Primary Button State Pseudo-class 테스트", () => {
  test("State별 배경색이 CSS pseudo-class로 생성되어야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();
    expect(code!.length).toBeGreaterThan(0);

    // 생성된 코드 저장 (디버깅용)
    const outputPath = path.join(
      __dirname,
      "..",
      "fixtures",
      "failing",
      "Primary.generated.tsx"
    );
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
    expect(
      hasHoverBackground || hasActiveBackground || hasDisabledBackground
    ).toBe(true);
  });

  test("state prop이 함수 인자로 전달되지 않아야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // PrimaryCss(size, state) 패턴이 없어야 함
    // PrimaryCss(size) 또는 PrimaryCss만 있어야 함
    const hasSizeAndState = /PrimaryCss\s*\(\s*size\s*,\s*state\s*\)/.test(
      code!
    );
    expect(hasSizeAndState).toBe(false);

    // StateStyles Record가 없어야 함
    const hasStateStyles = /PrimaryCssStateStyles/.test(code!);
    expect(hasStateStyles).toBe(false);
  });

  test("flex-direction: row가 적용되어야 함 (HORIZONTAL FRAME 상속)", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // flex-direction: row가 있어야 함
    const hasFlexRow = /flex-direction:\s*row/.test(code!);
    expect(hasFlexRow).toBe(true);

    // flex-direction: column이 루트에 없어야 함 (Primary 버튼은 가로 배치)
    // PrimaryCss에 column이 있으면 안 됨
    const primaryCssMatch = code!.match(/const PrimaryCss[^;]*css`([^`]*)`/s);
    if (primaryCssMatch) {
      const primaryCssContent = primaryCssMatch[1];
      const hasColumnInPrimary = /flex-direction:\s*column/.test(
        primaryCssContent
      );
      expect(hasColumnInPrimary).toBe(false);
    }
  });

  test("LINE height: 0 노드는 display: none이어야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // MinWidth 관련 CSS에 display: none이 있어야 함
    const minWidthCssMatch = code!.match(/const MinWidthCss[^;]*css`([^`]*)`/s);
    if (minWidthCssMatch) {
      const minWidthContent = minWidthCssMatch[1];
      const hasDisplayNone = /display:\s*none/.test(minWidthContent);
      expect(hasDisplayNone).toBe(true);
    }
  });

  test("Slot 노드의 자손이 별도로 렌더링되지 않아야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // leftIcon, rightIcon slot이 있어야 함
    const hasLeftIconSlot = /leftIcon/.test(code!);
    const hasRightIconSlot = /rightIcon/.test(code!);
    expect(hasLeftIconSlot).toBe(true);
    expect(hasRightIconSlot).toBe(true);

    // SVG가 직접 렌더링되지 않아야 함 (slot 자손으로 있던 SVG)
    // Plus, Minus 같은 아이콘 SVG가 하드코딩되어 있으면 안 됨
    const hasSvgElement = /<svg[^>]*>/.test(code!);
    // SVG가 있더라도 슬롯 외부에 있으면 안 됨
    // 버튼 내부에 직접 svg 태그가 렌더링되는지 확인
    const buttonJsxMatch = code!.match(
      /return\s*\(\s*<button[^]*<\/button>\s*\)/s
    );
    if (buttonJsxMatch) {
      const buttonContent = buttonJsxMatch[0];
      // slot 변수({leftIcon}, {rightIcon})는 있어야 하지만
      // 직접적인 <svg> 태그는 없어야 함
      const hasSvgInButton = /<svg/.test(buttonContent);
      expect(hasSvgInButton).toBe(false);
    }
  });

  test("children 순서가 x좌표 기준으로 정렬되어야 함", async () => {
    const compiler = new FigmaCodeGenerator(PrimaryFixture as any);
    const code = await compiler.compile();

    expect(code).not.toBeNull();

    // JSX에서 요소 순서 확인
    // 예상 순서: MinWidth(또는 생략) -> leftIcon -> Text -> rightIcon
    const buttonJsxMatch = code!.match(
      /return\s*\(\s*<button[^]*<\/button>\s*\)/s
    );
    if (buttonJsxMatch) {
      const buttonContent = buttonJsxMatch[0];

      const leftIconPos = buttonContent.indexOf("{leftIcon}");
      const textPos = buttonContent.indexOf("Text");
      const rightIconPos = buttonContent.indexOf("{rightIcon}");

      // 순서 검증: leftIcon < Text < rightIcon
      if (leftIconPos !== -1 && textPos !== -1 && rightIconPos !== -1) {
        expect(leftIconPos).toBeLessThan(textPos);
        expect(textPos).toBeLessThan(rightIconPos);
      }
    }
  });
});
