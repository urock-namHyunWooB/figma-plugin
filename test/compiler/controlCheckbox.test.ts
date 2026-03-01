import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Controlcheckbox.json 컴파일 테스트
 *
 * 설계 원칙:
 * - 외부 인터페이스: checked (boolean) + indeterminate (boolean) — React 표준
 * - state는 내부 파생 변수: checked ? "Checked" : indeterminate ? "Indeterminate" : "Unchecked"
 * - 스타일은 내부 state 변수 기반 stateStyles?.[state] 패턴으로 통합
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

    it("indeterminate?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/indeterminate\?:\s*boolean/);
    });

    it("onChange prop이 boolean 콜백으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onChange\?:\s*\(.*boolean.*\)\s*=>/);
    });

    it("size?: 'Small' | 'Normal' 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/size\?:.*"Small".*"Normal"|size\?:.*"Normal".*"Small"/);
    });

    it("tight?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/tight\?:\s*boolean/);
    });

    it("disable?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disable\?:\s*boolean/);
    });

    it("state가 public props interface에 없어야 한다 (내부 파생 변수)", async () => {
      const code = await getCompiledCode();
      // interface 블록 안에 state?: 가 없어야 함
      const interfaceMatch = code.match(/interface ControlcheckboxProps\s*\{([^}]+)\}/s);
      expect(interfaceMatch).toBeTruthy();
      const interfaceBody = interfaceMatch![1];
      expect(interfaceBody).not.toMatch(/\bstate\?:/);
    });
  });

  describe("Destructuring 기본값", () => {
    it("checked 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\s*=\s*false/);
    });

    it("indeterminate 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/indeterminate\s*=\s*false/);
    });

    it("size 기본값이 'Normal'이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/size\s*=\s*["']Normal["']/);
    });

    it("disable 기본값이 false이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disable\s*=\s*false/);
    });
  });

  describe("내부 state 파생 계산", () => {
    it("checked/indeterminate 기반으로 내부 state를 계산해야 한다", async () => {
      const code = await getCompiledCode();
      // const state = checked ? "Checked" : indeterminate ? "Indeterminate" : "Unchecked"
      expect(code).toMatch(/const\s+state\s*=\s*checked\s*\?\s*["']Checked["']\s*:\s*indeterminate\s*\?\s*["']Indeterminate["']\s*:\s*["']Unchecked["']/);
    });
  });

  describe("JSX 바인딩", () => {
    it("내부 state 변수로 체크 아이콘 조건부 렌더링이 되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/state\s*===\s*["']Checked["']/);
    });

    it("내부 state 변수로 indeterminate 아이콘 조건부 렌더링이 되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/state\s*===\s*["']Indeterminate["']/);
    });

    it("disable 시 onChange가 호출되지 않아야 한다 (disabled 처리)", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disabled=\{disable\}|disable\s*&&.*onChange|onClick.*disable/s);
    });
  });

  describe("스타일 통합", () => {
    it("&:checked CSS pseudo-class가 없어야 한다 (button/div에서 동작 안 함)", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/&:checked/);
    });

    it("checkedStyles 별도 맵이 없어야 한다 (stateStyles로 통합)", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/checkedStyles/);
    });

    it("state별 시각 차이는 조건부 렌더링으로 처리되어야 한다 (CSS 아닌 JSX 분기)", async () => {
      const code = await getCompiledCode();
      // Checked/Indeterminate 아이콘은 state 기반 조건부 렌더링으로 표시
      expect(code).toMatch(/state\s*===\s*["']Checked["']/);
      // state에 해당하는 CSS 속성이 없으므로 stateStyles 맵은 불필요
      expect(code).not.toMatch(/stateStyles/);
    });
  });
});
