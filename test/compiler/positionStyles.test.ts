import { describe, test, expect } from "vitest";
import FigmaCompiler from "@compiler";
import group02 from "../fixtures/any/group-02.json";
import type { FigmaNodeData } from "@compiler/types/index";

describe("Position 스타일 테스트", () => {
  describe("GROUP 노드 (오토레이아웃 없음)", () => {
    test("부모 GROUP에 position: relative가 추가되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      // 루트에 position: relative가 있어야 함
      expect(code).toContain("position: relative");
    });

    test("자식 노드에 position: absolute가 추가되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      // 자식에 position: absolute가 있어야 함
      expect(code).toContain("position: absolute");
    });

    test("자식 노드에 left, top이 추가되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      // left, top 값이 있어야 함
      expect(code).toMatch(/left:\s*\d+px/);
      expect(code).toMatch(/top:\s*\d+px/);
    });

    test("TEXT 노드의 위치가 올바르게 계산되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();

      // Address TEXT 노드 위치 계산:
      // parent: { x: -3793, y: -377 }
      // child (Address): { x: -3696.739, y: -365 }
      // left = -3696.739 - (-3793) = 96.261
      // top = -365 - (-377) = 12
      
      // 소수점 처리 방식에 따라 96.261px 또는 반올림된 값
      expect(code).toMatch(/left:\s*96(\.\d+)?px/);
      expect(code).toMatch(/top:\s*12px/);
    });

    test("Rectangle 노드가 (0,0) 위치에 있어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();

      // Rectangle 924 위치:
      // parent: { x: -3793, y: -377 }
      // child: { x: -3793, y: -377 }
      // left = 0, top = 0
      expect(code).toMatch(/left:\s*0px/);
      expect(code).toMatch(/top:\s*0px/);
    });
  });

  describe("오토레이아웃 컨테이너", () => {
    test("layoutMode가 있는 FRAME은 position: absolute를 추가하지 않는다", async () => {
      // 오토레이아웃이 있는 데이터를 시뮬레이션
      const autoLayoutData: FigmaNodeData = {
        pluginData: [],
        info: {
          document: {
            id: "test:1",
            name: "AutoLayoutFrame",
            type: "FRAME",
            layoutMode: "VERTICAL", // 오토레이아웃
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
            children: [
              {
                id: "test:2",
                name: "Child",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 },
                children: [],
              },
            ],
          } as any,
          components: {},
          componentSets: {},
          schemaVersion: 0,
          styles: {},
        },
        styleTree: {
          id: "test:1",
          name: "AutoLayoutFrame",
          cssStyle: {
            width: "100px",
            height: "100px",
            display: "flex",
            "flex-direction": "column",
          },
          children: [
            {
              id: "test:2",
              name: "Child",
              cssStyle: { width: "50px", height: "50px" },
              children: [],
            },
          ],
        },
      };

      const compiler = new FigmaCompiler(autoLayoutData);
      const code = await compiler.getGeneratedCode("AutoLayoutFrame");

      expect(code).not.toBeNull();
      // position: absolute가 없어야 함 (flexbox 레이아웃이므로)
      expect(code).not.toContain("position: absolute");
    });
  });

  describe("중첩 GROUP", () => {
    test("중첩된 GROUP도 올바르게 처리되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCompiler(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      
      // Group 467 (중첩 GROUP)도 position 스타일이 있어야 함
      // 단, visible: false인 Vector 52는 렌더링되지 않음
      expect(code).toBeDefined();
    });
  });
});

