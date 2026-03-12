import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Chips.json 대상
 *
 * props color가 바뀌면 색상이 바뀌어야한다.
 * props에 text를 주입할 수 있어야 한다.
 */
describe("Chips 컴파일 테스트", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/chip/urock-chips.json"
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
    expect(code).toMatch(/export default function Chips/);
  });

  describe("Props Interface", () => {
    it("color prop이 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/color\?:/);
    });

    it("color prop에 8개 옵션이 모두 있어야 한다", async () => {
      const code = await getCompiledCode();
      const colors = [
        "blue",
        "cyan",
        "gray",
        "navy",
        "red",
        "skyblue",
        "white-black",
        "white-blue",
      ];
      for (const color of colors) {
        expect(code).toContain(`"${color}"`);
      }
    });

    it("text prop이 string 타입으로 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/text\?:\s*string/);
    });
  });

  describe("Color 스타일 바인딩", () => {
    it("colorStyles 맵이 생성되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/colorStyles/);
    });

    it("color prop이 스타일 선택에 바인딩되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/colorStyles\?\.\[String\(color\)\]/);
    });

    it("colorStyles에 background가 포함되어야 한다 (color별 배경색 변경)", async () => {
      const code = await getCompiledCode();
      const colorStylesMatch = code.match(
        /colorStyles[^=]*=\s*\{([\s\S]*?)\n\};/
      );
      expect(colorStylesMatch).toBeTruthy();
      const body = colorStylesMatch![1];
      expect(body).toMatch(/background/);
    });
  });

  describe("Text 주입", () => {
    it("텍스트가 하드코딩이 아닌 prop으로 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      // "Text" 하드코딩이 아닌 {text} prop 바인딩이어야 함
      expect(code).toMatch(/\{text\}/);
    });
  });
});
