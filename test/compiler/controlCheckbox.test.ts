import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Controlcheckbox.json 컴파일 테스트
 *
 * 설계 원칙:
 * - 외부 인터페이스: checked?: boolean | "indeterminate" — Radix UI 패턴
 * - onCheckedChange?: (checked: boolean | "indeterminate") => void
 * - checked 값에 따라 체크/인디터미네이트 아이콘 조건부 렌더링
 */
describe("Controlcheckbox 컴파일 테스트", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/any/Controlcheckbox.json"
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
    it('checked?: boolean | "indeterminate" 타입으로 정의되어야 한다', async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\?:\s*boolean\s*\|\s*"indeterminate"/);
    });

    it("onCheckedChange prop이 checked 파라미터 콜백으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onCheckedChange\?:\s*\(checked:.*\)\s*=>/);
    });

    it("size?: 'Small' | 'Normal' 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/size\?:.*"Small".*"Normal"|size\?:.*"Normal".*"Small"/);
    });

    it("disable?: boolean 타입으로 정의되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disable\?:\s*boolean/);
    });

    it("state가 public props interface에 없어야 한다 (내부 파생 변수)", async () => {
      const code = await getCompiledCode();
      const interfaceMatch = code.match(/interface ControlcheckboxOwnProps\s*\{([^}]+)\}/s) || code.match(/interface ControlcheckboxProps\s*\{([^}]+)\}/s);
      expect(interfaceMatch).toBeTruthy();
      const interfaceBody = interfaceMatch![1];
      expect(interfaceBody).not.toMatch(/\bstate\?:/);
    });

    it("type prop이 없어야 한다 (checked로 통합)", async () => {
      const code = await getCompiledCode();
      const interfaceMatch = code.match(/interface ControlcheckboxOwnProps\s*\{([^}]+)\}/s) || code.match(/interface ControlcheckboxProps\s*\{([^}]+)\}/s);
      expect(interfaceMatch).toBeTruthy();
      const interfaceBody = interfaceMatch![1];
      expect(interfaceBody).not.toMatch(/\btype\?:/);
    });
  });

  describe("내부 state 파생 없음", () => {
    it("state 파생 변수가 없어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/const\s+state\s*=/);
    });
  });

  describe("JSX 바인딩", () => {
    it("checked === true 조건으로 체크 아이콘이 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\s*===\s*true\s*&&/);
    });

    it('checked === "indeterminate" 조건으로 indeterminate 아이콘이 렌더링되어야 한다', async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\s*===\s*["']indeterminate['"]\s*&&/);
    });

    it("disable 시 disabled 속성이 바인딩되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disabled=\{disable\}/);
    });
  });

  describe("클릭 인터랙션", () => {
    it("onClick에서 onCheckedChange가 호출되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onClick/);
      expect(code).toMatch(/onCheckedChange\?\./);
    });

    it("클릭 시 !checked를 전달해야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onCheckedChange\?\.\(!checked\)/);
    });
  });

  describe("스타일 통합", () => {
    it("&:checked CSS pseudo-class가 없어야 한다 (button/div에서 동작 안 함)", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/&:checked/);
    });

    it("stateStyles 맵이 없어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/stateStyles/);
    });

    it("checkboxBoxCss_checkedStyles가 생성되어야 한다 (조건부 스타일)", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checkedStyles/);
    });

    it("기본 상태 border가 파란색이 아니어야 한다", async () => {
      const code = await getCompiledCode();
      // checkboxBoxCss base에 Primary-Normal(파란색)이 없어야 함
      const boxCssMatch = code.match(/const checkboxBoxCss = css`([^`]+)`/);
      expect(boxCssMatch).toBeTruthy();
      expect(boxCssMatch![1]).not.toMatch(/Primary-Normal/);
    });
  });
});
