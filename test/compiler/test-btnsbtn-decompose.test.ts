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
  const fixturePath = path.resolve(__dirname, "../fixtures/failing/Btnsbtn.json");
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
  });

  describe("Tailwind", () => {
    it("컴파일 성공", async () => {
      const code = await compileFixture({ styleStrategy: "tailwind" });
      expect(code).toContain("function Btnsbtn");
    });
  });
});
