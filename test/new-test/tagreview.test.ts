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

  test("텍스트 prop은 label이어야 한다", () => {
    expect(code).toMatch(/label\?:\s*string/);
    // variant 종속 이름(rejectedText 등)이 아닌 범용 이름
    const interfaceMatch = code.match(
      /export interface \w+Props \{([\s\S]*?)\}/
    );
    expect(interfaceMatch).toBeTruthy();
    expect(interfaceMatch![1]).not.toMatch(/rejectedText/);
  });

  // ========================================
  // cross-depth squash 후 레이아웃 보존
  // Small variant의 Frame 2 wrapper가 prune된 후에도
  // 레이아웃 속성(flex-direction, gap)이 올바르게 override되어야 함
  // ========================================

  test("Small variant에 flex-direction: row가 있어야 한다", () => {
    // Small Root는 원래 VERTICAL이지만, prune된 Frame 2의 HORIZONTAL이 override됨
    const sizeStylesMatch = code.match(
      /sizeStyles[^{]*\{([\s\S]*?)\n\};/
    );
    expect(sizeStylesMatch).toBeTruthy();
    const sizeStyles = sizeStylesMatch![1];
    // Small 블록에 flex-direction: row가 있어야 함
    const smallBlock = sizeStyles.match(/Small:\s*css`([\s\S]*?)`/);
    expect(smallBlock).toBeTruthy();
    expect(smallBlock![1]).toMatch(/flex-direction:\s*row/);
  });

  test("Small variant에 gap이 있어야 한다", () => {
    // prune된 Frame 2의 itemSpacing: 4가 gap으로 보존되어야 함
    const sizeStylesMatch = code.match(
      /sizeStyles[^{]*\{([\s\S]*?)\n\};/
    );
    expect(sizeStylesMatch).toBeTruthy();
    const sizeStyles = sizeStylesMatch![1];
    const smallBlock = sizeStyles.match(/Small:\s*css`([\s\S]*?)`/);
    expect(smallBlock).toBeTruthy();
    expect(smallBlock![1]).toMatch(/gap:\s*\d+px/);
  });

  test("아이콘 컴포넌트 맵이 있어야 한다", () => {
    // state별 아이콘이 component map 패턴으로 렌더링
    expect(code).toMatch(/const\s+\w+\s*=\s*\{/);
    expect(code).toMatch(/Approved:\s*\w+/);
    expect(code).toMatch(/Rejected:\s*\w+/);
  });

  test("아이콘이 JSX에서 렌더링되어야 한다", () => {
    // StateComponent가 JSX에서 사용됨
    expect(code).toMatch(/<\w+Component/);
  });

  // ========================================
  // wrapper 컴포넌트 참조 (instanceScale 제거)
  // ========================================

  test("서브 컴포넌트에 transform: scale이 없어야 한다", () => {
    // wrapper가 크기를 제어하므로 instanceScale(transform: scale)은 이중 축소
    expect(code).not.toMatch(/transform:\s*["']?scale/);
  });
});
