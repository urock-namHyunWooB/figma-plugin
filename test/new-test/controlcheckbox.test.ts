/**
 * props 인터페이스에 checked?: boolean | "indeterminate" 가 생겨야 한다.
 * 클릭시 checked에 따라서 인터랙션 되어야 한다.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Controlcheckbox", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/any/Controlcheckbox.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("컴파일이 성공해야 한다", async () => {
    const result = await compileFixture();
    expect(result).toBeTruthy();
    expect(result).toMatch(/export default function Controlcheckbox/);
  });

  describe("Props Interface", () => {
    it('checked prop이 boolean | "indeterminate" 타입이어야 한다', async () => {
      const result = await compileFixture();
      expect(result).toMatch(/checked\?:\s*boolean\s*\|\s*"indeterminate"/);
    });

    it("onCheckedChange는 checked 파라미터를 받아야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/onCheckedChange\?:\s*\(checked:/);
    });

    it("size prop이 있어야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/size\?:/);
    });

    it("disable prop이 있어야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/disable\?:/);
    });

    it("Props interface에 type prop이 없어야 한다 (checked로 통합)", async () => {
      const result = await compileFixture();
      const interfaceMatch = result.match(
        /interface Controlcheckbox(?:Own)?Props\s*\{([^}]+)\}/s
      );
      expect(interfaceMatch).toBeTruthy();
      const interfaceBody = interfaceMatch![1];
      expect(interfaceBody).not.toMatch(/\btype\?:/);
    });
  });

  describe("클릭 인터랙션", () => {
    it("클릭 시 onCheckedChange가 호출되어야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/onClick/);
      expect(result).toMatch(/onCheckedChange\?\./);
    });

    it("클릭하면 !checked를 전달해야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/onCheckedChange\?\.\(!checked\)/);
    });

    it("disable 시 disabled 속성이 바인딩되어야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/disabled=\{disable\}/);
    });
  });

  describe("WAI-ARIA 접근성", () => {
    it('role="checkbox"가 있어야 한다', async () => {
      const result = await compileFixture();
      expect(result).toMatch(/role=\{?"checkbox"\}?/);
    });

    it("aria-checked가 checked prop에 바인딩되어야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/aria-checked=\{checked\}/);
    });
  });

  describe("Pseudo-class 변환", () => {
    it("active/pressed가 CSS :active로 조기 변환되면 안 된다", async () => {
      // Checkbox에서 active/pressed는 "선택됨" 상태이지 CSS :active가 아님
      const result = await compileFixture();
      expect(result).not.toMatch(/:active/);
    });
  });

  describe("JSX 렌더링", () => {
    it("checked 아이콘이 checked === true 조건으로 렌더링되어야 한다", async () => {
      const result = await compileFixture();
      expect(result).toMatch(/checked\s*===\s*true\s*&&/);
    });

    it('indeterminate 아이콘이 checked === "indeterminate" 조건으로 렌더링되어야 한다', async () => {
      const result = await compileFixture();
      expect(result).toMatch(/checked\s*===\s*["']indeterminate['"]\s*&&/);
    });
  });
});
