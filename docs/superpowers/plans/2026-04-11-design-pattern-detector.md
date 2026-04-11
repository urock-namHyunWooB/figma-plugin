# DesignPatternDetector 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자인 패턴 감지 로직을 DesignPatternDetector로 집약하고, 기존 processor들이 annotation을 소비하도록 전환

**Architecture:** DesignPatternDetector가 VariantMerger 직후 InternalTree를 순회하며 6개 패턴을 감지하고 `metadata.designPatterns`에 annotation 부착. 기존 processor들은 자체 감지 로직을 제거하고 annotation을 읽어서 처리만 수행.

**Tech Stack:** TypeScript, vitest

---

### Task 1: DesignPattern 타입 정의 + InternalNode metadata 확장

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts:350-359`

- [ ] **Step 1: Write the failing test**

```typescript
// test/compiler/design-pattern-types.test.ts
import { describe, it, expect } from "vitest";
import type { InternalNode, DesignPattern } from "@code-generator2/types/types";

describe("DesignPattern types", () => {
  it("alphaMask annotation이 metadata.designPatterns에 할당 가능", () => {
    const pattern: DesignPattern = {
      type: "alphaMask",
      triggerProp: "loading",
      condition: { type: "truthy", prop: "loading" },
    };
    const node = { metadata: { designPatterns: [pattern] } } as Partial<InternalNode>;
    expect(node.metadata!.designPatterns![0].type).toBe("alphaMask");
  });

  it("모든 패턴 타입이 할당 가능", () => {
    const patterns: DesignPattern[] = [
      { type: "alphaMask", triggerProp: "loading", condition: { type: "truthy", prop: "loading" } },
      { type: "interactionFrame" },
      { type: "fullCoverBackground" },
      { type: "statePseudoClass", prop: "state", stateMap: { Hover: ":hover" } },
      { type: "breakpointVariant", prop: "breakpoint" },
      { type: "booleanPositionSwap", prop: "active" },
    ];
    expect(patterns).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-types.test.ts`
Expected: FAIL — `DesignPattern` 타입이 존재하지 않음

- [ ] **Step 3: types.ts에 DesignPattern 타입 추가 + metadata 확장**

`src/frontend/ui/domain/code-generator2/types/types.ts`에 추가:

```typescript
// ConditionNode 정의 뒤, PseudoClass 정의 전 (line 47 부근)에 삽입:

/**
 * 디자이너가 사용한 시각 기법(디자인 패턴)의 감지 결과.
 * DesignPatternDetector가 부착하고, 후속 processor가 소비한다.
 */
export type DesignPattern =
  /** Loading overlay 시 content를 투명 마스크로 가리는 패턴 → visibility:hidden */
  | {
      type: "alphaMask";
      /** 마스크를 토글하는 prop 이름 (예: "loading") */
      triggerProp: string;
      /** Content에 부여할 visibility 조건 */
      condition: ConditionNode;
    }
  /** hover/active 등 인터랙션 색상 표현용 Interaction 프레임 */
  | { type: "interactionFrame" }
  /** 부모를 99%+ 덮는 ABSOLUTE 배경 노드 — fills를 부모에 흡수 대상 */
  | { type: "fullCoverBackground" }
  /** Figma State variant 값 → CSS pseudo-class 변환 대상 */
  | {
      type: "statePseudoClass";
      /** State를 제어하는 prop 이름 (예: "state") */
      prop: string;
      /** State 값 → CSS pseudo-class 매핑 (예: { "Hover": ":hover" }) */
      stateMap: Record<string, string>;
    }
  /** Breakpoint variant → CSS @media query 변환 대상 */
  | {
      type: "breakpointVariant";
      /** Breakpoint를 제어하는 prop 이름 (예: "breakpoint") */
      prop: string;
    }
  /** Boolean prop에 의해 노드 위치만 좌우 이동 (Switch 노브 등) — 매칭 힌트 */
  | {
      type: "booleanPositionSwap";
      /** 위치 이동을 제어하는 prop 이름 (예: "active") */
      prop: string;
    };
```

metadata 확장 (`types.ts` line 350-359 부근):

```typescript
  metadata?: {
    vectorSvg?: string;
    instanceOverrides?: InstanceOverride[];
    vectorColorMap?: Record<string, string>;
    layoutOverrides?: Record<string, Record<string, string>>;
    /** 디자인 패턴 감지 결과 (DesignPatternDetector가 부착) */
    designPatterns?: DesignPattern[];
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/types/types.ts test/compiler/design-pattern-types.test.ts
git commit -m "feat: add DesignPattern type and metadata.designPatterns field"
```

---

### Task 2: DesignPatternDetector 빈 껍데기 + 파이프라인 등록

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts:89-90`

- [ ] **Step 1: Write the failing test**

```typescript
// test/compiler/design-pattern-detector.test.ts
import { describe, it, expect } from "vitest";
import { DesignPatternDetector } from "@code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";

describe("DesignPatternDetector", () => {
  it("detect()가 InternalTree를 받아 에러 없이 실행된다", () => {
    const detector = new DesignPatternDetector(null as any);
    const tree = { id: "root", name: "Root", type: "FRAME", children: [] } as any;
    expect(() => detector.detect(tree)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL — 모듈이 존재하지 않음

- [ ] **Step 3: DesignPatternDetector 빈 클래스 생성**

```typescript
// src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts
import type { InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * DesignPatternDetector
 *
 * InternalTree를 순회하며 디자이너가 사용한 시각 기법(디자인 패턴)을 감지하고
 * 해당 노드의 metadata.designPatterns에 annotation을 부착한다.
 *
 * 감지만 수행하며, 처리(transform)는 후속 processor가 annotation을 읽어 수행한다.
 */
export class DesignPatternDetector {
  constructor(private readonly dataManager: DataManager) {}

  detect(tree: InternalTree): void {
    // 패턴별 감지 메서드는 이후 Task에서 추가
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: TreeBuilder에 파이프라인 등록**

`TreeBuilder.ts`에서 import 추가 및 Step 1.0 삽입:

```typescript
// import 추가 (line 16 부근)
import { DesignPatternDetector } from "./processors/DesignPatternDetector";

// constructor에 필드 추가
private readonly designPatternDetector: DesignPatternDetector;

// constructor 내부
this.designPatternDetector = new DesignPatternDetector(dataManager);

// build() 메서드, Step 1 직후 (line 89-90 부근)
// Step 1.0: 디자인 패턴 감지 (annotation 부착)
this.designPatternDetector.detect(tree);
```

- [ ] **Step 6: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 모두 PASS (빈 detect는 아무것도 안 하므로)

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "feat: add empty DesignPatternDetector + pipeline registration"
```

---

### Task 3: alphaMask 감지 마이그레이션

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VisibilityProcessor.ts:747-759`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: DesignPatternDetector에 alphaMask 감지 테스트 추가**

```typescript
// test/compiler/design-pattern-detector.test.ts에 추가
import type { InternalNode } from "@code-generator2/types/types";

describe("detectAlphaMasks", () => {
  it("isMask + ALPHA + visible ref → alphaMask annotation 부착", () => {
    const mockDataManager = {
      getById: (id: string) => ({
        node: {
          id: "mask-1",
          isMask: true,
          maskType: "ALPHA",
        },
      }),
    } as any;

    const detector = new DesignPatternDetector(mockDataManager);
    const maskNode: any = {
      id: "mask-1",
      name: "Mask",
      type: "RECTANGLE",
      children: [],
      componentPropertyReferences: { visible: "Loading#29474:0" },
      visibleCondition: { type: "truthy", prop: "loading" },
    };
    const tree: any = {
      id: "root",
      name: "Root",
      type: "FRAME",
      children: [maskNode],
    };

    detector.detect(tree);

    expect(maskNode.metadata?.designPatterns).toEqual([
      {
        type: "alphaMask",
        triggerProp: "loading",
        condition: { type: "truthy", prop: "loading" },
      },
    ]);
  });

  it("isMask=false → annotation 부착하지 않음", () => {
    const mockDataManager = {
      getById: () => ({ node: { isMask: false } }),
    } as any;

    const detector = new DesignPatternDetector(mockDataManager);
    const node: any = {
      id: "n1",
      name: "N",
      type: "RECTANGLE",
      children: [],
      componentPropertyReferences: { visible: "Loading#29474:0" },
    };
    const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };

    detector.detect(tree);
    expect(node.metadata?.designPatterns).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL — `detectAlphaMasks` 미구현

- [ ] **Step 3: DesignPatternDetector에 alphaMask 감지 구현**

`DesignPatternDetector.ts`에 추가:

```typescript
import type { InternalTree, InternalNode, DesignPattern } from "../../../../types/types";

export class DesignPatternDetector {
  constructor(private readonly dataManager: DataManager) {}

  detect(tree: InternalTree): void {
    this.walk(tree, (node) => {
      this.detectAlphaMask(node);
    });
  }

  private walk(node: InternalNode, visitor: (n: InternalNode) => void): void {
    visitor(node);
    for (const child of node.children ?? []) {
      this.walk(child, visitor);
    }
  }

  private addPattern(node: InternalNode, pattern: DesignPattern): void {
    if (!node.metadata) node.metadata = {};
    if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
    node.metadata.designPatterns.push(pattern);
  }

  /**
   * Alpha mask 감지: isMask + ALPHA + componentPropertyReferences.visible
   * 감지 시 해당 노드에 alphaMask annotation 부착.
   */
  private detectAlphaMask(node: InternalNode): void {
    const visibleRef = node.componentPropertyReferences?.visible;
    if (!visibleRef) return;

    const { node: origNode } = this.dataManager.getById(node.id);
    if (!origNode) return;

    const orig = origNode as any;
    if (orig.isMask !== true) return;
    if (orig.maskType !== "ALPHA") return;

    if (!node.visibleCondition) return;

    // visibleCondition에서 prop 이름 추출
    const triggerProp = this.extractPropFromCondition(node.visibleCondition);
    if (!triggerProp) return;

    this.addPattern(node, {
      type: "alphaMask",
      triggerProp,
      condition: node.visibleCondition,
    });
  }

  /** ConditionNode에서 최상위 prop 이름 추출 */
  private extractPropFromCondition(condition: import("../../../../types/types").ConditionNode): string | null {
    if ("prop" in condition) return condition.prop;
    if (condition.type === "not") return this.extractPropFromCondition(condition.condition);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: VisibilityProcessor에서 annotation 읽기로 전환**

`VisibilityProcessor.ts`의 `processAlphaMasks` 메서드에서 `detectAlphaMask()` 호출을 `metadata.designPatterns` 읽기로 교체:

```typescript
// Before (processAlphaMasks 내부):
const visibleRef = this.detectAlphaMask(node);
if (!visibleRef) continue;

// After:
const alphaMask = node.metadata?.designPatterns?.find(p => p.type === "alphaMask");
if (!alphaMask) continue;
// alphaMask.triggerProp과 alphaMask.condition을 사용
```

`detectAlphaMask` private 메서드는 제거.

- [ ] **Step 6: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 모두 PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VisibilityProcessor.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "refactor: migrate alphaMask detection to DesignPatternDetector"
```

---

### Task 4: interactionFrame 감지 마이그레이션

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts:18-22`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: interactionFrame 감지 테스트 추가**

```typescript
describe("detectInteractionFrames", () => {
  it("name=Interaction + type=FRAME → interactionFrame annotation 부착", () => {
    const detector = new DesignPatternDetector(null as any);
    const node: any = {
      id: "i1",
      name: "Interaction",
      type: "FRAME",
      children: [],
    };
    const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };

    detector.detect(tree);

    expect(node.metadata?.designPatterns).toEqual([{ type: "interactionFrame" }]);
  });

  it("name=Interaction + type=INSTANCE → 부착 안 함", () => {
    const detector = new DesignPatternDetector(null as any);
    const node: any = {
      id: "i2",
      name: "Interaction",
      type: "INSTANCE",
      children: [],
    };
    const tree: any = { id: "root", name: "Root", type: "FRAME", children: [node] };

    detector.detect(tree);
    expect(node.metadata?.designPatterns).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: detectInteractionFrame 구현**

`DesignPatternDetector.ts`의 `detect()`에 호출 추가, 메서드 구현:

```typescript
detect(tree: InternalTree): void {
  this.walk(tree, (node) => {
    this.detectAlphaMask(node);
    this.detectInteractionFrame(node);
  });
}

private detectInteractionFrame(node: InternalNode): void {
  if (node.type !== "FRAME") return;
  if (node.name !== "Interaction") return;
  this.addPattern(node, { type: "interactionFrame" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: InteractionLayerStripper에서 annotation 읽기로 전환**

```typescript
// Before (isInteractionLayer):
export function isInteractionLayer(node: InternalNode): boolean {
  if (node.type !== "FRAME") return false;
  if (node.name !== "Interaction") return false;
  return true;
}

// After:
export function isInteractionLayer(node: InternalNode): boolean {
  return node.metadata?.designPatterns?.some(p => p.type === "interactionFrame") ?? false;
}
```

- [ ] **Step 6: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "refactor: migrate interactionFrame detection to DesignPatternDetector"
```

---

### Task 5: fullCoverBackground 감지 마이그레이션

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/RedundantNodeCollapser.ts:97-134`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: fullCoverBackground 감지 테스트 추가**

```typescript
describe("detectFullCoverBackgrounds", () => {
  it("children 없고 부모를 99%+ 덮는 fills-only 노드 → fullCoverBackground annotation", () => {
    const mockDataManager = {
      getById: (id: string) => {
        if (id === "bg-1") {
          return {
            node: {
              id: "bg-1",
              fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }],
              strokes: [],
              effects: [],
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
            },
          };
        }
        if (id === "parent-1") {
          return {
            node: {
              id: "parent-1",
              fills: [],
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
              children: [{ id: "bg-1" }, { id: "content-1" }],
            },
          };
        }
        return { node: null };
      },
    } as any;

    const detector = new DesignPatternDetector(mockDataManager);
    const bgNode: any = {
      id: "bg-1",
      name: "Background",
      type: "RECTANGLE",
      children: [],
      mergedNodes: [{ id: "bg-1", variantName: "Default" }],
    };
    const contentNode: any = {
      id: "content-1",
      name: "Content",
      type: "FRAME",
      children: [],
    };
    const tree: any = {
      id: "parent-1",
      name: "Parent",
      type: "FRAME",
      children: [bgNode, contentNode],
    };

    detector.detect(tree);

    expect(bgNode.metadata?.designPatterns).toEqual([{ type: "fullCoverBackground" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: detectFullCoverBackground 구현**

DesignPatternDetector에 추가. `RedundantNodeCollapser`의 `isFullCoverStyleOnly` 로직을 이식:

```typescript
detect(tree: InternalTree): void {
  this.walk(tree, (node) => {
    this.detectAlphaMask(node);
    this.detectInteractionFrame(node);
  });
  // fullCoverBackground는 부모-자식 관계가 필요하므로 별도 순회
  this.detectFullCoverBackgrounds(tree);
}

private detectFullCoverBackgrounds(node: InternalNode): void {
  for (const child of node.children ?? []) {
    this.detectFullCoverBackgrounds(child);
  }

  const siblings = node.children ?? [];
  if (siblings.length < 2) return;

  for (const child of siblings) {
    if (this.isFullCoverStyleOnly(child, node)) {
      this.addPattern(child, { type: "fullCoverBackground" });
    }
  }
}

private isFullCoverStyleOnly(child: InternalNode, parent: InternalNode): boolean {
  if (child.children && child.children.length > 0) return false;
  if (child.type === "TEXT" || child.type === "INSTANCE") return false;

  const siblings = parent.children ?? [];
  if (siblings.length <= 1) return false;

  const mergedNodes = child.mergedNodes ?? [];
  if (mergedNodes.length === 0) return false;

  for (const merged of mergedNodes) {
    const rawChild = this.dataManager.getById(merged.id)?.node as any;
    if (!rawChild) return false;
    if (hasVisibleStrokes(rawChild)) return false;
    if (hasVisibleEffects(rawChild)) return false;
    if (!hasVisibleFills(rawChild)) return false;

    const parentRaw = this.findParentRawNode(merged.id, parent);
    if (!parentRaw) return false;
    if (!isFullyCovering(rawChild, parentRaw)) return false;
    if (hasVisibleFills(parentRaw) && !sameFills(rawChild, parentRaw)) return false;
  }
  return true;
}
```

헬퍼 함수 `hasVisibleFills`, `hasVisibleStrokes`, `hasVisibleEffects`, `isFullyCovering`, `sameFills`, `findParentRawNode`은 `RedundantNodeCollapser.ts`에서 export하여 공유하거나, 새 유틸 파일로 추출.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: RedundantNodeCollapser에서 annotation 읽기로 전환**

```typescript
// Before (absorbFullCoverChildren 내부):
if (isFullCoverStyleOnly(child, node, dataManager)) {

// After:
if (child.metadata?.designPatterns?.some(p => p.type === "fullCoverBackground")) {
```

`isFullCoverStyleOnly` 함수는 제거 (감지 로직이 DesignPatternDetector로 이동했으므로).
단, 헬퍼 함수들(`hasVisibleFills` 등)은 유틸로 남겨두어 양쪽에서 사용 가능하게 유지.

- [ ] **Step 6: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/RedundantNodeCollapser.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "refactor: migrate fullCoverBackground detection to DesignPatternDetector"
```

---

### Task 6: statePseudoClass 감지 마이그레이션

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/StyleProcessor.ts:44-68`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: statePseudoClass 감지 테스트 추가**

```typescript
describe("detectStatePseudoClasses", () => {
  it("State prop의 CSS 변환 가능 값 → statePseudoClass annotation 부착", () => {
    const detector = new DesignPatternDetector(null as any);
    // statePseudoClass는 트리 레벨이 아닌 prop 레벨 감지이므로
    // detect에 props를 전달해야 한다
    const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
    const props = [
      { name: "state", type: "variant", sourceKey: "State", options: ["Default", "Hover", "Active", "Disabled"] },
    ];

    detector.detect(tree, props);

    expect(tree.metadata?.designPatterns).toContainEqual({
      type: "statePseudoClass",
      prop: "state",
      stateMap: {
        Hover: ":hover",
        Active: ":active",
        Disabled: ":disabled",
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: detectStatePseudoClass 구현**

`detect()` 시그니처를 확장하여 props를 선택적으로 받도록 변경:

```typescript
detect(tree: InternalTree, props?: PropDefinition[]): void {
  this.walk(tree, (node) => {
    this.detectAlphaMask(node);
    this.detectInteractionFrame(node);
  });
  this.detectFullCoverBackgrounds(tree);
  if (props) {
    this.detectStatePseudoClass(tree, props);
  }
}

private static readonly STATE_TO_PSEUDO: Record<string, string> = {
  Hover: ":hover",     Active: ":active",     Pressed: ":active",
  hover: ":hover",     active: ":active",     pressed: ":active",
  Focus: ":focus",     Disabled: ":disabled",  Visited: ":visited",
  focus: ":focus",     disabled: ":disabled",  visited: ":visited",
  disable: ":disabled",
};

private detectStatePseudoClass(tree: InternalTree, props: PropDefinition[]): void {
  const stateProp = props.find(
    (p) => p.sourceKey.toLowerCase() === "state" || p.sourceKey.toLowerCase() === "states"
  );
  if (!stateProp || stateProp.type !== "variant" || !stateProp.options?.length) return;

  const stateMap: Record<string, string> = {};
  for (const opt of stateProp.options) {
    const pseudo = DesignPatternDetector.STATE_TO_PSEUDO[opt];
    if (pseudo) {
      stateMap[opt] = pseudo;
    }
  }

  if (Object.keys(stateMap).length === 0) return;

  this.addPattern(tree, {
    type: "statePseudoClass",
    prop: stateProp.name,
    stateMap,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: StyleProcessor + TreeBuilder fallbackStateToPseudo에서 annotation 참조**

`StyleProcessor.ts`의 `CSS_CONVERTIBLE_STATES`와 `STATE_TO_PSEUDO`는 유지하되(다른 곳에서도 사용),
`TreeBuilder.fallbackStateToPseudo()`에서 annotation을 참조하여 state prop 감지를 생략:

```typescript
// Before (TreeBuilder.fallbackStateToPseudo):
const stateIdx = props.findIndex(
  (p) => p.sourceKey.toLowerCase() === "state" || p.sourceKey.toLowerCase() === "states"
);

// After — annotation에서 가져옴:
const statePattern = tree.metadata?.designPatterns?.find(
  (p): p is Extract<DesignPattern, { type: "statePseudoClass" }> => p.type === "statePseudoClass"
);
if (!statePattern) return;
const stateIdx = props.findIndex((p) => p.name === statePattern.prop);
```

- [ ] **Step 6: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/StyleProcessor.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "refactor: migrate statePseudoClass detection to DesignPatternDetector"
```

---

### Task 7: breakpointVariant 감지 마이그레이션

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/heuristics/module-heuristics/ModuleHeuristic.ts`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: breakpointVariant 감지 테스트 추가**

```typescript
describe("detectBreakpointVariants", () => {
  it("breakpoint/device/screen prop → breakpointVariant annotation 부착", () => {
    const detector = new DesignPatternDetector(null as any);
    const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
    const props = [
      { name: "breakpoint", type: "variant", sourceKey: "Breakpoint", options: ["Mobile(xs-sm)", "Desktop(md-lg)"] },
    ];

    detector.detect(tree, props);

    expect(tree.metadata?.designPatterns).toContainEqual({
      type: "breakpointVariant",
      prop: "breakpoint",
    });
  });

  it("breakpoint가 아닌 prop → annotation 부착하지 않음", () => {
    const detector = new DesignPatternDetector(null as any);
    const tree: any = { id: "root", name: "Root", type: "FRAME", children: [] };
    const props = [
      { name: "size", type: "variant", sourceKey: "Size", options: ["Large", "Small"] },
    ];

    detector.detect(tree, props);
    expect(tree.metadata?.designPatterns).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL

- [ ] **Step 3: detectBreakpointVariant 구현**

```typescript
private static readonly BREAKPOINT_PATTERN = /^(breakpoint|device|screen|responsive)/i;

detect(tree: InternalTree, props?: PropDefinition[]): void {
  this.walk(tree, (node) => {
    this.detectAlphaMask(node);
    this.detectInteractionFrame(node);
  });
  this.detectFullCoverBackgrounds(tree);
  if (props) {
    this.detectStatePseudoClass(tree, props);
    this.detectBreakpointVariant(tree, props);
  }
}

private detectBreakpointVariant(tree: InternalTree, props: PropDefinition[]): void {
  const bpProp = props.find(
    (p) => p.type === "variant" && DesignPatternDetector.BREAKPOINT_PATTERN.test(p.sourceKey)
  );
  if (!bpProp) return;

  this.addPattern(tree, {
    type: "breakpointVariant",
    prop: bpProp.name,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: ModuleHeuristic에서 annotation 읽기로 전환**

`ModuleHeuristic.ts`에서 breakpoint prop 탐색 로직을 annotation 읽기로 교체:

```typescript
// Before:
const bpIdx = props.findIndex(p => BREAKPOINT_PATTERN.test(p.sourceKey));

// After:
const bpPattern = tree.metadata?.designPatterns?.find(p => p.type === "breakpointVariant");
if (!bpPattern) return;
const bpIdx = props.findIndex(p => p.name === bpPattern.prop);
```

- [ ] **Step 6: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/heuristics/module-heuristics/ModuleHeuristic.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "refactor: migrate breakpointVariant detection to DesignPatternDetector"
```

---

### Task 8: booleanPositionSwap annotation 기록

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/BooleanPositionSwap.ts:153-157`
- Modify: `test/compiler/design-pattern-detector.test.ts`

BooleanPositionSwap은 merger 내부에서 동작하므로 감지를 이동하지 않고,
매칭 성공 시 annotation을 **추가 기록**만 한다.

- [ ] **Step 1: annotation 기록 테스트 추가**

```typescript
describe("BooleanPositionSwap annotation", () => {
  it("decisive-match 시 양쪽 노드에 booleanPositionSwap annotation 부착", () => {
    // BooleanPositionSwap signal의 evaluate가 decisive-match-with-cost를 반환하면
    // match engine이 annotation을 기록해야 함
    // 이 테스트는 match engine 레벨에서 통합 테스트로 확인
    // 여기서는 annotation 부착 헬퍼만 테스트
    const node: any = { id: "n1", name: "Knob", type: "FRAME", children: [] };
    
    if (!node.metadata) node.metadata = {};
    if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
    node.metadata.designPatterns.push({ type: "booleanPositionSwap", prop: "active" });

    expect(node.metadata.designPatterns).toContainEqual({
      type: "booleanPositionSwap",
      prop: "active",
    });
  });
});
```

- [ ] **Step 2: BooleanPositionSwap.ts에서 annotation 기록 추가**

`evaluate()` 메서드의 decisive-match-with-cost 반환 부분에서 양쪽 노드에 annotation 부착:

```typescript
// BooleanPositionSwap.ts evaluate() 내, return 직전 (line 152 부근):

// annotation 기록
const diffProps = this.getDiffProps(propsA, propsB);
const propName = diffProps.length > 0 ? diffProps[0] : "unknown";

if (!a.metadata) a.metadata = {};
if (!a.metadata.designPatterns) a.metadata.designPatterns = [];
a.metadata.designPatterns.push({ type: "booleanPositionSwap", prop: propName });

if (!b.metadata) b.metadata = {};
if (!b.metadata.designPatterns) b.metadata.designPatterns = [];
b.metadata.designPatterns.push({ type: "booleanPositionSwap", prop: propName });

return {
  kind: "decisive-match-with-cost",
  cost: VPP_MATCH_COST,
  reason: `position swap detected: cx movement (${posA.cx.toFixed(2)} ↔ ${posB.cx.toFixed(2)})`,
};
```

`getDiffProps` 헬퍼:

```typescript
private getDiffProps(propsA: Map<string, string>, propsB: Map<string, string>): string[] {
  const diffs: string[] = [];
  for (const [key, valA] of propsA) {
    if (propsB.get(key) !== valA) diffs.push(key);
  }
  return diffs;
}
```

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/BooleanPositionSwap.ts \
  test/compiler/design-pattern-detector.test.ts
git commit -m "feat: add booleanPositionSwap annotation recording in match engine"
```

---

### Task 9: TreeBuilder detect() 호출에 props 전달 + 최종 정리

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`

- [ ] **Step 1: TreeBuilder에서 detect() 호출 위치 조정**

현재 Step 1.0에서 `detect(tree)`를 호출하지만, statePseudoClass와 breakpointVariant는
props가 필요하므로 Step 2(PropsExtractor) 이후에 두 번째 detect를 호출해야 한다:

```typescript
// Step 1: 변형 병합
let tree = this.variantMerger.merge(node);

// Step 1.0a: 노드 레벨 디자인 패턴 감지 (alphaMask, interactionFrame, fullCoverBackground)
this.designPatternDetector.detect(tree);

// Step 1.1: Interaction layer strip
this._strippedInteractionComponentIds = stripInteractionLayers(tree, this.dataManager);

// Step 1.2: 불필요 노드 제거
collapseRedundantNodes(tree, this.dataManager);

// ... Step 1.5, Step 2
let props = this.propsExtractor.extract(node, tree.mergedNodes);

// Step 2.5: prop 레벨 디자인 패턴 감지 (statePseudoClass, breakpointVariant)
this.designPatternDetector.detect(tree, props);
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts
git commit -m "refactor: split DesignPatternDetector into node-level and prop-level passes"
```

- [ ] **Step 4: 기존 processor에서 감지 로직 잔재 제거**

각 processor에서 더 이상 사용되지 않는 감지 전용 코드 제거:
- `VisibilityProcessor.ts`: `detectAlphaMask()` 메서드 삭제
- `RedundantNodeCollapser.ts`: `isFullCoverStyleOnly()` 함수 삭제 (헬퍼는 유지)
- `InteractionLayerStripper.ts`: 기존 `isInteractionLayer()` body 이미 annotation 읽기로 전환됨

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VisibilityProcessor.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/RedundantNodeCollapser.ts \
  src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts
git commit -m "refactor: remove legacy detection logic from processors"
```
