import { describe, it, expect } from "vitest";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";
import fs from "fs";
import path from "path";

/**
 * 인스턴스 오버라이드 Props 테스트
 *
 * Tokens.json 케이스:
 * - 부모(Tokens)가 여러 ColorGuide INSTANCE를 포함
 * - 각 INSTANCE는 fills(배경색), characters(텍스트) 오버라이드
 * - 의존 컴포넌트(ColorGuide)는 Props로 오버라이드를 받음
 * - CSS 변수 방식으로 스타일 적용
 */
describe("인스턴스 오버라이드 Props", () => {
  const tokensFixturePath = path.join(__dirname, "../fixtures/any/Tokens.json");

  it("fills 오버라이드가 CSS 변수로 변환됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuide CSS에서 CSS 변수 사용 확인
    // background: var(--rectangle1-bg, var(--Neutral-100, #FFF))
    expect(result).toMatch(/var\(--rectangle1-bg,/);

    // JSX에서 CSS 변수 설정 확인
    // style={{ "--rectangle1-bg": rectangle1Bg }}
    expect(result).toMatch(/["']--rectangle1-bg["']:\s*rectangle1Bg/);
  });

  it("characters 오버라이드가 Props로 전달됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuide 인터페이스에 aaText prop 확인
    expect(result).toMatch(/aaText\?:\s*string\s*\|\s*React\.ReactNode/);

    // JSX에서 텍스트 오버라이드 전달 확인
    // aaText="80", aaText="90" 등
    expect(result).toMatch(/aaText="80"/);
    expect(result).toMatch(/aaText="90"/);
  });

  it("외부 컴포넌트 wrapper에 CSS 클래스 적용", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // wrapper div에 css prop 사용 확인 (인라인 스타일 아님)
    // <div css={ColorguideCss}>
    expect(result).toMatch(/<div css=\{Colorguide(?:Css)?(?:_\d+)?\}/);

    // ColorguideCss 변수 정의 확인
    expect(result).toMatch(/const Colorguide(?:Css)?(?:_\d+)?\s*=\s*css`/);
  });

  it("ColorGuide Props 인터페이스 생성", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuideProps 인터페이스 확인
    expect(result).toMatch(/interface ColorGuideProps/);

    // 오버라이드 props 포함 확인
    expect(result).toMatch(/rectangle1Bg\?:\s*string/);
    expect(result).toMatch(/aaBg\?:\s*string/);
    expect(result).toMatch(/aaText\?:\s*string\s*\|\s*React\.ReactNode/);
  });

  it("ColorGuide 컴포넌트에서 Props destructuring", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // Props destructuring 확인
    // const { rectangle1Bg, aaBg, aaText, children, ...restProps } = props;
    expect(result).toMatch(/\{\s*rectangle1Bg,\s*aaBg,\s*aaText/);
  });
});
