import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * NodeMatcher child pattern prefix 매칭 테스트
 *
 * Headersub.json 케이스:
 * - COMPONENT_SET 구조 (Default, Basic variant)
 * - Default variant: INSTANCE-TEXT-INSTANCE (3개 자식)
 * - Basic variant: INSTANCE-TEXT (2개 자식)
 * - "INSTANCE-TEXT"가 "INSTANCE-TEXT-INSTANCE"의 prefix이므로 같은 노드로 매칭되어야 함
 *
 * 관련 이슈 (#23):
 * - NodeMatcher._compareByStructure()에서 prefix 매칭 허용
 * - 불필요한 slot 생성 방지 (3개만 생성되어야 함)
 */
describe("NodeMatcher child pattern prefix 매칭", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/any/Headersub.json"
  );

  it("variant 간 자식 개수가 다른 경우에도 같은 노드로 매칭되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    expect(result).toBeTruthy();

    // Props interface에서 slot 개수 확인
    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    expect(headersubPropsMatch).not.toBeNull();

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // ReactNode 타입의 slot prop 개수 확인
      const slotMatches = propsInterface.match(/React\.ReactNode/g);

      // v2 파이프라인: 3개의 slot (normalResponsive, text, rightIcon)
      expect(slotMatches?.length).toBe(3);
    }
  });

  it("정확히 3개의 커스텀 slot prop이 있어야 한다 (normalResponsive, text, rightIcon)", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    expect(headersubPropsMatch).not.toBeNull();

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // 1. normalResponsive (왼쪽 아이콘 - INSTANCE slot)
      expect(propsInterface).toMatch(/normalResponsive\?:\s*React\.ReactNode/);

      // 2. text (텍스트 - TEXT slot)
      expect(propsInterface).toMatch(/text\?:\s*React\.ReactNode/);

      // 3. rightIcon (오른쪽 아이콘 - boolean variant에서 생성)
      expect(propsInterface).toMatch(/rightIcon\?:\s*React\.ReactNode/);

      // 불필요한 slot이 없어야 함
      expect(propsInterface).not.toMatch(/normalResponsive2/);
      expect(propsInterface).not.toMatch(/text2/);
    }
  });

  it("variant 간 선택적 자식 노드가 올바르게 처리되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 컴포넌트 함수에서 세 개의 slot이 모두 렌더링되어야 함
    // v2 파이프라인은 분리형 export: function X() {} export default X;
    const functionMatch = result?.match(
      /function Headersub[\s\S]*?return[\s\S]*?\n\}/
    );

    expect(functionMatch).not.toBeNull();

    if (functionMatch) {
      const functionCode = functionMatch[0];

      // 세 개의 slot이 JSX에 포함되어야 함
      expect(functionCode).toMatch(/\{normalResponsive\}/);
      expect(functionCode).toMatch(/text/);
      expect(functionCode).toMatch(/\{rightIcon\}/);
    }
  });

  it("prefix 패턴 매칭이 동작해야 한다 (INSTANCE-TEXT ⊆ INSTANCE-TEXT-INSTANCE)", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });

    // 컴파일이 성공적으로 완료되어야 함 (prefix 매칭이 동작하지 않으면 실패)
    const result = await compiler.compile();

    expect(result).toBeTruthy();
    expect(result?.length).toBeGreaterThan(0);
  });

  it("props interface에 중복 slot이 생성되지 않아야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // normalResponsive가 한 번만 나와야 함 (normalResponsive2, normalResponsive3 등이 없어야 함)
      expect(propsInterface).not.toMatch(/normalResponsive[23456789]/);

      // text가 한 번만 나와야 함 (text2, text3 등이 없어야 함)
      expect(propsInterface).not.toMatch(/text[23456789]/);
    }
  });

  it("Basic variant의 노드들이 별도 slot으로 생성되지 않아야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // ReactNode slot이 3개: normalResponsive, text, rightIcon
      // (children은 React에서 암묵적으로 처리되므로 명시적 slot 불필요)
      const slotCount = (propsInterface.match(/React\.ReactNode/g) || []).length;
      expect(slotCount).toBe(3);

      // 불필요한 slot prop이 없어야 함
      // (예: normalResponsive2, normalResponsive3, text2 등)
      expect(propsInterface).not.toMatch(/normalResponsive[23456789]/);
      expect(propsInterface).not.toMatch(/text[23456789]/);
    }
  });

  it("컴파일이 성공적으로 완료되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 결과가 비어있지 않아야 함
    expect(result).toBeTruthy();
    expect(result?.length).toBeGreaterThan(0);

    // TypeScript 함수 정의가 있어야 함
    expect(result).toMatch(/function Headersub/);

    // v2 파이프라인: 분리형 export (function X() {} export default X;)
    expect(result).toMatch(/export default Headersub/);
  });
});
