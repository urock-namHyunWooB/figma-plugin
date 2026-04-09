import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("VariantInconsistency.nodeId threading", () => {
  it("UITreeOptimizer가 진단에 nodeId를 채운다", async () => {
    const fixturePath = resolve(__dirname, "../fixtures/failing/Btn.json");
    const data = JSON.parse(readFileSync(fixturePath, "utf-8"));

    const gen = new FigmaCodeGenerator(data);
    const result = await gen.compileWithDiagnostics();

    // bindingFeedbackToDiagnostics가 만든 슬롯/토글 경고는 nodeId가 없음 (별도 경로).
    // UITreeOptimizer 경로의 진단(propName !== "")만 검사한다.
    const structural = result.diagnostics.filter((d) => d.propName !== "");
    expect(structural.length, "Buttonsolid 픽스처에 구조적 진단이 없음").toBeGreaterThan(0);

    for (const d of structural) {
      expect(d.nodeId, `diagnostic for ${d.cssProperty} missing nodeId`).toBeDefined();
      expect(typeof d.nodeId).toBe("string");
      expect(d.nodeId!.length).toBeGreaterThan(0);
    }
  });
});
