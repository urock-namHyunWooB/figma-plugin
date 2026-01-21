import { describe, it, expect } from "vitest";
import FigmaCompiler from "../../src/frontend/ui/domain/compiler/index";
import fs from "fs";
import path from "path";

/**
 * 컴포넌트 이름 충돌 테스트
 *
 * LabelNameConflict.json 케이스:
 * - 메인 컴포넌트: "Label" (FRAME)
 * - 의존성 컴포넌트: "label" (COMPONENT)
 * - normalizeComponentName() 후 둘 다 "Label"로 변환되어 충돌
 *
 * 관련 이슈:
 * - DependencyManager가 의존성 이름을 "_Label"로 변경하여 충돌 방지
 * - bundleWithDependencies가 메인 코드의 JSX 참조를 치환
 * - 무한 렌더링 방지
 */
describe("컴포넌트 이름 충돌 처리", () => {
  const fixturePath = path.join(
    __dirname,
    "../fixtures/any/LabelNameConflict.json"
  );

  it("의존성 컴포넌트 이름이 _ 접두사로 변경됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 의존성 컴포넌트가 _Label로 변경되어야 함
    expect(result).toContain("function _Label");
  });

  it("메인 컴포넌트는 원래 이름 유지", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 메인 컴포넌트는 Label로 유지
    expect(result).toMatch(/export default function Label/);
  });

  it("메인 컴포넌트가 의존성을 _Label로 참조함", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 메인 컴포넌트 함수 추출
    const mainMatch = result?.match(
      /export default function Label[\s\S]*?return[\s\S]*?(?=\n\/\/\s*===|$)/
    );

    expect(mainMatch).not.toBeNull();

    if (mainMatch) {
      const mainCode = mainMatch[0];

      // JSX에서 _Label을 참조해야 함 (자기 자신 참조 방지)
      expect(mainCode).toMatch(/<_Label/);
      // self-closing 또는 닫는 태그 둘 다 허용
      expect(mainCode).toMatch(/<_Label[^>]*\/?>|<\/_Label>/);
    }
  });

  it("의존성 컴포넌트가 올바르게 렌더링됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // _Label 함수 추출
    const depMatch = result?.match(
      /function _Label[\s\S]*?return[\s\S]*?(?=\nfunction\s|\nexport\s|\/\/\s*===)/
    );

    expect(depMatch).not.toBeNull();

    if (depMatch) {
      const depCode = depMatch[0];

      // 의존성 컴포넌트가 실제 콘텐츠를 렌더링해야 함
      expect(depCode).toMatch(/css=\{.*Css\}/);

      // "Normal" 텍스트가 의존성 컴포넌트에 있어야 함
      expect(depCode).toContain("Normal");
    }
  });

  it("메인 컴포넌트 텍스트가 올바름", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 메인 컴포넌트는 "Interaction" 텍스트를 가져야 함
    expect(result).toContain("Interaction");
  });

  it("의존성 컴포넌트 텍스트가 올바름", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 의존성 컴포넌트는 "Normal", "Pressed" 텍스트를 가져야 함
    expect(result).toContain("Normal");
    expect(result).toContain("Pressed");
  });

  it("컴파일이 성공적으로 완료됨", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 결과가 비어있지 않아야 함
    expect(result).toBeTruthy();
    expect(result?.length).toBeGreaterThan(0);
  });

  it("무한 재귀 방지: 메인에서 자기 자신을 호출하지 않음", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCompiler(fixture, { strategy: "emotion" });
    const result = await compiler.compile();

    // 메인 컴포넌트 함수 추출
    const mainMatch = result?.match(
      /export default function Label[\s\S]*?return[\s\S]*?(?=\n\/\/\s*===|$)/
    );

    expect(mainMatch).not.toBeNull();

    if (mainMatch) {
      const mainCode = mainMatch[0];

      // "function Label" 선언 이후의 return 구문에서
      // <Label 태그가 없어야 함 (자기 자신 호출 없음)
      const returnMatch = mainCode.match(/return\s*\([\s\S]*$/);
      if (returnMatch) {
        const returnCode = returnMatch[0];

        // <Label로 시작하는 태그가 있으면 자기 자신을 호출하는 것
        expect(returnCode).not.toMatch(/<Label[\s/>]/);

        // 대신 <_Label을 사용해야 함
        expect(returnCode).toMatch(/<_Label/);
      }
    }
  });
});
