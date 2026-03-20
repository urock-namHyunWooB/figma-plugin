import { describe, it, expect } from "vitest";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";

/**
 * End-to-End 테스트: Auto Layout 노드 시프트 시 Stage 5.5 보정 매칭
 *
 * 합성 COMPONENT_SET fixture를 만들어 VariantMerger의 전체 파이프라인을 통과시킨다.
 *
 * 핵심 설계:
 * - Extra 요소는 RECTANGLE 타입 → FRAME 타겟과 Stage 1 타입 불일치로 거부
 * - 타겟 위아래 모두 Extra 배치 → 3-way 비교의 bottom-alignment도 실패
 * - Stage 4가 모든 정렬 모드(좌/중/우)에서 실패한 뒤
 *   Stage 5.5 왼쪽 컨텍스트 보정으로 올바르게 매칭
 */

/** 최소 SceneNode 생성 헬퍼 */
function node(
  id: string,
  type: string,
  name: string,
  bounds: { x: number; y: number; width: number; height: number },
  extra: Record<string, any> = {}
): any {
  return {
    id,
    type,
    name,
    visible: true,
    absoluteBoundingBox: bounds,
    absoluteRenderBounds: bounds,
    constraints: { vertical: "TOP", horizontal: "LEFT" },
    fills: [],
    strokes: [],
    effects: [],
    blendMode: "PASS_THROUGH",
    children: [],
    ...extra,
  };
}

/** StyleTree 엔트리 */
function styleEntry(id: string, name: string, children: any[] = []): any {
  return { id, name, cssStyle: {}, children };
}

/**
 * Scenario 1: A에 extra 요소가 위아래로 있어 Content가 밀린 경우
 *
 * Variant A (Full):
 *   Root [VERTICAL, gap=10]
 *     ├─ Header  (FRAME      300x40,  y=0)
 *     ├─ Badge   (RECTANGLE  300x100, y=50)   ← A에만 있음
 *     ├─ Content (FRAME      300x60,  y=160)  ← 매칭 타겟
 *     └─ Deco    (RECTANGLE  300x30,  y=230)  ← A에만 있음
 *   Height=260
 *
 * Variant B (Minimal):
 *   Root [VERTICAL, gap=10]
 *     ├─ Header  (FRAME      300x40,  y=0)
 *     └─ Content (FRAME      300x60,  y=50)
 *   Height=110
 *
 * 3-way 비교 (Content):
 *   avgH = (260+110)/2 = 185
 *   top:  |160-50|/185 = 0.595 > 0.1 ❌
 *   center: 0.595 > 0.1 ❌
 *   bottom: |40-0|/185 = 0.216 > 0.1 ❌  (Deco가 아래에 있어서!)
 *
 * Height ratio = 260/110 = 2.36 → fallback: |160-50|=110 > 10 ❌
 *
 * Badge(RECTANGLE) vs Content(FRAME) → Stage 1 타입 거부
 * Stage 5.5: 공유=[Header], extraA=[Badge], shift=110 → 160-110=50=50 → 매칭 ✓
 */
