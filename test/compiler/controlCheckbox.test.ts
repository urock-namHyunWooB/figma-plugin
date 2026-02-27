import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Controlcheckbox.json 컴파일 테스트
 *
 * 요구조건:
 * - checked prop으로 체크 상태를 주입받을 수 있어야 한다
 * - onChange로 체크/언체크 이벤트를 받을 수 있어야 한다
 * - size, state, tight, disable prop을 주입받을 수 있어야 한다
 */
describe("Controlcheckbox 컴파일 테스트", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/failing/Controlcheckbox.json"
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
    expect(code).toMatch(/export default function Controlcheckbox/);
  });

  describe("Props Interface", () => {
    it("checked?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\?:\s*boolean/);
    });

    it("onChange prop이 boolean 콜백으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onChange\?:\s*\(.*boolean.*\)\s*=>/);
    });

    it("size?: 'Small' | 'Normal' 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/size\?:.*"Small".*"Normal"|size\?:.*"Normal".*"Small"/);
    });

    it("state?: 'Unchecked' | 'Checked' | 'Indeterminate' 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/state\?:.*"Unchecked".*"Checked".*"Indeterminate"/);
    });

    it("tight?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/tight\?:\s*boolean/);
    });

    it("disable?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disable\?:\s*boolean/);
    });
  });

  describe("Destructuring 기본값", () => {
    it("checked 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\s*=\s*false/);
    });

    it("size 기본값이 'Normal'이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/size\s*=\s*["']Normal["']/);
    });

    it("state 기본값이 'Unchecked'이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/state\s*=\s*["']Unchecked["']/);
    });

    it("disable 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disable\s*=\s*false/);
    });
  });

  describe("JSX 바인딩", () => {
    it("state prop이 JSX 조건부 렌더링에 사용되어야 한다", async () => {
      const code = await getCompiledCode();
      // state === "Checked" 또는 state === "Indeterminate" 분기가 있어야 함
      expect(code).toMatch(/state\s*===\s*["']Checked["']|state\s*===\s*["']Indeterminate["']/);
    });

    it("checked prop이 JSX에서 사용되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/\{checked\b|\bchecked\s*&&|checked\s*\?/);
    });

    it("disable 시 onChange가 호출되지 않아야 한다 (disabled 처리)", async () => {
      const code = await getCompiledCode();
      // disabled 속성 또는 disable 조건으로 클릭 막기
      expect(code).toMatch(/disabled=\{disable\}|disable\s*&&.*onChange|onClick.*disable/s);
    });
  });
});
