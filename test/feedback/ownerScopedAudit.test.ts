import { describe, it, expect } from "vitest";
import { DynamicStyleDecomposer } from "@code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer";

// 내부 메서드 직접 호출용 헬퍼
const audit = (DynamicStyleDecomposer as unknown as {
  auditOwnerConsistency: (
    cssKey: string,
    ownerProp: string,
    matrix: Array<{ propValues: Map<string, string>; style: Record<string, string | number> }>,
    diagnostics: unknown[]
  ) => void;
}).auditOwnerConsistency;

describe("DynamicStyleDecomposer.auditOwnerConsistency", () => {
  it("auditOwnerConsistency 메서드가 정의되어 있다", () => {
    expect(typeof audit).toBe("function");
  });

  it("일관적인 그룹에 대해 진단을 만들지 않는다", () => {
    const matrix = [
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "L"]]), style: { padding: "16px" } },
      { propValues: new Map([["size", "L"]]), style: { padding: "16px" } },
    ];
    const diagnostics: unknown[] = [];
    audit.call(DynamicStyleDecomposer, "padding", "size", matrix, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it("불일치 그룹에 대해 진단을 만든다", () => {
    const matrix = [
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "M"]]), style: { padding: "14px" } },
    ];
    const diagnostics: Array<{ cssProperty: string; propName: string; propValue: string; expectedValue: string | null }> = [];
    audit.call(DynamicStyleDecomposer, "padding", "size", matrix, diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].cssProperty).toBe("padding");
    expect(diagnostics[0].propName).toBe("size");
    expect(diagnostics[0].propValue).toBe("M");
    // 동점이라 expectedValue는 null
    expect(diagnostics[0].expectedValue).toBeNull();
  });

  it("다수결 expectedValue를 반환한다", () => {
    const matrix = [
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "M"]]), style: { padding: "14px" } },
    ];
    const diagnostics: Array<{ expectedValue: string | null }> = [];
    audit.call(DynamicStyleDecomposer, "padding", "size", matrix, diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].expectedValue).toBe("12px");
  });
});
