import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

/**
 * ConfirmationDialog 버튼 텍스트 오버라이드 테스트
 *
 * 문제 상황:
 * - ConfirmationDialog에 Cancel 버튼과 Confirm 버튼이 있음
 * - 각 버튼은 Button INSTANCE이며 내부 TEXT 노드가 오버라이드됨
 * - Cancel 버튼의 TEXT: "Cancel", Confirm 버튼의 TEXT: "Confirm"
 *
 * 버그:
 * - 두 버튼 모두 "Cancel"로 표시되는 문제
 * - 원인: prop 바인딩이 nodeId로 매칭되지 않고 이름으로만 매칭됨
 *
 * 수정:
 * - DependencyManager: _overrideableProps에 originalNodeId 저장
 * - DataPreparer: mergeOverrideableProps에서 nodeId 저장
 * - PropsProcessor: TEXT 노드에 대해 nodeId로 prop 찾기
 */
describe("ConfirmationDialog 버튼 텍스트 오버라이드", () => {
  const fixturePath = path.join(__dirname, "../fixtures/any/ConfirmationDialog.json");

  it("Cancel 버튼과 Confirm 버튼이 각각 다른 텍스트를 가져야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // Cancel 버튼 (secondary variant)의 secondaryText prop 확인
    expect(result).toMatch(/secondaryText="Cancel"/);

    // Confirm 버튼 (primary variant)의 labelText prop 확인
    expect(result).toMatch(/labelText="Confirm"/);
  });

  it("Button 컴포넌트가 text override props를 가져야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // Button Props 인터페이스에 text override props 확인
    expect(result).toMatch(/interface ButtonProps/);
    expect(result).toMatch(/secondaryText\?:\s*string/);
    expect(result).toMatch(/labelText\?:\s*string/);
  });

  it("Button 컴포넌트 내부에서 text prop이 TEXT 노드에 바인딩되어야 한다", async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    const result = (await compiler.compile()) as unknown as string;

    // Button 컴포넌트 내부에서 variant에 따라 조건부로 텍스트 렌더링
    // {variant === "primary" ? labelText : secondaryText} 패턴
    expect(result).toMatch(/variant\s*===\s*"primary"\s*\?\s*labelText\s*:\s*secondaryText/);
  });
});
