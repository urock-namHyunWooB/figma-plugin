# DesignPatternDetector v2 Phase 1 — Pre-Merger 이동 + 기존 패턴 마이그레이션

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DesignPatternDetector를 merger 이전으로 이동하여 raw Figma 데이터에서 한 번만 실행하고, 기존 6개 패턴을 마이그레이션

**Architecture:** detect()가 raw SceneNode를 입력받아 DesignPattern[] 반환. VariantMerger가 patterns를 받아 InternalNode 생성 시 metadata.designPatterns에 복사. TreeBuilder에서 detect → merge(patterns) 순서로 단일 호출.

**Tech Stack:** TypeScript, vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `types/types.ts` | Modify | DesignPattern 타입에 nodeId 추가 |
| `processors/DesignPatternDetector.ts` | Rewrite | raw SceneNode 입력 → DesignPattern[] 반환 |
| `variant-merger/VariantMerger.ts` | Modify | merge()에 patterns 파라미터 추가, annotation 복사 |
| `TreeBuilder.ts` | Modify | detect() 호출을 merger 전 단일 호출로 변경 |
| `processors/VisibilityProcessor.ts` | No change | 이미 annotation 읽기 방식 |
| `processors/InteractionLayerStripper.ts` | No change | 이미 annotation 읽기 방식 |
| `processors/RedundantNodeCollapser.ts` | No change | 이미 annotation 읽기 방식 |
| `heuristics/module-heuristics/ModuleHeuristic.ts` | No change | 이미 annotation 읽기 방식 |
| `test/compiler/design-pattern-detector.test.ts` | Rewrite | raw 데이터 mock 기반 테스트로 전환 |

---

### Task 1: DesignPattern 타입에 nodeId 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts:48-82`
- Modify: `test/compiler/design-pattern-types.test.ts`

- [ ] **Step 1: types.ts에서 DesignPattern 타입 업데이트**

node-level 패턴에 `nodeId` 필드를 추가한다. 기존 `metadata.designPatterns`에 부착될 때는 nodeId가 불필요하지만 (이미 해당 노드에 붙어있으므로), 이제 별도 배열로 반환되므로 어떤 노드의 패턴인지 식별이 필요하다.

```typescript
export type DesignPattern =
  /** Loading overlay 시 content를 투명 마스크로 가리는 패턴 → visibility:hidden */
  | {
      type: "alphaMask";
      /** 패턴이 감지된 노드 ID */
      nodeId: string;
      /** componentPropertyReferences.visible 값 (예: "Loading#29474:0") */
      visibleRef: string;
    }
  /** hover/active 등 인터랙션 색상 표현용 Interaction 프레임 */
  | { type: "interactionFrame"; nodeId: string }
  /** 부모를 99%+ 덮는 ABSOLUTE 배경 노드 — fills를 부모에 흡수 대상 */
  | { type: "fullCoverBackground"; nodeId: string }
  /** Figma State variant 값 → CSS pseudo-class 변환 대상 (컴포넌트 레벨) */
  | {
      type: "statePseudoClass";
      /** State를 제어하는 prop 이름 (예: "state") */
      prop: string;
      /** State 값 → CSS pseudo-class 매핑 */
      stateMap: Record<string, string>;
    }
  /** Breakpoint variant → CSS @media query 변환 대상 (컴포넌트 레벨) */
  | {
      type: "breakpointVariant";
      /** Breakpoint를 제어하는 prop 이름 */
      prop: string;
    }
  /** Boolean prop에 의해 노드 위치만 좌우 이동 — merger 내부에서 감지 */
  | {
      type: "booleanPositionSwap";
      /** 패턴이 감지된 노드 ID */
      nodeId: string;
      /** 위치 이동을 제어하는 prop 이름 */
      prop: string;
    };
```

- [ ] **Step 2: 타입 테스트 업데이트**

`test/compiler/design-pattern-types.test.ts`에서 alphaMask, interactionFrame, fullCoverBackground에 nodeId 추가:

