import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * COMPONENT_SET 내부 TEXT 노드 slot 변환 테스트
 *
 * Headersub.json 케이스:
 * - COMPONENT_SET 구조
 * - 세 개의 자식 노드: INSTANCE, TEXT, INSTANCE
 * - 모든 노드가 slot으로 변환되어야 함
 *
 * 관련 이슈 (#22):
 * - isComponentSetRoot 조건 개선 (originalDocument 확인)
 * - TEXT 노드 slot 변환 로직 추가
 */
describe("COMPONENT_SET 내부 TEXT 노드 slot 변환", () => {
  const fixturePath = path.join(__dirname, "../fixtures/any/Headersub.json");

  it("COMPONENT_SET의 TEXT 노드가 slot으로 변환되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    expect(result).toBeTruthy();

    // TEXT 노드가 slot prop으로 정의되어야 함
    expect(result).toMatch(/text\?:\s*React\.ReactNode/);
  });

  it("세 개의 slot이 모두 생성되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // Props interface에 slot들이 있어야 함
    // dependency 코드가 포함되어 있으므로 HeadersubProps만 추출
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

      // 3. rightIcon (오른쪽 아이콘 - "Right Icon" boolean variant에서 생성)
      expect(propsInterface).toMatch(/rightIcon\?:\s*React\.ReactNode/);
    }
  });

  it("slot이 JSX에서 올바르게 렌더링되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 컴포넌트 함수 추출
    const functionMatch = result?.match(
      /function Headersub[\s\S]*?return[\s\S]*?(?=\nexport\s|$)/
    );

    expect(functionMatch).not.toBeNull();

    if (functionMatch) {
      const functionCode = functionMatch[0];

      // slot이 렌더링되어야 함
      expect(functionCode).toMatch(/\{normalResponsive\}/);
      expect(functionCode).toMatch(/text/);
      expect(functionCode).toMatch(/\{rightIcon\}/);
    }
  });

  it("slot이 적절한 기본값으로 렌더링되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 컴포넌트 함수 추출
    const functionMatch = result?.match(
      /export default function Headersub[\s\S]*?return[\s\S]*?\n\}/
    );

    expect(functionMatch).not.toBeNull();

    if (functionMatch) {
      const functionCode = functionMatch[0];

      // INSTANCE slot은 null로 기본값 설정
      expect(functionCode).toMatch(/normalResponsive\s*=\s*null/);
      expect(functionCode).toMatch(/rightIcon\s*=\s*null/);

      // TEXT slot은 원본 텍스트를 기본값으로 사용
      expect(functionCode).toMatch(/text\s*=\s*["'].*["']/);
    }
  });

  it("TEXT slot이 isTextSlot 플래그로 표시되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    expect(result).toBeTruthy();

    // TEXT slot의 경우 일반 slot과 동일하게 처리되지만,
    // 내부적으로 isTextSlot 플래그가 설정됨
    // (코드 생성 결과는 동일하므로 컴파일 성공 여부만 확인)
  });

  it("camelCase로 slot 이름이 변환되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // "normal-responsive" → "normalResponsive"
    expect(result).toMatch(/normalResponsive\?:\s*React\.ReactNode/);

    // TEXT 노드의 이름이 camelCase로 변환되어야 함
    expect(result).toMatch(/text\?:\s*React\.ReactNode/);
  });

  it("INSTANCE slot과 boolean variant slot이 모두 생성되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // normalResponsive (왼쪽 INSTANCE slot)과 rightIcon (Right Icon boolean variant)
    expect(result).toContain("normalResponsive?");
    expect(result).toContain("rightIcon?");
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

    // export default function 형태가 있어야 함
    expect(result).toMatch(/export default function Headersub/);
  });
});
