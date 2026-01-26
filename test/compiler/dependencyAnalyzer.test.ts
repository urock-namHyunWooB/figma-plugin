import { describe, it, expect } from "vitest";
import DependencyAnalyzer from "@compiler/core/DependencyAnalyzer";
import { CircularDependencyError } from "@compiler/types/architecture";
import type { FigmaNodeData } from "@compiler/types/baseType";

/**
 * 테스트용 FigmaNodeData 헬퍼
 */
function createMockNodeData(
  id: string,
  name: string,
  type: "COMPONENT_SET" | "COMPONENT" = "COMPONENT_SET",
  dependencies?: Record<string, FigmaNodeData>
): FigmaNodeData {
  return {
    pluginData: [],
    info: {
      document: {
        id,
        name,
        type,
      } as any,
      components: {},
      componentSets: {},
      styles: {},
      schemaVersion: 0,
    },
    styleTree: {
      id,
      name,
      cssStyle: {},
      children: [],
    },
    dependencies,
  };
}

describe("DependencyAnalyzer", () => {
  describe("buildGraph", () => {
    it("의존성 없는 단일 컴포넌트 그래프 구축", () => {
      const analyzer = new DependencyAnalyzer();
      const rootData = createMockNodeData("root-1", "Button");

      const graph = analyzer.buildGraph(rootData);

      expect(graph.nodes.size).toBe(1);
      expect(graph.nodes.get("root-1")?.name).toBe("Button");
      expect(graph.edges.get("root-1")?.size).toBe(0);
    });

    it("단일 의존성 그래프 구축", () => {
      const analyzer = new DependencyAnalyzer();

      const iconData = createMockNodeData("icon-1", "Icon");
      const buttonData = createMockNodeData("button-1", "Button", "COMPONENT_SET", {
        "icon-1": iconData,
      });

      const graph = analyzer.buildGraph(buttonData);

      expect(graph.nodes.size).toBe(2);
      expect(graph.nodes.has("button-1")).toBe(true);
      expect(graph.nodes.has("icon-1")).toBe(true);

      // button-1 → icon-1 엣지
      const buttonEdges = graph.edges.get("button-1");
      expect(buttonEdges?.has("icon-1")).toBe(true);
    });

    it("다중 의존성 그래프 구축", () => {
      const analyzer = new DependencyAnalyzer();

      const iconData = createMockNodeData("icon-1", "Icon");
      const badgeData = createMockNodeData("badge-1", "Badge");
      const cardData = createMockNodeData("card-1", "Card", "COMPONENT_SET", {
        "icon-1": iconData,
        "badge-1": badgeData,
      });

      const graph = analyzer.buildGraph(cardData);

      expect(graph.nodes.size).toBe(3);
      expect(graph.edges.get("card-1")?.size).toBe(2);
    });

    it("중첩 의존성 그래프 구축", () => {
      const analyzer = new DependencyAnalyzer();

      // Badge → (없음)
      // Large → Badge
      // Case → Large, Icon
      const badgeData = createMockNodeData("badge-1", "Badge");
      const largeData = createMockNodeData("large-1", "Large", "COMPONENT_SET", {
        "badge-1": badgeData,
      });
      const iconData = createMockNodeData("icon-1", "Icon");
      const caseData = createMockNodeData("case-1", "Case", "COMPONENT_SET", {
        "large-1": largeData,
        "icon-1": iconData,
      });

      const graph = analyzer.buildGraph(caseData);

      expect(graph.nodes.size).toBe(4);
      expect(graph.nodes.has("case-1")).toBe(true);
      expect(graph.nodes.has("large-1")).toBe(true);
      expect(graph.nodes.has("badge-1")).toBe(true);
      expect(graph.nodes.has("icon-1")).toBe(true);

      // case-1 → large-1, icon-1
      expect(graph.edges.get("case-1")?.has("large-1")).toBe(true);
      expect(graph.edges.get("case-1")?.has("icon-1")).toBe(true);

      // large-1 → badge-1
      expect(graph.edges.get("large-1")?.has("badge-1")).toBe(true);
    });
  });

  describe("topologicalSort", () => {
    it("단일 컴포넌트 정렬", () => {
      const analyzer = new DependencyAnalyzer();
      const rootData = createMockNodeData("root-1", "Button");

      const graph = analyzer.buildGraph(rootData);
      const order = analyzer.topologicalSort(graph);

      expect(order).toEqual(["root-1"]);
    });

    it("단일 의존성 정렬 - 의존되는 것이 먼저", () => {
      const analyzer = new DependencyAnalyzer();

      const iconData = createMockNodeData("icon-1", "Icon");
      const buttonData = createMockNodeData("button-1", "Button", "COMPONENT_SET", {
        "icon-1": iconData,
      });

      const graph = analyzer.buildGraph(buttonData);
      const order = analyzer.topologicalSort(graph);

      // icon-1이 button-1보다 먼저 와야 함
      const iconIndex = order.indexOf("icon-1");
      const buttonIndex = order.indexOf("button-1");
      expect(iconIndex).toBeLessThan(buttonIndex);
    });

    it("중첩 의존성 정렬", () => {
      const analyzer = new DependencyAnalyzer();

      // Badge → (없음)
      // Large → Badge
      // Case → Large, Icon
      const badgeData = createMockNodeData("badge-1", "Badge");
      const largeData = createMockNodeData("large-1", "Large", "COMPONENT_SET", {
        "badge-1": badgeData,
      });
      const iconData = createMockNodeData("icon-1", "Icon");
      const caseData = createMockNodeData("case-1", "Case", "COMPONENT_SET", {
        "large-1": largeData,
        "icon-1": iconData,
      });

      const graph = analyzer.buildGraph(caseData);
      const order = analyzer.topologicalSort(graph);

      // Badge, Icon이 먼저, Large가 그 다음, Case가 마지막
      const badgeIndex = order.indexOf("badge-1");
      const iconIndex = order.indexOf("icon-1");
      const largeIndex = order.indexOf("large-1");
      const caseIndex = order.indexOf("case-1");

      expect(badgeIndex).toBeLessThan(largeIndex);
      expect(largeIndex).toBeLessThan(caseIndex);
      expect(iconIndex).toBeLessThan(caseIndex);
    });
  });

  describe("detectCycles", () => {
    it("순환 없는 그래프", () => {
      const analyzer = new DependencyAnalyzer();

      const iconData = createMockNodeData("icon-1", "Icon");
      const buttonData = createMockNodeData("button-1", "Button", "COMPONENT_SET", {
        "icon-1": iconData,
      });

      const graph = analyzer.buildGraph(buttonData);
      const cycles = analyzer.detectCycles(graph);

      expect(cycles).toBeNull();
    });

    it("직접 순환 감지 (A → B → A)", () => {
      const analyzer = new DependencyAnalyzer();

      // 수동으로 순환 그래프 구성
      const graph = {
        nodes: new Map([
          ["a", { id: "a", name: "A", data: createMockNodeData("a", "A") }],
          ["b", { id: "b", name: "B", data: createMockNodeData("b", "B") }],
        ]),
        edges: new Map([
          ["a", new Set(["b"])],
          ["b", new Set(["a"])],
        ]),
      };

      const cycles = analyzer.detectCycles(graph);

      expect(cycles).not.toBeNull();
      expect(cycles!.length).toBeGreaterThan(0);
    });

    it("간접 순환 감지 (A → B → C → A)", () => {
      const analyzer = new DependencyAnalyzer();

      // 수동으로 순환 그래프 구성
      const graph = {
        nodes: new Map([
          ["a", { id: "a", name: "A", data: createMockNodeData("a", "A") }],
          ["b", { id: "b", name: "B", data: createMockNodeData("b", "B") }],
          ["c", { id: "c", name: "C", data: createMockNodeData("c", "C") }],
        ]),
        edges: new Map([
          ["a", new Set(["b"])],
          ["b", new Set(["c"])],
          ["c", new Set(["a"])],
        ]),
      };

      const cycles = analyzer.detectCycles(graph);

      expect(cycles).not.toBeNull();
      expect(cycles!.length).toBeGreaterThan(0);
    });

    it("순환 의존성이 있으면 topologicalSort에서 에러 발생", () => {
      const analyzer = new DependencyAnalyzer();

      // 수동으로 순환 그래프 구성
      const graph = {
        nodes: new Map([
          ["a", { id: "a", name: "A", data: createMockNodeData("a", "A") }],
          ["b", { id: "b", name: "B", data: createMockNodeData("b", "B") }],
        ]),
        edges: new Map([
          ["a", new Set(["b"])],
          ["b", new Set(["a"])],
        ]),
      };

      expect(() => analyzer.topologicalSort(graph)).toThrow(
        CircularDependencyError
      );
    });
  });

  describe("실제 Figma 데이터 시뮬레이션", () => {
    it("COMPONENT_SET with variants", () => {
      const analyzer = new DependencyAnalyzer();

      // COMPONENT with componentSetId
      const variantData: FigmaNodeData = {
        pluginData: [],
        info: {
          document: {
            id: "variant-1",
            name: "Size=Large",
            type: "COMPONENT",
          } as any,
          components: {
            "variant-1": {
              componentSetId: "button-set-1",
            },
          },
          componentSets: {
            "button-set-1": {
              name: "Button",
            },
          },
          styles: {},
          schemaVersion: 0,
        },
        styleTree: {
          id: "variant-1",
          name: "Size=Large",
          cssStyle: {},
          children: [],
        },
      };

      const graph = analyzer.buildGraph(variantData);

      // componentSetId가 있으면 해당 ID로 노드 생성
      expect(graph.nodes.has("button-set-1")).toBe(true);
      expect(graph.nodes.get("button-set-1")?.name).toBe("Button");
    });
  });
});
