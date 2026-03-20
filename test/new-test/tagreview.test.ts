import { describe, test, expect, beforeAll } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import type { FigmaNodeData } from "@code-generator2";
import fixture from "../fixtures/failing/Tagreview.json";

describe("Tagreview 컴포넌트 코드 생성", () => {
  let code: string;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(
      fixture as unknown as FigmaNodeData
    );
    code = (await compiler.compile())!;
  });

  test("컴파일이 성공해야 한다", () => {
    expect(code).toBeTruthy();
  });

  // ========================================
  // Props 인터페이스 검증
  // ========================================

  test("size prop이 있어야 한다", () => {
    expect(code).toMatch(/size\?:\s*"Large"\s*\|\s*"Medium"\s*\|\s*"Small"/);
  });

  test("state prop이 있어야 한다", () => {
    expect(code).toMatch(/state\?:/);
    // 5가지 상태가 모두 포함
    expect(code).toMatch(/Approved/);
    expect(code).toMatch(/Rejected/);
    expect(code).toMatch(/UnderReview/);
    expect(code).toMatch(/CurrentVersion/);
  });

  test("아이콘 slot이 개별 prop으로 노출되면 안 된다", () => {
    // state별 아이콘은 state가 결정 — 외부 주입 불필요
    const interfaceMatch = code.match(
      /export interface \w+Props \{([\s\S]*?)\}/
    );
    expect(interfaceMatch).toBeTruthy();
    const interfaceBody = interfaceMatch![1];

    // 아이콘 관련 slot prop이 없어야 함
    expect(interfaceBody).not.toMatch(/\binfo\b.*React\.ReactNode/);
    expect(interfaceBody).not.toMatch(/\btime\b.*React\.ReactNode/);
    expect(interfaceBody).not.toMatch(/\bforbid\b.*React\.ReactNode/);
    expect(interfaceBody).not.toMatch(/\berror\b.*React\.ReactNode/);
    expect(interfaceBody).not.toMatch(/\bsuccess\b.*React\.ReactNode/);
  });

  // TODO: rejectedText → label 범용 rename (별도 이슈)
});