```typescript
{ type: "alphaMask", nodeId: "mask-1", visibleRef: "Loading#29474:0" },
{ type: "interactionFrame", nodeId: "i-1" },
{ type: "fullCoverBackground", nodeId: "bg-1" },
```

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: alphaMask/interactionFrame/fullCoverBackground를 사용하는 테스트들이 nodeId 누락으로 타입 에러 발생할 수 있음. 해당 테스트들도 nodeId 추가하여 수정.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add nodeId to node-level DesignPattern types"
```

---

### Task 2: DesignPatternDetector를 raw SceneNode 입력으로 변경

**Files:**
- Rewrite: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Rewrite: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: DesignPatternDetector 전면 재작성**

새 시그니처: `detect(node: SceneNode, dataManager: DataManager): DesignPattern[]`

```typescript
import type { DesignPattern } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * DesignPatternDetector
 *
 * raw Figma 데이터(SceneNode)에서 디자이너가 사용한 시각 기법을 감지한다.
 * merger 이전에 한 번만 실행되며, 감지 결과를 DesignPattern[]로 반환한다.
 *
 * 반환된 패턴은 VariantMerger가 InternalNode 생성 시 metadata.designPatterns에 복사.
 */
export class DesignPatternDetector {
  detect(node: SceneNode, dataManager: DataManager): DesignPattern[] {
    const patterns: DesignPattern[] = [];

    // COMPONENT_SET이면 variant children을 순회
    if (node.type === "COMPONENT_SET") {
      const variants = (node as any).children ?? [];
      const propDefs = (node as any).componentPropertyDefinitions ?? {};

      // 노드 레벨 패턴: 각 variant의 전체 트리 순회
      for (const variant of variants) {
        this.walkRawNode(variant, null, dataManager, patterns);
      }

      // 컴포넌트 레벨 패턴: componentPropertyDefinitions 분석
      this.detectStatePseudoClass(propDefs, patterns);
      this.detectBreakpointVariant(propDefs, patterns);
    } else {
      // 단일 COMPONENT
      this.walkRawNode(node, null, dataManager, patterns);
    }

    return patterns;
  }

  /** raw 노드 트리 순회 — 각 노드에서 패턴 감지 */
  private walkRawNode(
    node: any,
    parent: any | null,
    dataManager: DataManager,
    patterns: DesignPattern[],
  ): void {
    this.detectAlphaMask(node, patterns);
    this.detectInteractionFrame(node, patterns);
    this.detectFullCoverBackground(node, parent, patterns);

    for (const child of node.children ?? []) {
      this.walkRawNode(child, node, dataManager, patterns);
    }
  }

  // ── alphaMask ──
  private detectAlphaMask(node: any, patterns: DesignPattern[]): void {
    if (node.isMask !== true) return;
    if (node.maskType !== "ALPHA") return;
    const visibleRef = node.componentPropertyReferences?.visible;
    if (!visibleRef) return;

    // 중복 방지 (같은 nodeId로 이미 감지됨)
    if (patterns.some(p => p.type === "alphaMask" && p.nodeId === node.id)) return;
    patterns.push({ type: "alphaMask", nodeId: node.id, visibleRef });
  }

  // ── interactionFrame ──
  private detectInteractionFrame(node: any, patterns: DesignPattern[]): void {
    if (node.type !== "FRAME") return;
    if (node.name !== "Interaction") return;
    if (patterns.some(p => p.type === "interactionFrame" && p.nodeId === node.id)) return;
    patterns.push({ type: "interactionFrame", nodeId: node.id });
  }

  // ── fullCoverBackground ──
  private detectFullCoverBackground(
    node: any,
    parent: any | null,
    patterns: DesignPattern[],
  ): void {
    if (!parent) return;
    const siblings = parent.children ?? [];
    if (siblings.length <= 1) return;

    // children이 있으면 스타일 전용이 아님
    if (node.children && node.children.length > 0) return;
    if (node.type === "TEXT" || node.type === "INSTANCE") return;

    // fills만 있고 strokes/effects 없음
    if (this.hasVisibleStrokes(node)) return;
    if (this.hasVisibleEffects(node)) return;
    if (!this.hasVisibleFills(node)) return;

    // coverage 확인
    const childBox = node.absoluteBoundingBox;
    const parentBox = parent.absoluteBoundingBox;
    if (!childBox || !parentBox) return;
    if (parentBox.width === 0 || parentBox.height === 0) return;

    const wCoverage = childBox.width / parentBox.width;
    const hCoverage = childBox.height / parentBox.height;
    if (wCoverage < 0.99 || hCoverage < 0.99) return;

    // 부모에 기존 fills가 있고 다른 값이면 충돌
    if (this.hasVisibleFills(parent) && !this.sameFills(node, parent)) return;

    if (patterns.some(p => p.type === "fullCoverBackground" && p.nodeId === node.id)) return;
    patterns.push({ type: "fullCoverBackground", nodeId: node.id });
  }

