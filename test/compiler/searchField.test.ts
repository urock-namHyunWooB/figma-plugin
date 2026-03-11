import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Searchfieldsearchfield.json
 * placeholder를 주입받을 수 있어야 한다.
 * 검색어를 입력하면 오른쪽에 x 버튼이 생긴다
 * x 버튼을 누르면 입력했던 검색어가 초기화 된다.
 * onChange로 입력된 검색어를 받을 수 있어야 한다.
 *
 */
describe("Searchfieldsearchfield 컴파일 테스트", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/regression/Searchfieldsearchfield.json"
  );

  let result: string | undefined;

  async function getCompiledCode(): Promise<string> {
    if (!result) {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
      result = await compiler.compile();
    }
    return result!;
  }

  it("컴파일이 성공해야 한다", async () => {
    const code = await getCompiledCode();
    expect(code).toBeTruthy();
    expect(code).toMatch(/export default function Searchfieldsearchfield/);
  });

  describe("Props Interface", () => {
    it("text?: string 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/text\?:\s*string/);
    });

    it("cursor?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/cursor\?:\s*boolean/);
    });

    it("size variant prop이 Small | Medium 타입이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(
        /size\?:.*"Small".*"Medium"|size\?:.*"Medium".*"Small"/
      );
    });

    it("active?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/active\?:\s*boolean/);
    });

    it("text가 React.ReactNode(slot)가 아니어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/text\?:\s*React\.ReactNode/);
    });
  });

  describe("Destructuring 기본값", () => {
    it("text 기본값이 '검색어를 입력해주세요.'이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/text\s*=\s*["']검색어를 입력해주세요\.["']/);
    });

    it("size 기본값이 'Medium'이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/size\s*=\s*["']Medium["']/);
    });

    it("active 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/active\s*=\s*false/);
    });

    it("cursor 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/cursor\s*=\s*false/);
    });
  });

  describe("JSX 바인딩", () => {
    it("text prop이 {text}로 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      // 하드코딩된 문자열이 아닌 {text} 변수 참조여야 함
      expect(code).toMatch(/>\s*\{text\}\s*</);
    });

    it("하드코딩된 '검색어를 입력해주세요.'가 JSX에 없어야 한다", async () => {
      const code = await getCompiledCode();
      // 기본값 선언부(= "검색어를...")는 허용, JSX 직접 삽입은 금지
      const jsxHardcoded = code.match(/>\s*검색어를 입력해주세요\.\s*</);
      expect(jsxHardcoded).toBeNull();
    });

    it("active prop에 따라 닫기 버튼이 조건부 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/\{active\s*&&/);
    });

    it("cursor prop에 따라 커서가 조건부 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/\{cursor\s*&&/);
    });

    it("onChange prop이 string 콜백으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      // 검색어(string)를 받는 콜백이어야 함 — boolean 토글이 아님
      expect(code).toMatch(/onChange\?:\s*\(.*string.*\)\s*=>/);
    });

    it("x 버튼(Buttoniconnormal)에 onClick 핸들러가 있어야 한다", async () => {
      const code = await getCompiledCode();
      // Buttoniconnormal 컴포넌트에 onClick prop이 전달되어야 함
      expect(code).toMatch(/<Buttoniconnormal[^/]*onClick/s);
    });
  });

  describe("Size variant 스타일", () => {
    it("size에 따른 padding 스타일 분기가 생성되어야 한다", async () => {
      const code = await getCompiledCode();
      // sizeStyles 또는 size 분기 패턴
      expect(code).toMatch(/sizeStyles|size\]\s*\]/);
    });

    it("Medium variant에 padding: 12px이 포함되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/padding.*12px/);
    });

    it("Small variant에 padding: 8px이 포함되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/padding.*8px/);
    });
  });
});
