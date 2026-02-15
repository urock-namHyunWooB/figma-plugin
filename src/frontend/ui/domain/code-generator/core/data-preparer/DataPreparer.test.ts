import { describe, it, expect } from "vitest";
import DataPreparer from "./DataPreparer";
import type { FigmaNodeData } from "@code-generator/types/baseType";

/**
 * 테스트용 FigmaNodeData 헬퍼
 */
function createMockNodeData(
  id: string,
  name: string,
  type: string = "COMPONENT_SET",
  children?: any[],
  additionalProps?: Record<string, any>
): FigmaNodeData {
  const document: any = {
    id,
    name,
    type,
    visible: true,
    children: children || [],
    ...additionalProps,
  };

  return {
    pluginData: [],
    info: {
      document,
      components: {},
      componentSets: {},
      styles: {},
      schemaVersion: 0,
    },
    styleTree: {
      id,
      name,
      cssStyle: {},
      children:
        children?.map((c) => ({
          id: c.id,
          name: c.name,
          cssStyle: {},
          children: [],
        })) || [],
    },
  };
}

describe("DataPreparer", () => {
  describe("prepare", () => {
    it("단일 노드 데이터 준비", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Button");

      const prepared = preparer.prepare(mockData);

      expect(prepared.document.id).toBe("root-1");
      expect(prepared.document.name).toBe("Button");
      expect(prepared.nodeMap.size).toBe(1);
      expect(prepared.styleMap.size).toBe(1);
    });

    it("children이 있는 노드 데이터 - nodeMap O(1) 조회", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Container", "FRAME", [
        { id: "child-1", name: "Text1", type: "TEXT" },
        { id: "child-2", name: "Text2", type: "TEXT" },
      ]);

      const prepared = preparer.prepare(mockData);

      // nodeMap에 모든 노드가 등록되어야 함
      expect(prepared.nodeMap.size).toBe(3);
      expect(prepared.getNodeById("root-1")).toBeDefined();
      expect(prepared.getNodeById("child-1")).toBeDefined();
      expect(prepared.getNodeById("child-2")).toBeDefined();

      // O(1) 조회 확인
      expect(prepared.getNodeById("child-1")?.name).toBe("Text1");
    });

    it("styleMap O(1) 조회", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Container", "FRAME", [
        { id: "child-1", name: "Text1", type: "TEXT" },
      ]);

      const prepared = preparer.prepare(mockData);

      expect(prepared.styleMap.size).toBe(2);
      expect(prepared.getStyleById("root-1")).toBeDefined();
      expect(prepared.getStyleById("child-1")).toBeDefined();
    });

    it("깊은 복사 - 원본 데이터 변질 방지", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Button");

      const prepared = preparer.prepare(mockData);

      // PreparedDesignData의 spec 수정이 원본에 영향 주면 안됨
      (prepared.spec as any).info.document.name = "Modified";

      expect(mockData.info.document.name).toBe("Button");
      expect(prepared.spec.info.document.name).toBe("Modified");
    });

    it("dependencies Map 구축", () => {
      const preparer = new DataPreparer();
      const depData = createMockNodeData("dep-1", "Icon");
      const mockData: FigmaNodeData = {
        ...createMockNodeData("root-1", "Button"),
        dependencies: {
          "dep-1": depData,
        },
      };

      const prepared = preparer.prepare(mockData);

      expect(prepared.dependencies.size).toBe(1);
      expect(prepared.getDependencyById("dep-1")).toBeDefined();
      expect(prepared.getDependencyById("dep-1")?.info.document.name).toBe(
        "Icon"
      );
    });

    it("imageUrls Map 구축", () => {
      const preparer = new DataPreparer();
      const mockData: FigmaNodeData = {
        ...createMockNodeData("root-1", "Image"),
        imageUrls: {
          "img-ref-1": "https://example.com/image1.png",
          "img-ref-2": "https://example.com/image2.png",
        },
      };

      const prepared = preparer.prepare(mockData);

      expect(prepared.imageUrls.size).toBe(2);
      expect(prepared.getImageUrlByRef("img-ref-1")).toBe(
        "https://example.com/image1.png"
      );
    });

    it("vectorSvgs Map 구축", () => {
      const preparer = new DataPreparer();
      const mockData: FigmaNodeData = {
        ...createMockNodeData("root-1", "Icon"),
        vectorSvgs: {
          "node-1": '<svg><path d="M0 0"/></svg>',
          "node-2": '<svg><path d="M1 1"/></svg>',
        },
      };

      const prepared = preparer.prepare(mockData);

      expect(prepared.vectorSvgs.size).toBe(2);
      expect(prepared.getVectorSvgByNodeId("node-1")).toBe(
        '<svg><path d="M0 0"/></svg>'
      );
    });
  });

  describe("Props 추출", () => {
    it("componentPropertyDefinitions에서 props 추출", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData(
        "root-1",
        "Button",
        "COMPONENT_SET",
        [],
        {
          componentPropertyDefinitions: {
            Size: {
              type: "VARIANT",
              defaultValue: "Large",
              variantOptions: ["Large", "Small"],
            },
            "With icon": {
              type: "BOOLEAN",
              defaultValue: true,
            },
          },
        }
      );

      const prepared = preparer.prepare(mockData);

      // props가 camelCase로 정규화되어야 함
      expect(prepared.props["size"]).toBeDefined();
      expect(prepared.props["size"].type).toBe("VARIANT");
      expect(prepared.props["withIcon"]).toBeDefined();
      expect(prepared.props["withIcon"].type).toBe("BOOLEAN");
    });

    it("componentPropertyReferences에서 props 추출 (원본 ref 키 유지)", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Button", "COMPONENT", [
        {
          id: "text-1",
          name: "Label",
          type: "TEXT",
          characters: "Click me",
          componentPropertyReferences: {
            characters: "Text#123:0",
          },
        },
      ]);

      const prepared = preparer.prepare(mockData);

      // 원본 ref 키가 그대로 사용되어야 함 (이름 생성은 PropsProcessor에서)
      expect(prepared.props["Text#123:0"]).toBeDefined();
      expect(prepared.props["Text#123:0"].type).toBe("TEXT");
      expect(prepared.props["Text#123:0"].defaultValue).toBe("Click me");
    });
  });

  describe("getRootNodeType", () => {
    it("COMPONENT_SET 타입 반환", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Button", "COMPONENT_SET");

      const prepared = preparer.prepare(mockData);

      expect(prepared.getRootNodeType()).toBe("COMPONENT_SET");
    });

    it("COMPONENT 타입 반환", () => {
      const preparer = new DataPreparer();
      const mockData = createMockNodeData("root-1", "Icon", "COMPONENT");

      const prepared = preparer.prepare(mockData);

      expect(prepared.getRootNodeType()).toBe("COMPONENT");
    });
  });

  describe("getDependenciesGroupedByComponentSet", () => {
    it("componentSetId로 그룹핑", () => {
      const preparer = new DataPreparer();

      const variant1: FigmaNodeData = {
        pluginData: [],
        info: {
          document: { id: "v1", name: "Size=Large", type: "COMPONENT" } as any,
          components: { v1: { componentSetId: "icon-set-1" } },
          componentSets: { "icon-set-1": { name: "Icon" } },
          styles: {},
          schemaVersion: 0,
        },
        styleTree: { id: "v1", name: "Size=Large", cssStyle: {}, children: [] },
      };

      const variant2: FigmaNodeData = {
        pluginData: [],
        info: {
          document: { id: "v2", name: "Size=Small", type: "COMPONENT" } as any,
          components: { v2: { componentSetId: "icon-set-1" } },
          componentSets: { "icon-set-1": { name: "Icon" } },
          styles: {},
          schemaVersion: 0,
        },
        styleTree: { id: "v2", name: "Size=Small", cssStyle: {}, children: [] },
      };

      const mockData: FigmaNodeData = {
        ...createMockNodeData("root-1", "Button"),
        dependencies: {
          v1: variant1,
          v2: variant2,
        },
      };

      const prepared = preparer.prepare(mockData);
      const grouped = prepared.getDependenciesGroupedByComponentSet();

      expect(Object.keys(grouped)).toHaveLength(1);
      expect(grouped["icon-set-1"]).toBeDefined();
      expect(grouped["icon-set-1"].componentSetName).toBe("Icon");
      expect(grouped["icon-set-1"].variants).toHaveLength(2);
    });
  });
});