  private hasVisibleFills(node: any): boolean {
    return (node.fills ?? []).some((f: any) => f.visible !== false);
  }
  private hasVisibleStrokes(node: any): boolean {
    return (node.strokes ?? []).some((s: any) => s.visible !== false);
  }
  private hasVisibleEffects(node: any): boolean {
    return (node.effects ?? []).some((e: any) => e.visible !== false);
  }
  private sameFills(a: any, b: any): boolean {
    return JSON.stringify(a.fills) === JSON.stringify(b.fills);
  }

  // ── statePseudoClass (컴포넌트 레벨) ──
  private static readonly STATE_TO_PSEUDO: Record<string, string> = {
    Hover: ":hover",     Active: ":active",     Pressed: ":active",
    hover: ":hover",     active: ":active",     pressed: ":active",
    Focus: ":focus",     Disabled: ":disabled",  Visited: ":visited",
    focus: ":focus",     disabled: ":disabled",  visited: ":visited",
    disable: ":disabled",
  };

  private detectStatePseudoClass(
    propDefs: Record<string, any>,
    patterns: DesignPattern[],
  ): void {
    for (const [key, def] of Object.entries(propDefs)) {
      const name = key.split("#")[0].trim();
      if (!/^states?$/i.test(name)) continue;
      if (def.type !== "VARIANT") continue;

      const options: string[] = def.variantOptions ?? [];
      const stateMap: Record<string, string> = {};
      for (const opt of options) {
        const pseudo = DesignPatternDetector.STATE_TO_PSEUDO[opt];
        if (pseudo) stateMap[opt] = pseudo;
      }
      if (Object.keys(stateMap).length === 0) continue;

      // camelCase 변환: "State" → "state", "States" → "states"
      const propName = name.charAt(0).toLowerCase() + name.slice(1);
      patterns.push({ type: "statePseudoClass", prop: propName, stateMap });
      return; // 하나만
    }
  }

  // ── breakpointVariant (컴포넌트 레벨) ──
  private static readonly BP_NAME_RE = /breakpoint|device|screen/i;

  private detectBreakpointVariant(
    propDefs: Record<string, any>,
    patterns: DesignPattern[],
  ): void {
    for (const [key, def] of Object.entries(propDefs)) {
      const name = key.split("#")[0].trim();
      if (def.type !== "VARIANT") continue;
      if (!DesignPatternDetector.BP_NAME_RE.test(name)) continue;

      const propName = name.charAt(0).toLowerCase() + name.slice(1);
      patterns.push({ type: "breakpointVariant", prop: propName });
      return; // 하나만
    }
  }
}
```

**주의**: fullCoverBackground는 현재 InternalTree의 mergedNodes를 사용하여 모든 variant에서 coverage를 확인한다. raw 데이터 기반으로 전환하면 **개별 variant에서** 확인하게 되는데, 모든 variant에서 커버하는지 확인하려면 variant간 교차 확인이 필요하다. 간단한 접근: **하나의 variant에서라도 조건을 만족하면 감지**하고, 실제 처리(흡수) 시 variant별 검증은 기존 RedundantNodeCollapser가 이미 수행하므로 안전하다. 단, 기존 `isFullCoverStyleOnly` 함수도 여전히 RedundantNodeCollapser에 export되어 있으므로, 감지가 raw에서 이뤄져도 처리 시 이중 확인이 가능하다.

- [ ] **Step 2: 테스트 전면 재작성**

`test/compiler/design-pattern-detector.test.ts`를 raw SceneNode mock 기반으로 전환:

```typescript
import { describe, it, expect } from "vitest";
import { DesignPatternDetector } from "@code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";

const detector = new DesignPatternDetector();

