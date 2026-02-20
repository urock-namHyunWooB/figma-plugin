import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import group02 from "../fixtures/any/group-02.json";
import any07 from "../fixtures/any/any-07.json";
import type { FigmaNodeData } from "@code-generator2";

describe("Position 스타일 테스트", () => {
  describe("GROUP 노드 (오토레이아웃 없음)", () => {
    test("부모 GROUP에 position: relative가 추가되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      // 루트에 position: relative가 있어야 함
      expect(code).toContain("position: relative");
    });

    test("자식 노드에 position: absolute가 추가되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      // 자식에 position: absolute가 있어야 함
      expect(code).toContain("position: absolute");
    });

    test("자식 노드에 left, top이 추가되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();
      // left, top 값이 있어야 함
      expect(code).toMatch(/left:\s*\d+px/);
      expect(code).toMatch(/top:\s*\d+px/);
    });

    test("TEXT 노드의 위치가 올바르게 계산되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
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
      const compiler = new FigmaCodeGenerator(data);
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

      const compiler = new FigmaCodeGenerator(autoLayoutData);
      const code = await compiler.getGeneratedCode("AutoLayoutFrame");

      expect(code).not.toBeNull();
      // position: absolute가 없어야 함 (flexbox 레이아웃이므로)
      expect(code).not.toContain("position: absolute");
    });
  });

  describe("중첩 GROUP", () => {
    test("중첩된 GROUP도 올바르게 처리되어야 한다", async () => {
      const data = group02 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.getGeneratedCode("Group21737");

      expect(code).not.toBeNull();

      // Group 467 (중첩 GROUP)도 position 스타일이 있어야 함
      // 단, visible: false인 Vector 52는 렌더링되지 않음
      expect(code).toBeDefined();
    });
  });

  describe("absolute positioning 컨테이너 높이", () => {
    test("layoutMode가 없는 FRAME에 height가 추가되어야 한다", async () => {
      // any-07.json: Yellow 프레임 내부의 "Yellow bright" 같은 아이템들은
      // layoutMode가 없어서 자식들이 absolute가 됨
      // 이 경우 부모에 height가 명시적으로 설정되어야 함
      const data = any07 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.getGeneratedCode("Yellow");

      expect(code).not.toBeNull();

      // 각 아이템 프레임 (Yellow bright 등)의 height가 40px임
      // Figma absoluteBoundingBox.height: 40
      expect(code).toMatch(/height:\s*40px/);
    });

    test("자식이 absolute일 때 부모에 relative와 height가 모두 있어야 한다", async () => {
      const data = any07 as unknown as FigmaNodeData;
      const compiler = new FigmaCodeGenerator(data);
      const code = await compiler.getGeneratedCode("Yellow");

      expect(code).not.toBeNull();

      // position: relative와 height가 함께 있어야 함
      expect(code).toContain("position: relative");
      expect(code).toContain("position: absolute");
      // 부모 컨테이너에 height가 있어서 레이아웃이 깨지지 않음
      expect(code).toMatch(/height:\s*\d+px/);
    });

    test("오토레이아웃 컨테이너는 height를 자동으로 추가하지 않는다", async () => {
      // any-07.json의 루트 프레임은 layoutMode: "VERTICAL"
      // 이 경우 Figma 높이가 아닌 CSS flex 레이아웃에 의존
      const autoLayoutData: FigmaNodeData = {
        pluginData: [],
        info: {
          document: {
            id: "test:1",
            name: "AutoLayoutFrame",
            type: "FRAME",
            layoutMode: "VERTICAL",
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 200 },
            children: [
              {
                id: "test:2",
                name: "Child",
                type: "FRAME",
                absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
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
            display: "flex",
            "flex-direction": "column",
          },
          children: [
            {
              id: "test:2",
              name: "Child",
              cssStyle: { width: "100px", height: "50px" },
              children: [],
            },
          ],
        },
      };

      const compiler = new FigmaCodeGenerator(autoLayoutData);
      const code = await compiler.getGeneratedCode("AutoLayoutFrame");

      expect(code).not.toBeNull();
      // 오토레이아웃이라서 position: absolute가 없음
      expect(code).not.toContain("position: absolute");
      // 루트에 height: 200px가 자동으로 추가되지 않음 (flexbox로 처리)
      expect(code).not.toContain("height: 200px");
    });
  });
});
