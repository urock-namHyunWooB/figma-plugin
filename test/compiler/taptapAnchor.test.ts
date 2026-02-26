import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import taptapAnchor from "../fixtures/any/taptap-anchor.json";
import type { FigmaNodeData } from "@code-generator2";

describe("taptap-anchor 렌더링 테스트", () => {
  test("Anchor INSTANCE가 컴파일되어야 한다", async () => {
    const data = taptapAnchor as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Anchor");

    expect(code).not.toBeNull();
    expect(code).toBeDefined();
  });

  test("단일 COMPONENT 의존성이 중복 생성되지 않아야 한다", async () => {
    const data = taptapAnchor as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Anchor");

    // Anchor 함수가 한 번만 생성되어야 함 (중복 방지)
    const anchorCount = (code?.match(/function Anchor\(/g) || []).length;
    expect(anchorCount).toBe(1);
  });

  test("TEXT 노드가 렌더링되어야 한다", async () => {
    const data = taptapAnchor as unknown as FigmaNodeData;
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Anchor");

    // 텍스트 내용이 포함되어야 함
    expect(code).toContain("Title One");
    expect(code).toContain("Title Two");
    expect(code).toContain("Title Three");
  });
});

