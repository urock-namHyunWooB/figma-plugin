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

  describe("내부 state 파생 없음", () => {
    it("state 파생 변수가 없어야 한다 (checked/indeterminate로 직접 분기)", async () => {
      const code = await getCompiledCode();
      // const state = ... 가 없어야 함
      expect(code).not.toMatch(/const\s+state\s*=/);
    });
  });

  describe("JSX 바인딩", () => {
    it("checked prop으로 체크 아이콘 조건부 렌더링이 되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/\bchecked\b\s*&&/);
    });

    it("indeterminate prop으로 indeterminate 아이콘 조건부 렌더링이 되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/\bindeterminate\b\s*&&/);
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

    it("checked 상태의 스타일이 checkedStyles 맵으로 관리되어야 한다", async () => {
      const code = await getCompiledCode();
      // Box의 border/background 변경은 CSS 기반 (JSX 조건부 렌더링으로는 처리 불가)
      // stateStyles가 아닌 checked boolean prop 기반 checkedStyles 맵 사용
      expect(code).not.toMatch(/stateStyles/);
    });

    it("state별 시각 차이는 boolean prop 조건부 렌더링으로 처리되어야 한다 (CSS 아닌 JSX 분기)", async () => {
      const code = await getCompiledCode();
      // checked/indeterminate boolean prop으로 직접 조건부 렌더링
      expect(code).toMatch(/\bchecked\b\s*&&/);
      expect(code).toMatch(/\bindeterminate\b\s*&&/);
      // state 파생 변수가 없어야 함
      expect(code).not.toMatch(/const\s+state\s*=/);
      // stateStyles 맵은 불필요
      expect(code).not.toMatch(/stateStyles/);
    });
  });
});
