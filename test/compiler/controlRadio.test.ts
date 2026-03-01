import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Controlradio.json 컴파일 테스트
 *
 * 설계 원칙:
 * - 외부 인터페이스: checked (boolean) — React 표준
 * - state는 내부 파생 변수: checked ? "Checked" : "Unchecked"
 * - 스타일은 내부 state 변수 기반 stateStyles?.[state] 패턴으로 통합
 */
describe("Controlradio 컴파일 테스트", () => {
  const fixturePath = path.join(__dirname, "../fixtures/failing/Controlradio.json");

  let result: string | undefined;

  async function getCompiledCode(): Promise<string> {
    if (!result) {
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
      result = await compiler.compile();
    }
    return result!;
  }

  describe("Props 인터페이스", () => {
    it("checked?: boolean prop이 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/checked\?\s*:\s*boolean/);
    });

    it("onChange?: (checked: boolean) => void prop이 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onChange\?\s*:\s*\(checked:\s*boolean\)\s*=>\s*void/);
    });

    it("disable?: boolean prop이 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disable\?\s*:\s*boolean/);
    });

    it("state prop이 외부 인터페이스에 없어야 한다", async () => {
      const code = await getCompiledCode();
      const interfaceMatch = code.match(/interface ControlradioProps \{[^}]+\}/s);
      expect(interfaceMatch).not.toBeNull();
      expect(interfaceMatch![0]).not.toMatch(/state\s*\?/);
    });

    it("interactionNormal slot이 외부에 없어야 한다", async () => {
      const code = await getCompiledCode();
      const interfaceMatch = code.match(/interface ControlradioProps \{[^}]+\}/s);
      expect(interfaceMatch).not.toBeNull();
      expect(interfaceMatch![0]).not.toMatch(/interactionNormal/);
    });

    it("iconNormalDot slot이 외부에 없어야 한다", async () => {
      const code = await getCompiledCode();
      const interfaceMatch = code.match(/interface ControlradioProps \{[^}]+\}/s);
      expect(interfaceMatch).not.toBeNull();
      expect(interfaceMatch![0]).not.toMatch(/iconNormalDot/);
    });
  });

  describe("파생 변수", () => {
    it("state 파생 변수가 checked 기반으로 생성되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/const state = checked \? "Checked" : "Unchecked"/);
    });
  });

  describe("스타일 패턴", () => {
    it("state별 시각 차이는 조건부 렌더링으로 처리되어야 한다 (CSS 아닌 JSX 분기)", async () => {
      const code = await getCompiledCode();
      // Checked dot은 state 기반 조건부 렌더링으로 표시
      expect(code).toMatch(/state\s*===\s*["']Checked["']/);
      // state에 해당하는 CSS 속성이 없으므로 stateStyles 맵은 불필요
      expect(code).not.toMatch(/stateStyles/);
    });
  });

  describe("JSX 구조", () => {
    it("루트 엘리먼트가 <button>이어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/return \(\s*<button/);
    });

    it("onClick={() => onChange?.(!checked)} 핸들러가 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/onClick=\{.*onChange\?\.\(!checked\).*\}/);
    });

    it("disabled={disable} 속성이 있어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/disabled=\{disable\}/);
    });

    it("dot 아이콘이 state === Checked 조건으로 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/state === "Checked"/);
    });
  });

  describe("코드 품질", () => {
    it("tight prop이 interface에 없어야 한다 (JSX 미사용 dead prop)", async () => {
      const code = await getCompiledCode();
      const interfaceMatch = code.match(/interface ControlradioProps \{[^}]+\}/s);
      expect(interfaceMatch).not.toBeNull();
      expect(interfaceMatch![0]).not.toMatch(/tight\s*\?/);
    });

    it("Ratiovertical 컴포넌트가 생성 코드에 없어야 한다 (미참조 의존성)", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/Ratiovertical/);
    });

    it("모든 variant 값이 동일한 sizeStyles는 생성하지 않아야 한다", async () => {
      const code = await getCompiledCode();
      // radioCss_sizeStyles: Medium=padding:2px, Small=padding:2px → 동일하므로 불필요
      expect(code).not.toMatch(/radioCss_sizeStyles/);
    });
  });
});
