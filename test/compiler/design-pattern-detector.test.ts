import { describe, it, expect } from "vitest";
import { DesignPatternDetector } from "@code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";

describe("DesignPatternDetector", () => {
  it("detect()가 InternalTree를 받아 에러 없이 실행된다", () => {
    const detector = new DesignPatternDetector(null as any);
    const tree = { id: "root", name: "Root", type: "FRAME", children: [] } as any;
    expect(() => detector.detect(tree)).not.toThrow();
  });
});
