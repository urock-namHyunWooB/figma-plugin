import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import any07 from "../fixtures/any/any-07.json";
import type { FigmaNodeData } from "@code-generator2";

describe("debug 모드", () => {
  describe("data-figma-id 속성", () => {
    test("debug: true일 때 생성된 코드에 data-figma-id 속성이 포함되어야 한다", async () => {
      const data = any07 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data, { debug: true });
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      
      // 루트 노드 ID
      expect(code).toContain('data-figma-id="15:129"');
      // 자식 노드 ID (Yellow bright)
      expect(code).toContain('data-figma-id="15:131"');
    });

    test("debug 옵션 없으면 data-figma-id가 없어야 한다", async () => {
      const data = any07 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code).not.toContain("data-figma-id");
    });

    test("debug: false일 때도 data-figma-id가 없어야 한다", async () => {
      const data = any07 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data, { debug: false });
      const code = await compiler.compile();

      expect(code).not.toBeNull();
      expect(code).not.toContain("data-figma-id");
    });
  });
});