describe("DesignPatternDetector (raw data)", () => {
  describe("alphaMask", () => {
    it("isMask + ALPHA + visible ref → alphaMask pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT",
          name: "Default",
          children: [{
            type: "FRAME", id: "wrapper", name: "Wrapper", children: [
              {
                id: "mask-1", type: "RECTANGLE", name: "Mask",
                isMask: true, maskType: "ALPHA",
                componentPropertyReferences: { visible: "Loading#29474:0" },
                children: [],
              },
              { id: "content-1", type: "FRAME", name: "Content", children: [] },
            ],
          }],
        }],
      } as any;

      const patterns = detector.detect(node, null as any);
      expect(patterns).toContainEqual({
        type: "alphaMask", nodeId: "mask-1", visibleRef: "Loading#29474:0",
      });
    });
  });

  describe("interactionFrame", () => {
    it("name=Interaction + type=FRAME → interactionFrame pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [
            { id: "i-1", type: "FRAME", name: "Interaction", children: [] },
          ],
        }],
      } as any;

      const patterns = detector.detect(node, null as any);
      expect(patterns).toContainEqual({ type: "interactionFrame", nodeId: "i-1" });
    });
  });

  describe("statePseudoClass", () => {
    it("State variant prop → statePseudoClass pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "State": { type: "VARIANT", variantOptions: ["Default", "Hover", "Active", "Disabled"] },
        },
        children: [],
      } as any;

      const patterns = detector.detect(node, null as any);
      expect(patterns).toContainEqual({
        type: "statePseudoClass",
        prop: "state",
        stateMap: { Hover: ":hover", Active: ":active", Disabled: ":disabled" },
      });
    });
  });

  describe("breakpointVariant", () => {
    it("Breakpoint variant prop → breakpointVariant pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Breakpoint": { type: "VARIANT", variantOptions: ["Mobile(xs-sm)", "Desktop(md-lg)"] },
        },
        children: [],
      } as any;

      const patterns = detector.detect(node, null as any);
      expect(patterns).toContainEqual({ type: "breakpointVariant", prop: "breakpoint" });
    });
  });

  describe("fullCoverBackground", () => {
    it("fills-only child covering parent → fullCoverBackground pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{
            id: "parent-1", type: "FRAME", name: "Root",
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
            fills: [],
            children: [
              {
                id: "bg-1", type: "RECTANGLE", name: "BG",
                absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
                fills: [{ type: "SOLID", visible: true }],
                strokes: [], effects: [], children: [],
              },
              { id: "content-1", type: "FRAME", name: "Content", children: [] },
            ],
          }],
        }],
      } as any;

      const patterns = detector.detect(node, null as any);
      expect(patterns).toContainEqual({ type: "fullCoverBackground", nodeId: "bg-1" });
    });
  });

  describe("중복 제거", () => {
    it("같은 nodeId로 여러 variant에서 감지되어도 하나만 등록", () => {
      const maskNode = {
        id: "mask-1", type: "RECTANGLE", name: "Mask",
        isMask: true, maskType: "ALPHA",
        componentPropertyReferences: { visible: "Loading#29474:0" },
        children: [],
      };
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [
          { type: "COMPONENT", name: "V1", children: [{ ...maskNode }] },
          { type: "COMPONENT", name: "V2", children: [{ ...maskNode }] },
        ],
      } as any;

      const patterns = detector.detect(node, null as any);
      const alphaMasks = patterns.filter(p => p.type === "alphaMask");
      expect(alphaMasks).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: rewrite DesignPatternDetector for raw SceneNode input"
```

---

### Task 3: VariantMerger에 annotation 복사 로직 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger.ts`

- [ ] **Step 1: merge() 시그니처에 patterns 파라미터 추가**

```typescript
// Before:
public merge(document: SceneNode): InternalTree

// After:
public merge(document: SceneNode, patterns?: DesignPattern[]): InternalTree
```

- [ ] **Step 2: InternalNode 생성 후 annotation 복사 로직 추가**

merge() 메서드 끝, 트리 반환 직전에 patterns를 InternalNode에 복사하는 헬퍼 호출:

```typescript
if (patterns && patterns.length > 0) {
  this.applyPatternAnnotations(tree, patterns);
}
return tree;
```

헬퍼 메서드:

```typescript
/**
 * DesignPatternDetector가 반환한 패턴을 InternalNode에 복사.
 * - nodeId가 있는 패턴: 해당 InternalNode의 metadata.designPatterns에 추가
 * - nodeId가 없는 패턴 (컴포넌트 레벨): root에 추가
 *
 * nodeId 매칭: InternalNode.id 또는 mergedNodes[].id와 비교
 */
private applyPatternAnnotations(root: InternalTree, patterns: DesignPattern[]): void {
  const nodePatterns = patterns.filter(p => "nodeId" in p) as Array<DesignPattern & { nodeId: string }>;
  const componentPatterns = patterns.filter(p => !("nodeId" in p));

  // 컴포넌트 레벨 패턴은 root에 부착
  for (const pattern of componentPatterns) {
    if (!root.metadata) root.metadata = {};
    if (!root.metadata.designPatterns) root.metadata.designPatterns = [];
    root.metadata.designPatterns.push(pattern);
  }

  // 노드 레벨 패턴은 nodeId로 매칭하여 부착
  if (nodePatterns.length === 0) return;

  const patternsByNodeId = new Map<string, DesignPattern[]>();
  for (const p of nodePatterns) {
    if (!patternsByNodeId.has(p.nodeId)) patternsByNodeId.set(p.nodeId, []);
    patternsByNodeId.get(p.nodeId)!.push(p);
  }

  this.walkAndAnnotate(root, patternsByNodeId);
}

private walkAndAnnotate(
  node: InternalNode,
  patternsByNodeId: Map<string, DesignPattern[]>,
): void {
  // InternalNode.id로 직접 매칭
  const directMatch = patternsByNodeId.get(node.id);
  if (directMatch) {
    if (!node.metadata) node.metadata = {};
    if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
    node.metadata.designPatterns.push(...directMatch);
  }

  // mergedNodes의 id로도 매칭 (variant별 다른 id를 가진 경우)
  for (const merged of node.mergedNodes ?? []) {
    if (merged.id === node.id) continue; // 이미 처리
    const mergedMatch = patternsByNodeId.get(merged.id);
    if (mergedMatch) {
      if (!node.metadata) node.metadata = {};
      if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
      // 중복 방지
      for (const p of mergedMatch) {
        const key = JSON.stringify(p);
        if (!node.metadata.designPatterns.some(existing => JSON.stringify(existing) === key)) {
          node.metadata.designPatterns.push(p);
        }
      }
    }
  }

  for (const child of node.children) {
    this.walkAndAnnotate(child, patternsByNodeId);
  }
}
```

- [ ] **Step 3: 테스트 — annotation이 InternalNode에 복사되는지 확인**

기존 fixture 기반 컴파일 테스트를 실행하여 annotation이 제대로 전달되는지 확인:

Run: `npx vitest run`
Expected: 기존 테스트 모두 PASS (merger가 patterns를 받지 않으면 기존 동작 유지)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add pattern annotation transfer to VariantMerger"
```

---

### Task 4: TreeBuilder 배선 — 단일 detect() 호출 + 기존 호출 제거

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`

- [ ] **Step 1: DesignPatternDetector 인스턴스 생성 방식 변경**

더 이상 DataManager를 constructor에서 받을 필요 없음 (detect가 파라미터로 받으므로):

```typescript
// Before:
this.designPatternDetector = new DesignPatternDetector(dataManager);

// After:
this.designPatternDetector = new DesignPatternDetector();
```

- [ ] **Step 2: build()에서 detect()를 merger 전 단일 호출로 변경**

```typescript
public build(node: SceneNode): UITree {
  // Step 0: 디자인 패턴 감지 (merger 이전, 한 번만)
  const patterns = this.designPatternDetector.detect(node, this.dataManager);

  // Step 1: 변형 병합 (패턴 힌트 전달)
  let tree = this.variantMerger.merge(node, patterns);

  // Step 1.0 삭제: this.designPatternDetector.detect(tree) 제거
  // Step 1.1: Interaction layer strip (annotation 소비 — 변경 없음)
  this._strippedInteractionComponentIds = stripInteractionLayers(tree, this.dataManager);

  // Step 1.2: 불필요 노드 제거 (annotation 소비 — 변경 없음)
  collapseRedundantNodes(tree, this.dataManager);

  // ...

  let props = this.propsExtractor.extract(node, tree.mergedNodes);

  // Step 2.5 삭제: this.designPatternDetector.detect(tree, props) 제거

  // 나머지 파이프라인 동일
}
```

- [ ] **Step 3: buildInternalTreeDebug()에서도 동일하게 변경**

```typescript
public buildInternalTreeDebug(node: SceneNode, options?: { skipInteractionStripper?: boolean }): InternalTree {
  const patterns = this.designPatternDetector.detect(node, this.dataManager);
  const tree = this.variantMerger.merge(node, patterns);
  if (!options?.skipInteractionStripper) {
    stripInteractionLayers(tree, this.dataManager);
  }
  return tree;
}
```

- [ ] **Step 4: fallbackStateToPseudo()에서 annotation 읽기 방식 유지 확인**

현재 `fallbackStateToPseudo`는 `tree.metadata?.designPatterns`에서 statePseudoClass를 읽는다. merger가 컴포넌트 레벨 패턴을 root에 부착하므로 동작이 동일해야 한다. 변경 불필요.

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 모든 테스트 PASS. 기존 processor들은 이미 `metadata.designPatterns` annotation을 읽는 방식이므로, annotation이 merger에서 복사되면 동일하게 동작.

만약 실패하는 테스트가 있으면:
- annotation 복사 로직의 nodeId 매칭 문제일 가능성 높음
- merger가 생성하는 InternalNode.id와 raw 데이터의 node.id가 다를 수 있음 (INSTANCE children의 compound ID)
- 이 경우 walkAndAnnotate의 매칭 로직 디버깅 필요

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor: move detect() before merger — single execution point"
```

---

### Task 5: 기존 isFullCoverStyleOnly 의존성 정리

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/RedundantNodeCollapser.ts`

- [ ] **Step 1: DesignPatternDetector에서 isFullCoverStyleOnly import 제거**

이전 v1에서는 `import { isFullCoverStyleOnly } from "./RedundantNodeCollapser"`를 사용했지만, 이제 raw 데이터 기반으로 자체 구현했으므로 import 제거.

- [ ] **Step 2: RedundantNodeCollapser에서 export 되돌리기**

Task 5 (v1)에서 `isFullCoverStyleOnly`에 export를 추가했는데, 더 이상 외부에서 사용하지 않으므로 export 제거하여 원래 module-scoped function으로 복원.

단, `absorbFullCoverChildren`에서 여전히 annotation 읽기 방식(`child.metadata?.designPatterns?.some(p => p.type === "fullCoverBackground")`)을 사용하는데, raw 데이터 기반 감지가 **단일 variant에서만** 확인하므로 모든 variant에서 커버하는지 이중 확인이 필요할 수 있다.

**안전한 접근**: annotation이 있으면 처리하되, annotation이 없는 경우에도 기존 `isFullCoverStyleOnly`로 fallback. 이렇게 하면 raw 감지가 놓친 케이스도 잡을 수 있다:

```typescript
// absorbFullCoverChildren 내부:
const hasAnnotation = child.metadata?.designPatterns?.some(p => p.type === "fullCoverBackground");
if (hasAnnotation || isFullCoverStyleOnly(child, node, dataManager)) {
```

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: clean up fullCoverBackground detection dependencies"
```

---

### Task 6: prop 이름 정규화 일관성 확인

**Files:**
- Possibly modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Possibly modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`

- [ ] **Step 1: statePseudoClass prop 이름 정규화 검증**

현재 DesignPatternDetector는 componentPropertyDefinitions의 key에서 prop 이름을 추출한다:
- `"State"` → `"state"` (charAt(0).toLowerCase())

기존 코드에서는 PropsExtractor가 정규화한 `PropDefinition.name`을 사용했다.
두 방식이 같은 결과를 내는지 확인 필요.

PropsExtractor의 정규화 로직을 읽어서, componentPropertyDefinitions key → PropsExtractor name이 어떻게 변환되는지 확인.
만약 차이가 있으면 DesignPatternDetector의 정규화를 PropsExtractor와 동일하게 맞춘다.

- [ ] **Step 2: breakpointVariant prop 이름 동일 검증**

마찬가지로 breakpoint prop 이름이 PropsExtractor 결과와 일치하는지 확인.

- [ ] **Step 3: 통합 테스트로 검증**

Buttonsolid fixture와 Breakpoint fixture를 사용하는 기존 테스트가 통과하면 정규화가 올바른 것:

Run: `npx vitest run test/compiler/allFixtures.test.ts`
Run: `npx vitest run test/snapshots/uiTreeSnapshot.test.ts`
Expected: 기존 결과와 동일

- [ ] **Step 4: 필요 시 수정 + Commit**

```bash
git commit -m "fix: align prop name normalization between detector and PropsExtractor"
```

---

### Task 7: 스냅샷 업데이트 + 최종 검증

**Files:**
- Possibly modify: `test/snapshots/` snapshot files

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`

- [ ] **Step 2: snapshot 변경이 있으면 diff 확인 후 업데이트**

metadata.designPatterns의 구조가 변경되었을 수 있음 (nodeId 추가 등).
변경이 의도한 것인지 확인 후:

Run: `npx vitest run -u`

- [ ] **Step 3: 최종 전체 테스트 실행**

Run: `npx vitest run`
Expected: pre-existing 실패 2건(Tailwind 타입 체크, show cva) 외 모두 PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "test: update snapshots for DesignPatternDetector v2"
```
