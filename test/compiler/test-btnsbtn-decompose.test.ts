import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import FigmaCodeGenerator from "@code-generator2";

/**
 * Btnsbtn 컴포넌트: style(filled/outlined) × tone(blue/red/basic) × size(L/M/S) × state(5종)
 *
 * convertStateDynamicToPseudo가 default state의 CSS를 compound(background)와
 * nonStateVarying(height/padding)로 분리하면서, decomposer의 prop 역추론이 깨지는 문제 검증.
 *
 * 핵심 요구사항:
 * 1. height/padding은 size에만 의존 → sizeStyles에 배치
 * 2. background 색상은 style×tone(×state) compound에 배치
 * 3. 둘 다 동시에 올바르게 작동해야 함
 */
function compileFixture(options = {}) {
  const fixturePath = path.resolve(__dirname, "../fixtures/button/Btnsbtn.json");
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  return new FigmaCodeGenerator(raw, options).compile();
}

describe("Btnsbtn compound decomposition", () => {
  describe("Emotion", () => {
    let code: string;

    it("컴파일 성공", async () => {
      code = (await compileFixture()) ?? "";
      fs.writeFileSync("/tmp/btnsbtn-latest.tsx", code, "utf-8");
      expect(code).toContain("function Btnsbtn");
    });

    it("sizeStyles에 height/padding이 있어야 한다 (size만으로 결정되는 CSS)", () => {
      // sizeStyles가 존재하고 height를 포함해야 함
      const sizeStylesMatch = code.match(/sizeStyles[^=]*=\s*\{([\s\S]*?)\n\};/);
      expect(sizeStylesMatch).toBeTruthy();
      expect(sizeStylesMatch![1]).toContain("height");
      expect(sizeStylesMatch![1]).toContain("padding");
    });

    it("sizeStyles에 background가 없어야 한다 (background는 state+style+tone에 귀속)", () => {
      const sizeStylesMatch = code.match(/sizeStyles[^=]*=\s*\{([\s\S]*?)\n\};/);
      expect(sizeStylesMatch).toBeTruthy();
      expect(sizeStylesMatch![1]).not.toContain("background");
    });

    it("sizeStyles에 box-shadow가 없어야 한다 (box-shadow는 tone에 귀속)", () => {
      const sizeStylesMatch = code.match(/sizeStyles[^=]*=\s*\{([\s\S]*?)\n\};/);
      expect(sizeStylesMatch).toBeTruthy();
      expect(sizeStylesMatch![1]).not.toContain("box-shadow");
    });

    it("sizeStyles에 L/M/S별 올바른 height가 있어야 한다", () => {
      expect(code).toMatch(/L:[\s\S]*?height:\s*56px/);
      expect(code).toMatch(/M:[\s\S]*?height:\s*40px/);
      expect(code).toMatch(/S:[\s\S]*?height:\s*28px/);
    });

    it("background에 filled+blue 색상(#628cf5)이 있어야 한다", () => {
      const bgLines = (code ?? "").split("\n").filter(
        l => l.includes("background") && l.includes("628cf5")
      );
      expect(bgLines.length).toBeGreaterThanOrEqual(1);
    });

    it("background에 filled+red 색상(#ff8484)이 있어야 한다", () => {
      const bgLines = (code ?? "").split("\n").filter(
        l => l.includes("background") && l.includes("ff8484")
      );
      expect(bgLines.length).toBeGreaterThanOrEqual(1);
    });

    it("background에 outlined+blue 색상(#f7f9fe)이 있어야 한다", () => {
      const bgLines = (code ?? "").split("\n").filter(
        l => l.includes("background") && l.includes("f7f9fe")
      );
      expect(bgLines.length).toBeGreaterThanOrEqual(1);
    });

    it("background가 3가지 이상의 색상을 포함해야 한다 (단일 prop 귀속이면 색상 소실)", () => {
      const bgColors = new Set<string>();
      for (const line of code.split("\n")) {
        const match = line.match(/background:.*#([0-9a-fA-F]{6})/);
        if (match) bgColors.add(match[1].toLowerCase());
      }
      // 최소 filled+blue(628cf5), filled+red(ff8484), outlined+blue(f7f9fe), white(fff)
      expect(bgColors.size).toBeGreaterThanOrEqual(4);
    });

    it("base 스타일에 #ff8484(filled+red 전용) 배경이 없어야 한다", () => {
      // base에 특정 tone 전용 배경이 들어가면 다른 tone에서 빨간색이 노출됨
      const baseMatch = code.match(/const btnCss = css`([\s\S]*?)`;/);
      expect(baseMatch).toBeTruthy();
      expect(baseMatch![1]).not.toContain("#ff8484");
      expect(baseMatch![1]).not.toContain("#FF8484");
    });

    it("텍스트 color가 style을 포함하는 compound에 배치되어야 한다", () => {
      // state+size+tone (style 누락) 대신 style이 포함된 compound에 배치
      // style 없는 compound는 filled/outlined 구분 불가 → 색상 충돌
      expect(code).not.toMatch(/stateSizeToneStyles/);
      // style+tone 또는 state+style+tone에 텍스트 color가 있어야 함
      const hasStyleTone = code.includes("styleToneStyles") || code.includes("stateStyleToneStyles");
      expect(hasStyleTone).toBe(true);
    });

    it("default+filled+blue 텍스트는 흰색이어야 한다", () => {
      // filled+blue → 흰색 텍스트, outlined+blue → 파란색 텍스트
      // compound에 style이 없으면 이 구분이 안 됨
      // styleToneStyles 또는 stateStyleToneStyles에서 filled+blue 텍스트 색상 확인
      const textStyleMatch = code.match(/btnButtonCss_\w*[Ss]tyle\w*Styles[^=]*=\s*\{([\s\S]*?)\n\};/);
      expect(textStyleMatch).toBeTruthy();
      // filled+blue 또는 default+filled+blue 엔트리에 흰색이 있어야 함
      const filledBlue = textStyleMatch![1].match(/"(?:default\+)?filled\+blue":\s*css`([\s\S]*?)`/);
      expect(filledBlue).toBeTruthy();
      expect(filledBlue![1]).toMatch(/color:.*#fff/i);
    });

    it("default+filled+red 배경은 compound에 있어야 한다 (base가 아님)", () => {
      // stateStyleToneStyles에 default+filled+red 엔트리가 있어야 함
      const compound = code.match(/stateStyleToneStyles[^=]*=\s*\{([\s\S]*?)\n\};/);
      expect(compound).toBeTruthy();
      expect(compound![1]).toContain("default+filled+red");
      // 해당 엔트리에 background가 있어야 함
      const entry = compound![1].match(/"default\+filled\+red":\s*css`([\s\S]*?)`/);
      expect(entry).toBeTruthy();
      expect(entry![1]).toMatch(/background:.*ff8484/i);
    });

    it(":hover pseudo-class가 생성되어야 한다", () => {
      // hover는 style+tone에 따라 다른 background를 가짐 (compound-varying)
      // extractPseudoStyles의 공통 diff만으로는 처리 불가 → 비공통 diff가 dynamic으로 전달되어야 함
      const hoverMatches = code.match(/:hover/g) || [];
      expect(hoverMatches.length).toBeGreaterThanOrEqual(1);
    });

    it(":hover에 style+tone별 배경색이 있어야 한다", () => {
      // filled+blue hover = #93b0f8, filled+red hover = #ffb9b9 등
      const hoverBlocks = code.match(/&:hover[^{]*\{[^}]*background:[^}]*\}/g) || [];
      expect(hoverBlocks.length).toBeGreaterThanOrEqual(2);

      const hoverBgColors = new Set<string>();
      for (const block of hoverBlocks) {
        const match = block.match(/background:.*#([0-9a-fA-F]{3,6})/);
        if (match) hoverBgColors.add(match[1].toLowerCase());
      }
      // 최소 2가지 이상 다른 hover 배경색이 있어야 함 (compound-varying 증거)
      expect(hoverBgColors.size).toBeGreaterThanOrEqual(2);
    });

    it(":active pseudo-class가 생성되어야 한다", () => {
      const activeMatches = code.match(/:active/g) || [];
      expect(activeMatches.length).toBeGreaterThanOrEqual(1);
    });

    it(":disabled pseudo-class가 생성되어야 한다", () => {
      const disabledMatches = code.match(/:disabled/g) || [];
      expect(disabledMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Tailwind", () => {
    let twCode: string;

    it("컴파일 성공", async () => {
      twCode = (await compileFixture({ styleStrategy: "tailwind" })) ?? "";
      expect(twCode).toContain("function Btnsbtn");
    });

    it("compound 스타일이 cn() 조건부 클래스로 출력되어야 한다", () => {
      // compoundVariants 대신 cn() + 조건 표현식 사용
      expect(twCode).toContain("cn(");
      expect(twCode).not.toContain("compoundVariants");
    });

    it("filled+blue에 background-color가 있어야 한다", () => {
      // cn() 내 조건: style === "filled" && tone === "blue" && "..."
      expect(twCode).toMatch(/style\s*===\s*"filled".*tone\s*===\s*"blue".*628CF5/is);
    });

    it("filled+red에 background-color가 있어야 한다", () => {
      expect(twCode).toMatch(/style\s*===\s*"filled".*tone\s*===\s*"red".*FF8484/is);
    });

    it("outlined+blue에 border가 있어야 한다", () => {
      expect(twCode).toMatch(/style\s*===\s*"outlined".*tone\s*===\s*"blue".*border/is);
    });

    it("hover 스타일이 조건부 클래스에 포함되어야 한다", () => {
      // cn() 내 조건에 hover: prefix 존재
      const cnMatch = twCode.match(/cn\(([\s\S]*?)\)\s*\}/);
      expect(cnMatch).toBeTruthy();
      expect(cnMatch![1]).toContain("hover:");
    });
  });
});
