import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * Controlradio.json 컴파일 테스트
 *
 * 설계 원칙:
 * - 외부 인터페이스: checked (boolean) — React 표준
 * - state는 제거 → checked boolean prop으로 직접 분기
 * - dot 아이콘은 checked && 조건부 렌더링
 */
describe("Controlradio 컴파일 테스트", () => {
  const fixturePath = path.join(__dirname, "../fixtures/regression/Controlradio.json");

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

  describe("내부 state 파생 없음", () => {
    it("state 파생 변수가 없어야 한다 (checked로 직접 분기)", async () => {
      const code = await getCompiledCode();
      expect(code).not.toMatch(/const\s+state\s*=/);
    });
  });

  describe("스타일 패턴", () => {
    it("state별 시각 차이는 boolean prop 조건부 렌더링으로 처리되어야 한다", async () => {
      const code = await getCompiledCode();
      // checked boolean prop으로 직접 조건부 렌더링
      expect(code).toMatch(/\bchecked\b\s*&&/);
      // state 파생 변수가 없어야 함
      expect(code).not.toMatch(/const\s+state\s*=/);
      // stateStyles 맵은 불필요
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

    it("dot 아이콘이 checked 조건으로 렌더링되어야 한다", async () => {
      const code = await getCompiledCode();
      expect(code).toMatch(/\bchecked\b\s*&&/);
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