describe("componentPropertyReferences에서 props 추출", () => {
  it("visible ref를 원본 키로 props에 추가 (이름 생성은 PropsProcessor에서)", () => {
    const preparer = new DataPreparer();
    const mockData = createMockNodeData("root-1", "InputField", "COMPONENT_SET", [
      {
        id: "variant-1",
        name: "State=Default",
        type: "COMPONENT",
        children: [
          {
            id: "label-frame",
            name: "Label",
            type: "FRAME",
            componentPropertyReferences: {
              visible: "Show Label#123:0",
            },
          },
          {
            id: "icon-frame",
            name: "Icon",
            type: "FRAME",
            componentPropertyReferences: {
              visible: "Icon Help#456:0",
            },
          },
        ],
      },
    ]);

    const prepared = preparer.prepare(mockData);

    // 원본 ref 키가 그대로 props에 있어야 함 (이름 생성은 PropsProcessor에서)
    expect(prepared.props["Show Label#123:0"]).toBeDefined();
    expect(prepared.props["Icon Help#456:0"]).toBeDefined();
    expect(prepared.props["Show Label#123:0"].type).toBe("BOOLEAN");
  });

  it("이미 componentPropertyDefinitions에 있는 prop은 중복 생성하지 않음", () => {
    const preparer = new DataPreparer();
    const mockData = createMockNodeData("root-1", "InputField", "COMPONENT_SET", [
      {
        id: "variant-1",
        name: "State=Default",
        type: "COMPONENT",
        children: [
          {
            id: "label-frame",
            name: "Label",
            type: "FRAME",
            componentPropertyReferences: {
              visible: "Show Label#123:0", // componentPropertyDefinitions에 이미 있음
            },
          },
        ],
      },
    ], {
      componentPropertyDefinitions: {
        "Show Label#123:0": {
          type: "BOOLEAN",
          defaultValue: true,
        },
      },
    });

    const prepared = preparer.prepare(mockData);

    // componentPropertyDefinitions의 prop만 있어야 함 (중복 없음)
    const propKeys = Object.keys(prepared.props);
    const labelProps = propKeys.filter(k => k.includes("Label"));
    expect(labelProps).toHaveLength(1);
  });

  it("INSTANCE 내부 노드의 ref는 main props로 전파되지 않음", () => {
    const preparer = new DataPreparer();
    const mockData = createMockNodeData("root-1", "InputField", "COMPONENT_SET", [
      {
        id: "variant-1",
        name: "State=Default",
        type: "COMPONENT",
        children: [
          {
            id: "icon-instance",
            name: "Button/Icon/Normal",
            type: "INSTANCE",
            children: [
              {
                id: "badge-inside-instance",
                name: "Badge",
                type: "FRAME",
                componentPropertyReferences: {
                  visible: "Badge#789:0", // INSTANCE 내부 - main으로 전파되면 안 됨
                },
              },
            ],
          },
        ],
      },
    ]);

    const prepared = preparer.prepare(mockData);

    // INSTANCE 내부 노드의 ref는 추출되지 않아야 함
    expect(prepared.props["Badge#789:0"]).toBeUndefined();
  });

  it("characters ref를 원본 키로 props에 추가", () => {
    const preparer = new DataPreparer();
    const mockData = createMockNodeData("root-1", "InputField", "COMPONENT_SET", [
      {
        id: "variant-1",
        name: "State=Default",
        type: "COMPONENT",
        children: [
          {
            id: "label-text",
            name: "Label",
            type: "TEXT",
            characters: "Label Text",
            componentPropertyReferences: {
              characters: "Label Text#123:0",
            },
          },
        ],
      },
    ]);

    const prepared = preparer.prepare(mockData);

    // 원본 ref 키가 그대로 props에 있어야 함
    expect(prepared.props["Label Text#123:0"]).toBeDefined();
    expect(prepared.props["Label Text#123:0"].type).toBe("TEXT");
  });
});