function createMiddleRemovalFixture(): any {
  const componentSetId = "cs:1";
  const variantAId = "v:a";
  const variantBId = "v:b";

  const variantA = node(variantAId, "COMPONENT", "Full", {
    x: 0, y: 0, width: 300, height: 260,
  }, {
    layoutMode: "VERTICAL",
    itemSpacing: 10,
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    children: [
      node("a:header", "FRAME", "Header", { x: 0, y: 0, width: 300, height: 40 }),
      node("a:badge", "RECTANGLE", "Badge", { x: 0, y: 50, width: 300, height: 100 }),
      node("a:content", "FRAME", "Content", { x: 0, y: 160, width: 300, height: 60 }),
      node("a:deco", "RECTANGLE", "Deco", { x: 0, y: 230, width: 300, height: 30 }),
    ],
  });

  const variantB = node(variantBId, "COMPONENT", "Minimal", {
    x: 400, y: 0, width: 300, height: 110,
  }, {
    layoutMode: "VERTICAL",
    itemSpacing: 10,
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    children: [
      node("b:header", "FRAME", "Header", { x: 400, y: 0, width: 300, height: 40 }),
      node("b:content", "FRAME", "Content", { x: 400, y: 50, width: 300, height: 60 }),
    ],
  });

  const componentSet = node(componentSetId, "COMPONENT_SET", "TestCard", {
    x: 0, y: 0, width: 700, height: 260,
  }, {
    componentPropertyDefinitions: {
      Style: { type: "VARIANT", defaultValue: "Full", variantOptions: ["Full", "Minimal"] },
    },
    children: [variantA, variantB],
  });

  return {
    pluginData: [],
    info: {
      document: componentSet,
      components: {
        [variantAId]: {
          key: "key-a", name: "Full", description: "",
          remote: false, componentSetId, documentationLinks: [],
        },
        [variantBId]: {
          key: "key-b", name: "Minimal", description: "",
          remote: false, componentSetId, documentationLinks: [],
        },
      },
      componentSets: {
        [componentSetId]: {
          key: "key-cs", name: "TestCard", description: "", documentationLinks: [],
        },
      },
      schemaVersion: 0,
      styles: {},
    },
    styleTree: styleEntry(componentSetId, "TestCard", [
      styleEntry(variantAId, "Full", [
        styleEntry("a:header", "Header"),
        styleEntry("a:badge", "Badge"),
        styleEntry("a:content", "Content"),
        styleEntry("a:deco", "Deco"),
      ]),
      styleEntry(variantBId, "Minimal", [
        styleEntry("b:header", "Header"),
        styleEntry("b:content", "Content"),
      ]),
    ]),
  };
}

/**
 * Scenario 2: B에 extra 요소가 위아래로 추가되어 Body가 밀린 경우
 *
 * Variant A (Simple):
 *   Root [VERTICAL, gap=10]
 *     ├─ Title  (FRAME      300x40,  y=0)
 *     └─ Body   (FRAME      300x80,  y=50)
 *   Height=130
 *
 * Variant B (Rich):
 *   Root [VERTICAL, gap=10]
 *     ├─ Title   (FRAME      300x40,  y=0)
 *     ├─ Banner  (RECTANGLE  300x100, y=50)   ← B에만 있음
 *     ├─ Body    (FRAME      300x80,  y=160)  ← 매칭 타겟
 *     └─ Tag     (RECTANGLE  300x20,  y=250)  ← B에만 있음
 *   Height=270
 *
 * 3-way 비교 (Body):
 *   avgH = (130+270)/2 = 200
 *   top:  |50-160|/200 = 0.55 > 0.1 ❌
 *   center: 0.55 > 0.1 ❌
 *   bottom: |0-30|/200 = 0.15 > 0.1 ❌  (Tag가 아래에 있어서!)
 *
 * Height ratio = 270/130 = 2.08 → fallback: |50-160|=110 > 10 ❌
 *
 * Banner(RECTANGLE) vs Body(FRAME) → Stage 1 타입 거부
 * Stage 5.5: 공유=[Title], extraB=[Banner], shift=110 → 160-110=50=50 → 매칭 ✓
 */
function createMiddleInsertFixture(): any {
  const componentSetId = "cs:2";
  const variantAId = "v2:a";
  const variantBId = "v2:b";

  const variantA = node(variantAId, "COMPONENT", "Simple", {
    x: 0, y: 0, width: 300, height: 130,
  }, {
    layoutMode: "VERTICAL",
    itemSpacing: 10,
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    children: [
      node("a2:title", "FRAME", "Title", { x: 0, y: 0, width: 300, height: 40 }),
      node("a2:body", "FRAME", "Body", { x: 0, y: 50, width: 300, height: 80 }),
    ],
  });

  const variantB = node(variantBId, "COMPONENT", "Rich", {
    x: 400, y: 0, width: 300, height: 270,
  }, {
    layoutMode: "VERTICAL",
    itemSpacing: 10,
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    children: [
      node("b2:title", "FRAME", "Title", { x: 400, y: 0, width: 300, height: 40 }),
      node("b2:banner", "RECTANGLE", "Banner", { x: 400, y: 50, width: 300, height: 100 }),
      node("b2:body", "FRAME", "Body", { x: 400, y: 160, width: 300, height: 80 }),
      node("b2:tag", "RECTANGLE", "Tag", { x: 400, y: 250, width: 300, height: 20 }),
    ],
  });

  const componentSet = node(componentSetId, "COMPONENT_SET", "TestPanel", {
    x: 0, y: 0, width: 700, height: 270,
  }, {
    componentPropertyDefinitions: {
      Style: { type: "VARIANT", defaultValue: "Simple", variantOptions: ["Simple", "Rich"] },
    },
    children: [variantA, variantB],
  });

  return {
    pluginData: [],
    info: {
      document: componentSet,
      components: {
        [variantAId]: {
          key: "key-2a", name: "Simple", description: "",
          remote: false, componentSetId, documentationLinks: [],
        },
        [variantBId]: {
          key: "key-2b", name: "Rich", description: "",
          remote: false, componentSetId, documentationLinks: [],
        },
      },
      componentSets: {
        [componentSetId]: {
          key: "key-cs2", name: "TestPanel", description: "", documentationLinks: [],
        },
      },
      schemaVersion: 0,
      styles: {},
    },
    styleTree: styleEntry(componentSetId, "TestPanel", [
      styleEntry(variantAId, "Simple", [
        styleEntry("a2:title", "Title"),
        styleEntry("a2:body", "Body"),
      ]),
      styleEntry(variantBId, "Rich", [
        styleEntry("b2:title", "Title"),
        styleEntry("b2:banner", "Banner"),
        styleEntry("b2:body", "Body"),
        styleEntry("b2:tag", "Tag"),
      ]),
    ]),
  };
}

