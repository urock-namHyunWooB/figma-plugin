/**
 * 3가지 이슈 해결 검증 테스트
 *
 * 실행: npx vitest run test/tree-builder/_verify-3-fixes.test.ts
 */
import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fixture from "../fixtures/failing/Input.json";

describe("Input.json 3가지 이슈 검증", () => {
  let code: string;

  it("코드 생성 성공", async () => {
    const compiler = new FigmaCodeGenerator(fixture as any);
    code = (await compiler.compile()) ?? "";
    expect(code.length).toBeGreaterThan(0);
  });

  it("이슈 1: helpMessage undefined 참조 해결", () => {
    // props 인터페이스에 helpMessage (숫자 없는) 가 없어야 함
    const propsBlock = code.match(/interface InputProps \{[\s\S]*?\}/)?.[0] ?? "";
    expect(propsBlock).not.toMatch(/\bhelpMessage\b(?!2)/);
    // helperText는 존재해야 함
    expect(propsBlock).toContain("helperText");

    // JSX에서 helpMessage (숫자 없는) 사용하면 안 됨
    // helpMessage2는 OK, helpMessage 단독은 NG
    const jsxLines = code.split("\n").filter((line) => /\bhelpMessage\b/.test(line));
    for (const line of jsxLines) {
      // 모든 helpMessage 참조는 helpMessage2여야 함
      expect(line).toMatch(/helpMessage2/);
    }
  });

  it("이슈 2: dead code 제거 — date 블록 안에 search 조건 없음", () => {
    // customType === "date" 블록 안에 customType === "search"가 있으면 dead code
    const lines = code.split("\n");
    let insideDateBlock = 0; // 중첩 depth 추적

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // date 블록 진입 감지
      if (line.includes('customType === "date"') && line.includes("&&")) {
        insideDateBlock++;
        // 이 블록의 괄호 depth를 추적하여 블록 종료 감지
        let parenDepth = 0;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "(") parenDepth++;
            if (ch === ")") parenDepth--;
          }
          // date 블록 내부에서 search 조건이 있으면 안 됨
          if (
            j > i &&
            parenDepth > 0 &&
            lines[j].includes('customType === "search"')
          ) {
            throw new Error(
              `Dead code 발견: line ${j + 1}에 customType==="search"가 date 블록 안에 있음:\n` +
                `  date 블록 시작: line ${i + 1}: ${lines[i].trim()}\n` +
                `  dead code: line ${j + 1}: ${lines[j].trim()}`
            );
          }
          if (parenDepth <= 0) break;
        }
        insideDateBlock--;
      }
    }
  });

  it("이슈 3: dropdownGenericLists item이 렌더링에 사용됨", () => {
    // dropdownGenericLists.map((item, index) => ... 블록에서 item이 사용되어야 함
    const mapMatch = code.match(
      /dropdownGenericLists\.map\(\(item, index\) => \([\s\S]*?\)\)/
    );
    expect(mapMatch).not.toBeNull();

    const mapBlock = mapMatch![0];
    // {item} 또는 item.xxx 형태로 사용되어야 함
    expect(mapBlock).toMatch(/\{item[.}]/);
    // <Dropdowngenericlist /> (props 없는) 형태면 안 됨
    expect(mapBlock).not.toMatch(/<Dropdowngenericlist\s*\/>/);
  });
});