describe("실제 fixture 테스트", () => {
  it("tadaButton.json 처리", async () => {
    const fs = await import("fs");
    const path = await import("path");

    const fixturePath = path.join(
      process.cwd(),
      "test/fixtures/button/tadaButton.json"
    );
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const preparer = new DataPreparer();
    const prepared = preparer.prepare(fixtureData);

    // 기본 동작 확인
    expect(prepared.document).toBeDefined();
    expect(prepared.nodeMap.size).toBeGreaterThan(0);
    expect(prepared.styleMap.size).toBeGreaterThan(0);

    // O(1) 조회 확인
    const rootNode = prepared.getNodeById(fixtureData.info.document.id);
    expect(rootNode).toBeDefined();
    expect(rootNode?.name).toBe(fixtureData.info.document.name);
  });

  it("Case.json - 복잡한 의존성 처리", async () => {
    const fs = await import("fs");
    const path = await import("path");

    const fixturePath = path.join(
      process.cwd(),
      "test/fixtures/any/Case.json"
    );
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const preparer = new DataPreparer();
    const prepared = preparer.prepare(fixtureData);

    // dependencies가 Map으로 변환되어야 함
    expect(prepared.dependencies.size).toBeGreaterThan(0);

    // componentSetId 그룹핑
    const grouped = prepared.getDependenciesGroupedByComponentSet();
    expect(Object.keys(grouped).length).toBeGreaterThan(0);
  });
});