describe("Auto Layout Shift — End-to-End Merge", () => {
  describe("Scenario 1: A에 extra 요소가 위아래로 있어 Content가 밀림", () => {
    it("Content가 Stage 5.5로 중복 없이 매칭되어야 함", () => {
      const fixture = createMiddleRemovalFixture();
      const dataManager = new DataManager(fixture);
      const treeBuilder = new TreeBuilder(dataManager);
      const internalTree = treeBuilder.buildInternalTreeDebug(fixture.info.document);

      // Content 노드가 하나만 있어야 함 (중복 없음)
      const contentNodes = internalTree.children.filter((c: any) => c.name === "Content");
      expect(contentNodes.length).toBe(1);

      // Content의 mergedNodes가 양쪽 variant를 포함해야 함
      const contentMerged = contentNodes[0].mergedNodes;
      expect(contentMerged).toBeDefined();
      expect(contentMerged!.length).toBeGreaterThanOrEqual(2);

      // Header도 매칭되어야 함
      const headerNodes = internalTree.children.filter((c: any) => c.name === "Header");
      expect(headerNodes.length).toBe(1);

      // Badge, Deco는 A에만 존재
      const badgeNodes = internalTree.children.filter((c: any) => c.name === "Badge");
      expect(badgeNodes.length).toBe(1);
      const decoNodes = internalTree.children.filter((c: any) => c.name === "Deco");
      expect(decoNodes.length).toBe(1);

      // 총 자식 수: Header + Badge + Content + Deco = 4
      expect(internalTree.children.length).toBe(4);
    });
  });

  describe("Scenario 2: B에 extra 요소가 위아래로 추가되어 Body가 밀림", () => {
    it("Body가 Stage 5.5로 중복 없이 매칭되어야 함", () => {
      const fixture = createMiddleInsertFixture();
      const dataManager = new DataManager(fixture);
      const treeBuilder = new TreeBuilder(dataManager);
      const internalTree = treeBuilder.buildInternalTreeDebug(fixture.info.document);

      // Body 노드가 하나만 있어야 함 (중복 없음)
      const bodyNodes = internalTree.children.filter((c: any) => c.name === "Body");
      expect(bodyNodes.length).toBe(1);

      // Body의 mergedNodes가 양쪽 variant를 포함해야 함
      const bodyMerged = bodyNodes[0].mergedNodes;
      expect(bodyMerged).toBeDefined();
      expect(bodyMerged!.length).toBeGreaterThanOrEqual(2);

      // Title도 매칭되어야 함
      const titleNodes = internalTree.children.filter((c: any) => c.name === "Title");
      expect(titleNodes.length).toBe(1);

      // Banner, Tag는 B에만 존재
      const bannerNodes = internalTree.children.filter((c: any) => c.name === "Banner");
      expect(bannerNodes.length).toBe(1);
      const tagNodes = internalTree.children.filter((c: any) => c.name === "Tag");
      expect(tagNodes.length).toBe(1);

      // 총 자식 수: Title + Banner + Body + Tag = 4
      expect(internalTree.children.length).toBe(4);
    });
  });
});
