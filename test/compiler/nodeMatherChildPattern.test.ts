import { describe, it, expect } from "vitest";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";
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
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
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

      // 3개의 slot만 생성되어야 함 (normalResponsive, text, normalResponsive2)
      // 4개가 아님 (Basic variant의 노드들이 별도 slot으로 생성되지 않음)
      expect(slotMatches?.length).toBe(3);
    }
  });

  it("정확히 3개의 slot prop이 있어야 한다 (normalResponsive, text, normalResponsive2)", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    expect(headersubPropsMatch).not.toBeNull();

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // 1. normalResponsive (왼쪽 아이콘)
      expect(propsInterface).toMatch(/normalResponsive\?:\s*React\.ReactNode/);

      // 2. text (텍스트)
      expect(propsInterface).toMatch(/text\?:\s*React\.ReactNode/);

      // 3. normalResponsive2 (오른쪽 아이콘)
      expect(propsInterface).toMatch(/normalResponsive2\?:\s*React\.ReactNode/);

      // 4개 이상의 slot이 없어야 함
      // (예: normalResponsive3, text2 등이 생성되면 안 됨)
      expect(propsInterface).not.toMatch(/normalResponsive3/);
      expect(propsInterface).not.toMatch(/text2/);
    }
  });

  it("variant 간 선택적 자식 노드가 올바르게 처리되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 컴포넌트 함수에서 세 개의 slot이 모두 렌더링되어야 함
    const functionMatch = result?.match(
      /export default function Headersub[\s\S]*?return[\s\S]*?\n\}/
    );

    expect(functionMatch).not.toBeNull();

    if (functionMatch) {
      const functionCode = functionMatch[0];

      // 세 개의 slot이 JSX에 포함되어야 함
      expect(functionCode).toMatch(/\{normalResponsive\}/);
      expect(functionCode).toMatch(/\{text\}/);
      expect(functionCode).toMatch(/\{normalResponsive2\}/);
    }
  });

  it("prefix 패턴 매칭이 동작해야 한다 (INSTANCE-TEXT ⊆ INSTANCE-TEXT-INSTANCE)", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });

    // 컴파일이 성공적으로 완료되어야 함 (prefix 매칭이 동작하지 않으면 실패)
    const result = await compiler.compile();

    expect(result).toBeTruthy();
    expect(result?.length).toBeGreaterThan(0);
  });

  it("props interface에 중복 slot이 생성되지 않아야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // normalResponsive가 한 번만 나와야 함 (normalResponsive와 normalResponsive3가 동시에 있으면 안 됨)
      const normalResponsiveMatches = propsInterface.match(/normalResponsive[^?2]/g);
      expect(normalResponsiveMatches?.length).toBeLessThanOrEqual(1);

      // text가 한 번만 나와야 함 (text와 text2가 동시에 있으면 안 됨)
      const textMatches = propsInterface.match(/\stext\?/g);
      expect(textMatches?.length).toBe(1);
    }
  });

  it("Basic variant의 노드들이 별도 slot으로 생성되지 않아야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    const headersubPropsMatch = result?.match(
      /export interface HeadersubProps[^{]*\{[\s\S]*?\n\}/
    );

    if (headersubPropsMatch) {
      const propsInterface = headersubPropsMatch[0];

      // ReactNode slot이 3개를 초과하면 안 됨
      const slotCount = (propsInterface.match(/React\.ReactNode/g) || []).length;
      expect(slotCount).toBe(3);

      // 불필요한 slot prop이 없어야 함
      // (예: normalResponsive4, text3 등)
      expect(propsInterface).not.toMatch(/normalResponsive[456789]/);
      expect(propsInterface).not.toMatch(/text[23456789]/);
    }
  });

  it("컴파일이 성공적으로 완료되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 결과가 비어있지 않아야 함
    expect(result).toBeTruthy();
    expect(result?.length).toBeGreaterThan(0);

    // TypeScript 함수 정의가 있어야 함
    expect(result).toMatch(/function Headersub/);

    // export default function 형태가 있어야 함
    expect(result).toMatch(/export default function Headersub/);
  });
});
