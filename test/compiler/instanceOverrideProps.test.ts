import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "../../src/frontend/ui/domain/code-generator/index";
import fs from "fs";
import path from "path";

/**
 * 인스턴스 오버라이드 Props 테스트
 *
 * Tokens.json 케이스:
 * - 부모(Tokens)가 여러 ColorGuide INSTANCE를 포함
 * - 각 INSTANCE는 fills(배경색), characters(텍스트) 오버라이드
 * - 의존 컴포넌트(ColorGuide)는 Props로 오버라이드를 받음
 * - 부모에서 각 INSTANCE별 다른 값을 props로 전달
 */
describe("인스턴스 오버라이드 Props", () => {
  const tokensFixturePath = path.join(__dirname, "../fixtures/any/Tokens.json");

  it("fills 오버라이드가 Props로 전달됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuide에 rectangle1Bg prop 전달 확인
    // <ColorGuide rectangle1Bg="#D6D6D6" ... />
    expect(result).toMatch(/rectangle1Bg="#[A-Fa-f0-9]+"/);

    // 여러 인스턴스에서 각각 다른 색상 전달
    expect(result).toMatch(/rectangle1Bg="#FFFFFF"/i); // 100 (white)
    expect(result).toMatch(/rectangle1Bg="#D6D6D6"/i); // 90
    expect(result).toMatch(/rectangle1Bg="#000000"/i); // 0 (black)
  });

  it("characters 오버라이드가 Props로 전달됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuide 인터페이스에 aaText prop 확인
    expect(result).toMatch(/aaText\?:\s*string/);

    // JSX에서 텍스트 오버라이드 전달 확인
    // aaText="80", aaText="90" 등
    expect(result).toMatch(/aaText="80"/);
    expect(result).toMatch(/aaText="90"/);
    expect(result).toMatch(/aaText="100"/);
    expect(result).toMatch(/aaText="0"/);
  });

  it("ColorGuide Props 인터페이스 생성", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuideProps 인터페이스 확인
    expect(result).toMatch(/interface ColorGuideProps/);

    // 오버라이드 props 포함 확인
    expect(result).toMatch(/rectangle1Bg\?:\s*string/);
    expect(result).toMatch(/aaBg\?:\s*string/);
    expect(result).toMatch(/aaText\?:\s*string/);
  });

  it("ColorGuide 컴포넌트에서 Props destructuring", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // Props destructuring 확인 (기본값 포함)
    // const { rectangle1Bg = "", aaBg = "", aaText = "", children, ...restProps } = props;
    expect(result).toMatch(/rectangle1Bg\s*=\s*""/);
    expect(result).toMatch(/aaBg\s*=\s*""/);
    expect(result).toMatch(/aaText\s*=\s*""/);
  });

  it("각 INSTANCE별 다른 override 값 전달", async () => {
    const fixture = JSON.parse(fs.readFileSync(tokensFixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // ColorGuide가 여러 번 호출되어야 함 (11개 인스턴스)
    const colorGuideMatches = result.match(/<ColorGuide[\s\S]*?\/>/g);
    expect(colorGuideMatches).toBeTruthy();
    expect(colorGuideMatches!.length).toBe(11);

    // 각 인스턴스가 다른 props를 가져야 함
    // 첫 번째와 마지막 인스턴스의 색상이 달라야 함
    expect(result).toMatch(/rectangle1Bg="#FFFFFF"/i); // 첫 번째 (100)
    expect(result).toMatch(/rectangle1Bg="#000000"/i); // 마지막 (0)
  });
});
