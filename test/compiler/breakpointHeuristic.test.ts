import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

/**
 * BreakpointHeuristic TDD
 *
 * 핵심 목표: variant prop이 "반응형 브레이크포인트"인지 스스로 인식하고
 *            인식된 경우 CSS @media query로 변환한다.
 *
 * 인식 기준 (아래 중 하나 이상 해당하면 브레이크포인트로 판단):
 *   - prop 이름에 breakpoint, device, screen, platform 등 포함
 *   - prop 값에 xs, sm, md, lg, xl, mobile, desktop, tablet 등 포함
 *
 * 인식 제외:
 *   - 위 기준에 해당하지 않는 일반 variant (State, Color 등)
 *     → 그대로 prop으로 유지
 *
 * 픽스처: BreakpointdesktopmdlgStatelogin.json
 *   - GNB/Wanted 컴포넌트
 *   - Breakpoint=Mobile(xs-sm) / Desktop(md-lg) / Desktop(xl)
 *   - State=Login / Logout
 *   - 기본값: Breakpoint=Desktop(md-lg), width=1440px
 *
 * Breakpoint 매핑 (관례적 CSS breakpoint):
 *   - Mobile(xs-sm)  → max-width: 767px
 *   - Desktop(md-lg) → default (base CSS)
 *   - Desktop(xl)    → min-width: 1280px
 */
describe("BreakpointHeuristic — 브레이크포인트 인식 및 @media 변환", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/regression/BreakpointdesktopmdlgStatelogin.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture as any);
    return (await compiler.compile()) as string;
  };

  /**
   * @media 블록을 정확히 파싱: { } 한 블록만 추출
   * [^}]+ 패턴으로 중괄호 경계를 정확히 지정 → template literal 끝까지 캡처하는 오류 방지
   */
  const extractMediaBlocks = (
    code: string
  ): Array<{ query: string; content: string }> => {
    const blocks: Array<{ query: string; content: string }> = [];
    const re = /@media\s*(\([^)]+\))\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      blocks.push({ query: m[1], content: m[2] });
    }
    return blocks;
  };

  // ──────────────────────────────────────────────
  // 1. 인식: 브레이크포인트 variant는 prop에서 제거
  // ──────────────────────────────────────────────

  it("Breakpoint variant는 브레이크포인트로 인식해 interface에서 제거된다", async () => {
    const result = await compileFixture();

    expect(result).not.toMatch(/breakpoint\?:/);
  });

  it("Figma 브레이크포인트 값 문자열이 prop 타입으로 노출되지 않는다", async () => {
    const result = await compileFixture();

    expect(result).not.toContain('"Mobile(xs-sm)"');
    expect(result).not.toContain('"Desktop(md-lg)"');
    expect(result).not.toContain('"Desktop(xl)"');
  });

  it("함수 본체에서도 breakpoint 기본값 할당이 없다", async () => {
    const result = await compileFixture();

    // destructuring 기본값: breakpoint = "Desktop(md-lg)" 패턴만 잡음
    // (변수명에 breakpoint가 포함된 다른 식과 혼동 방지)
    expect(result).not.toMatch(/\bbreakpoint\s*=\s*["']/);
  });

  // ──────────────────────────────────────────────
  // 2. 인식 제외: 브레이크포인트가 아닌 variant는 prop 유지
  // ──────────────────────────────────────────────

  it("State variant는 브레이크포인트가 아니므로 prop으로 유지된다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/state\?:/);
  });

  it("State 값(Login/Logout)은 @media가 아닌 조건부 렌더링으로 처리된다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/state\s*===\s*"/);
  });

  // ──────────────────────────────────────────────
  // 3. 스타일 변환: _breakpointStyles → @media
  // ──────────────────────────────────────────────

  it("_breakpointStyles 객체 패턴이 @media로 대체된다", async () => {
    const result = await compileFixture();

    expect(result).not.toMatch(/_breakpointStyles/);
    expect(result).toContain("@media");
  });

  it("기본(Desktop md-lg) 스타일은 @media 밖 base CSS에 있다", async () => {
    const result = await compileFixture();

    // @media 블록 전체 제거 후 1440px가 남아야 함
    const withoutMedia = result.replace(
      /@media\s*\([^)]+\)\s*\{[^}]*\}/gs,
      ""
    );
    expect(withoutMedia).toContain("1440px");
  });

  it("모바일(xs-sm)은 max-width @media로 생성된다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/@media\s*\([^)]*max-width[^)]*\)/);
  });

  it("Desktop(xl)은 min-width @media로 생성된다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/@media\s*\([^)]*min-width[^)]*\)/);
  });

  it("모바일 width 375px가 max-width @media 블록 내에 있다", async () => {
    const result = await compileFixture();

    const blocks = extractMediaBlocks(result);
    const hasMobileWidth = blocks.some(
      (b) => b.query.includes("max-width") && b.content.includes("375px")
    );
    expect(hasMobileWidth).toBe(true);
  });

  it("Desktop(xl) width 1600px가 min-width @media 블록 내에 있다", async () => {
    const result = await compileFixture();

    const blocks = extractMediaBlocks(result);
    const hasXlWidth = blocks.some(
      (b) => b.query.includes("min-width") && b.content.includes("1600px")
    );
    expect(hasXlWidth).toBe(true);
  });

  it("모바일 threshold는 max-width: 767px이다", async () => {
    const result = await compileFixture();

    // Mobile(xs-sm) → 관례적 breakpoint: 767px
    expect(result).toMatch(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/);
  });

  it("Desktop(xl) threshold는 min-width: 1280px이다", async () => {
    const result = await compileFixture();

    // Desktop(xl) → 관례적 breakpoint: 1280px
    expect(result).toMatch(/@media\s*\(\s*min-width\s*:\s*1280px\s*\)/);
  });

  // ──────────────────────────────────────────────
  // 4. 구조 변환: breakpoint JSX 분기 → @media display:none
  // ──────────────────────────────────────────────

  it("브레이크포인트 조건부 JSX 분기가 제거된다", async () => {
    const result = await compileFixture();

    expect(result).not.toMatch(/breakpoint\s*===\s*"/);
  });

  it("모바일 전용 요소는 @media(min-width) 블록 내에서 display:none으로 숨겨진다", async () => {
    const result = await compileFixture();

    const blocks = extractMediaBlocks(result);
    const hasHideOnDesktop = blocks.some(
      (b) =>
        b.query.includes("min-width") &&
        /display:\s*["']?none["']?/.test(b.content)
    );
    expect(hasHideOnDesktop).toBe(true);
  });

  it("데스크탑 전용 요소는 @media(max-width) 블록 내에서 display:none으로 숨겨진다", async () => {
    const result = await compileFixture();

    const blocks = extractMediaBlocks(result);
    const hasHideOnMobile = blocks.some(
      (b) =>
        b.query.includes("max-width") &&
        /display:\s*["']?none["']?/.test(b.content)
    );
    expect(hasHideOnMobile).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 5. 기본 동작 보호
  // ──────────────────────────────────────────────

  it("컴파일이 성공한다", async () => {
    const result = await compileFixture();

    expect(result).toBeTruthy();
    expect(result).toMatch(/export default function/);
  });
});
