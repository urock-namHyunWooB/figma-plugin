# Layout Normalizer Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reference content box 기준 독립 정규화로 위치 비교를 교체하여 중첩 컨테이너 안의 노드 매칭 정확도를 개선한다.

**Architecture:** `LayoutNormalizer` 클래스가 `normalize(reference, target)` → `compare(a, b)` API를 제공. NodeMatcher와 UpdateSquashByIou가 같은 인스턴스를 공유. 기존 root 기준 절대 좌표 비교 메서드 6개를 대체.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-layout-path-position-engine-design.md`

---

## File Structure

```
processors/
├── LayoutNormalizer.ts       ← 새 파일: normalize + compare + content box 계산
├── NodeMatcher.ts            ← 수정: LayoutNormalizer 주입, 기존 위치 메서드 제거
├── UpdateSquashByIou.ts      ← 수정: LayoutNormalizer 주입, isSamePosition3Way 대체
└── VariantMerger.ts          ← 수정: LayoutNormalizer 생성 + 주입 배관
```

---

### Task 1: LayoutNormalizer 클래스 — 테스트 + 구현

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/LayoutNormalizer.ts`
- Create: `test/tree-builder/layoutNormalizer.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// test/tree-builder/layoutNormalizer.test.ts
import { describe, it, expect } from "vitest";
import { LayoutNormalizer } from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/LayoutNormalizer";

function makeNode(
  id: string,
  x: number, y: number, width: number, height: number,
  extra: Record<string, any> = {}
): any {
  return {
    id,
    absoluteBoundingBox: { x, y, width, height },
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    strokeWeight: 0,
    strokesIncludedInLayout: false,
    ...extra,
  };
}

function mockDataManager(nodeMap: Map<string, any>): any {
  return {
    getById(id: string) { return { node: nodeMap.get(id) }; },
  };
}

describe("LayoutNormalizer", () => {
  describe("normalize", () => {
    it("padding 없는 부모에서 center-aligned 자식의 relCenter가 0.5여야 한다", () => {
      const parent = makeNode("p", 0, 0, 100, 100);
      const child = makeNode("c", 25, 25, 50, 50);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos.relCenterX).toBeCloseTo(0.5);
      expect(pos.relCenterY).toBeCloseTo(0.5);
      expect(pos.relWidth).toBeCloseTo(0.5);
      expect(pos.relHeight).toBeCloseTo(0.5);
    });

    it("padding이 있으면 content box 기준으로 정규화해야 한다", () => {
      const parent = makeNode("p", 0, 0, 100, 100, {
        paddingLeft: 10, paddingRight: 10, paddingTop: 20, paddingBottom: 20,
      });
      // content box: x=10, y=20, w=80, h=60
      // child center: (50, 50) → rel to content: (40, 30) → ratio: (0.5, 0.5)
      const child = makeNode("c", 30, 30, 40, 40);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos.relCenterX).toBeCloseTo(0.5);
      expect(pos.relCenterY).toBeCloseTo(0.5);
    });

    it("overflow 노드는 relWidth > 1이어야 한다", () => {
      const parent = makeNode("p", 0, 0, 24, 24);
      const child = makeNode("c", -4, -4, 32, 32);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos.relWidth).toBeGreaterThan(1);
      expect(pos.relHeight).toBeGreaterThan(1);
    });

    it("strokesIncludedInLayout이면 stroke 고려해야 한다", () => {
      const parent = makeNode("p", 0, 0, 100, 100, {
        strokesIncludedInLayout: true, strokeWeight: 2,
      });
      // content box: w=100-0-0-4=96, h=96
      const child = makeNode("c", 24, 24, 48, 48);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos.relWidth).toBeCloseTo(0.5);
    });

    it("content box 크기가 0이면 null 반환해야 한다", () => {
      const parent = makeNode("p", 0, 0, 0, 0);
      const child = makeNode("c", 0, 0, 10, 10);
      const dm = mockDataManager(new Map([["p", parent], ["c", child]]));
      const normalizer = new LayoutNormalizer(dm);

      const pos = normalizer.normalize(parent, child);
      expect(pos).toBeNull();
    });
  });

  describe("compare", () => {
    it("같은 위치면 cost 0이어야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      const a = { relCenterX: 0.5, relCenterY: 0.5, relWidth: 0.3, relHeight: 0.3 };
      const b = { relCenterX: 0.5, relCenterY: 0.5, relWidth: 0.3, relHeight: 0.3 };
      expect(normalizer.compare(a, b)).toBe(0);
    });

    it("3-way: left-aligned면 center 차이보다 left 차이가 작아야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      // 둘 다 왼쪽 정렬, 크기만 다름
      const a = { relCenterX: 0.15, relCenterY: 0.5, relWidth: 0.3, relHeight: 0.5 };
      const b = { relCenterX: 0.25, relCenterY: 0.5, relWidth: 0.5, relHeight: 0.5 };
      // leftA = 0.15 - 0.15 = 0, leftB = 0.25 - 0.25 = 0 → diff = 0
      const cost = normalizer.compare(a, b);
      expect(cost).toBe(0);
    });

    it("Chips 케이스: 서로 다른 부모에서 center-aligned면 cost ≈ 0", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      // Small Frame(37x16) icon(12x12) @ (0,2)
      const a = { relCenterX: 6/37, relCenterY: 8/16, relWidth: 12/37, relHeight: 12/16 };
      // Large Frame(47x24) icon(14x14) @ (0,5)
      const b = { relCenterX: 7/47, relCenterY: 12/24, relWidth: 14/47, relHeight: 14/24 };
      const cost = normalizer.compare(a, b);
      expect(cost).toBeLessThan(0.1);
    });

    it("완전히 다른 위치면 cost가 높아야 한다", () => {
      const normalizer = new LayoutNormalizer(mockDataManager(new Map()));
      const a = { relCenterX: 0.1, relCenterY: 0.1, relWidth: 0.2, relHeight: 0.2 };
      const b = { relCenterX: 0.9, relCenterY: 0.9, relWidth: 0.2, relHeight: 0.2 };
      expect(normalizer.compare(a, b)).toBeGreaterThan(0.5);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run test/tree-builder/layoutNormalizer.test.ts`
Expected: FAIL — `LayoutNormalizer` 모듈을 찾을 수 없음

- [ ] **Step 3: LayoutNormalizer 구현**

```typescript
// src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/LayoutNormalizer.ts
import DataManager from "../../../data-manager/DataManager";

export interface NormalizedPosition {
  relCenterX: number;
  relCenterY: number;
  relWidth: number;
  relHeight: number;
}

interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class LayoutNormalizer {
  private readonly dataManager: DataManager;
  private contentBoxCache = new Map<string, ContentBox | null>();

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * reference의 content box 기준으로 target의 상대 위치 반환.
   * content box가 유효하지 않으면 null.
   */
  normalize(reference: any, target: any): NormalizedPosition | null {
    const refBounds = reference.absoluteBoundingBox;
    const tgtBounds = target.absoluteBoundingBox;
    if (!refBounds || !tgtBounds) return null;

    const box = this.calcContentBox(reference);
    if (!box || box.width <= 0 || box.height <= 0) return null;

    const targetCenterX = tgtBounds.x + tgtBounds.width / 2;
    const targetCenterY = tgtBounds.y + tgtBounds.height / 2;

    return {
      relCenterX: (targetCenterX - box.x) / box.width,
      relCenterY: (targetCenterY - box.y) / box.height,
      relWidth: tgtBounds.width / box.width,
      relHeight: tgtBounds.height / box.height,
    };
  }

  /**
   * 두 NormalizedPosition의 3-way 비교.
   * 0~1 범위의 cost 반환 (낮을수록 유사).
   */
  compare(a: NormalizedPosition, b: NormalizedPosition): number {
    // X축
    const leftA = a.relCenterX - a.relWidth / 2;
    const leftB = b.relCenterX - b.relWidth / 2;
    const centerDiffX = Math.abs(a.relCenterX - b.relCenterX);
    const rightA = 1 - a.relCenterX - a.relWidth / 2;
    const rightB = 1 - b.relCenterX - b.relWidth / 2;
    const minDiffX = Math.min(Math.abs(leftA - leftB), centerDiffX, Math.abs(rightA - rightB));

    // Y축
    const topA = a.relCenterY - a.relHeight / 2;
    const topB = b.relCenterY - b.relHeight / 2;
    const centerDiffY = Math.abs(a.relCenterY - b.relCenterY);
    const bottomA = 1 - a.relCenterY - a.relHeight / 2;
    const bottomB = 1 - b.relCenterY - b.relHeight / 2;
    const minDiffY = Math.min(Math.abs(topA - topB), centerDiffY, Math.abs(bottomA - bottomB));

    return Math.max(minDiffX, minDiffY);
  }

  /**
   * 노드의 content box 계산 (padding, stroke 고려).
   */
  private calcContentBox(node: any): ContentBox | null {
    const id = node.id;
    if (id && this.contentBoxCache.has(id)) return this.contentBoxCache.get(id)!;

    const bounds = node.absoluteBoundingBox;
    if (!bounds) return null;

    const pl = node.paddingLeft ?? 0;
    const pr = node.paddingRight ?? 0;
    const pt = node.paddingTop ?? 0;
    const pb = node.paddingBottom ?? 0;

    let w = bounds.width - pl - pr;
    let h = bounds.height - pt - pb;

    if (node.strokesIncludedInLayout && node.strokeWeight) {
      w -= node.strokeWeight * 2;
      h -= node.strokeWeight * 2;
    }

    const box: ContentBox = {
      x: bounds.x + pl + (node.strokesIncludedInLayout && node.strokeWeight ? node.strokeWeight : 0),
      y: bounds.y + pt + (node.strokesIncludedInLayout && node.strokeWeight ? node.strokeWeight : 0),
      width: w,
      height: h,
    };

    if (id) this.contentBoxCache.set(id, box);
    return box;
  }
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run test/tree-builder/layoutNormalizer.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/LayoutNormalizer.ts test/tree-builder/layoutNormalizer.test.ts
git commit -m "feat(codegen): LayoutNormalizer 클래스 추가 — normalize + compare API"
```

---

### Task 2: NodeMatcher에 LayoutNormalizer 주입 + getPositionCost 교체

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts` (NodeMatcher 생성 시 normalizer 전달)

- [ ] **Step 1: NodeMatcher constructor에 LayoutNormalizer 추가**

NodeMatcher.ts constructor 변경:
```typescript
import { LayoutNormalizer } from "./LayoutNormalizer";

constructor(
  dataManager: DataManager,
  nodeToVariantRoot: Map<string, string>,
  private readonly layoutNormalizer: LayoutNormalizer
) {
  this.dataManager = dataManager;
  this.nodeToVariantRoot = nodeToVariantRoot;
}
```

- [ ] **Step 2: getPositionCost에서 LayoutNormalizer 사용으로 교체**

`getPositionCost()` 메서드 (line ~135) 내부 변경:

```typescript
public getPositionCost(nodeA: InternalNode, nodeB: InternalNode): number {
  // 1. 타입 호환성 체크 (기존 유지)
  if (nodeA.type !== nodeB.type) {
    const bothShapes = NodeMatcher.SHAPE_TYPES.has(nodeA.type) && NodeMatcher.SHAPE_TYPES.has(nodeB.type);
    const bothContainers = NodeMatcher.CONTAINER_TYPES.has(nodeA.type) && NodeMatcher.CONTAINER_TYPES.has(nodeB.type);
    if (!bothShapes && !bothContainers) return Infinity;
  }

  // 2. 루트끼리
  if (!nodeA.parent && !nodeB.parent) return 0;

  // 3. 위치 비교: 직접 부모 기준 독립 정규화
  const posCost = this.calcPositionCostByNormalizer(nodeA, nodeB);
  if (posCost <= 0.1) {
    // Shape 크기 검증 (기존 유지)
    if (NodeMatcher.SHAPE_TYPES.has(nodeA.type) && NodeMatcher.SHAPE_TYPES.has(nodeB.type)) {
      if (!this.isSimilarSize(nodeA, nodeB)) return Infinity;
    }
    if (nodeA.type !== nodeB.type &&
        NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
        NodeMatcher.CONTAINER_TYPES.has(nodeB.type)) {
      if (!this.isSimilarSize(nodeA, nodeB)) return Infinity;
    }
    // overflow 체크 (기존 유지)
    if (NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
        NodeMatcher.CONTAINER_TYPES.has(nodeB.type)) {
      const rootA = this.getVariantRootBounds(nodeA);
      const rootB = this.getVariantRootBounds(nodeB);
      const rootSimilar = rootA && rootB &&
        Math.max(rootA.width, rootB.width) / Math.min(rootA.width, rootB.width) <= 1.5 &&
        Math.max(rootA.height, rootB.height) / Math.min(rootA.height, rootB.height) <= 1.5;
      if (rootSimilar) {
        const overA = this.isOverflowNode(nodeA);
        const overB = this.isOverflowNode(nodeB);
        if (overA !== overB) return posCost + 0.5;
      }
    }
    return posCost;
  }

  // TEXT 특별 매칭 (기존 유지)
  if (this.isSameTextNode(nodeA, nodeB)) return 0.05;
  // INSTANCE 특별 매칭 (기존 유지)
  if (this.isSameInstanceNode(nodeA, nodeB)) return 0.05;

  return Infinity;
}
```

- [ ] **Step 3: calcPositionCostByNormalizer 헬퍼 추가**

```typescript
/**
 * LayoutNormalizer를 사용한 위치 비교.
 * 각 노드의 직접 부모(원본 Figma 트리)를 기준으로 독립 정규화 후 3-way 비교.
 */
private calcPositionCostByNormalizer(nodeA: InternalNode, nodeB: InternalNode): number {
  if (!nodeA.mergedNodes?.[0] || !nodeB.mergedNodes?.[0]) return Infinity;

  const parentA = this.findDirectParent(nodeA.mergedNodes[0].id);
  const parentB = this.findDirectParent(nodeB.mergedNodes[0].id);

  const origA = this.dataManager.getById(nodeA.mergedNodes[0].id)?.node;
  const origB = this.dataManager.getById(nodeB.mergedNodes[0].id)?.node;

  if (!parentA || !parentB || !origA || !origB) return Infinity;

  const posA = this.layoutNormalizer.normalize(parentA, origA);
  const posB = this.layoutNormalizer.normalize(parentB, origB);

  if (!posA || !posB) return Infinity;

  return this.layoutNormalizer.compare(posA, posB);
}
```

- [ ] **Step 4: VariantMerger에서 LayoutNormalizer 생성 + NodeMatcher에 전달**

VariantMerger.ts 변경 — NodeMatcher 생성 부분 (line ~113):
```typescript
import { LayoutNormalizer } from "./LayoutNormalizer";

// NodeMatcher 생성 (기존 line 113-117)
const layoutNormalizer = new LayoutNormalizer(this.dataManager);
this.nodeMatcher = new NodeMatcher(
  this.dataManager,
  this.nodeToVariantRoot,
  layoutNormalizer
);
```

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 통과 확인 (일부 실패 가능 — 정규화 방식 변경으로 인한 차이)

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts
git commit -m "refactor(codegen): NodeMatcher getPositionCost를 LayoutNormalizer 기반으로 교체"
```

---

### Task 3: NodeMatcher isSamePosition 교체 + 기존 위치 메서드 제거

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`

- [ ] **Step 1: isSameNode에서 isSamePosition 호출을 LayoutNormalizer로 교체**

`isSameNode()` 내부 (line ~77-93) 변경:
```typescript
// 4. 정규화된 위치 비교
const posCost = this.calcPositionCostByNormalizer(nodeA, nodeB);
if (posCost <= 0.1) {
  // Shape 크기 검증 (기존 유지)
  if (NodeMatcher.SHAPE_TYPES.has(nodeA.type) && NodeMatcher.SHAPE_TYPES.has(nodeB.type)) {
    if (!this.isSimilarSize(nodeA, nodeB)) return false;
  }
  if (nodeA.type !== nodeB.type &&
      NodeMatcher.CONTAINER_TYPES.has(nodeA.type) &&
      NodeMatcher.CONTAINER_TYPES.has(nodeB.type)) {
    if (!this.isSimilarSize(nodeA, nodeB)) return false;
  }
  return true;
}
```

- [ ] **Step 2: 기존 위치 관련 메서드 제거**

다음 메서드들을 NodeMatcher에서 제거:
- `calcPositionCost()` (line ~203-248)
- `calcPositionCostByParent()` (line ~254-308)
- `isSamePosition()` (line ~344-440)
- `computeAutoLayoutShift()` (line ~635-693)
- `getContentBoxInfo()` (line ~490-503)
- `calcContentBoxForMergedNode()` (line ~508-552)
- `getParentAutoLayoutInfo()`, `checkAutoLayout()`, `getOriginalLeftSiblings()`, `matchLeftContexts()`, `getOriginalParentChildren()` (AL shift 관련 메서드들)
- `autoLayoutCache` 필드

유지하는 메서드:
- `isSameNode()`, `isDefiniteMatch()`, `getPositionCost()` (공개 API)
- `isSimilarSize()`, `isOverflowNode()`, `getVariantRootBounds()`, `findOriginalVariantRoot()` (보조)
- `isSameTextNode()`, `isSameInstanceNode()` (특별 매칭)
- `findDirectParent()` (normalizer 호출에 필요)

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 통과 확인

- [ ] **Step 4: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts
git commit -m "refactor(codegen): NodeMatcher에서 기존 root 기반 위치 비교 메서드 제거"
```

---

### Task 4: UpdateSquashByIou에 LayoutNormalizer 주입 + isSamePosition3Way 교체

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/UpdateSquashByIou.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts` (squash 생성 시 normalizer 전달)

- [ ] **Step 1: UpdateSquashByIou constructor에 LayoutNormalizer 추가**

```typescript
import { LayoutNormalizer } from "./LayoutNormalizer";

constructor(
  dataManager: DataManager,
  nodeToVariantRoot: Map<string, string>,
  private readonly layoutNormalizer: LayoutNormalizer
) {
  this.dataManager = dataManager;
  this.nodeToVariantRoot = nodeToVariantRoot;
}
```

- [ ] **Step 2: isSamePosition3Way를 LayoutNormalizer로 교체**

기존 `isSamePosition3Way()` (line ~129-176) 교체:

```typescript
private isSamePosition3Way(
  nodeA: InternalNode,
  nodeB: InternalNode
): boolean {
  // squash는 variant root 기준 비교
  if (!nodeA.mergedNodes?.[0] || !nodeB.mergedNodes?.[0]) return false;

  const variantRootIdA = this.nodeToVariantRoot.get(nodeA.mergedNodes[0].id);
  const variantRootIdB = this.nodeToVariantRoot.get(nodeB.mergedNodes[0].id);
  if (!variantRootIdA || !variantRootIdB) return false;

  const rootA = this.dataManager.getById(variantRootIdA)?.node;
  const rootB = this.dataManager.getById(variantRootIdB)?.node;
  const origA = this.dataManager.getById(nodeA.mergedNodes[0].id)?.node;
  const origB = this.dataManager.getById(nodeB.mergedNodes[0].id)?.node;

  if (!rootA || !rootB || !origA || !origB) return false;

  const posA = this.layoutNormalizer.normalize(rootA, origA);
  const posB = this.layoutNormalizer.normalize(rootB, origB);
  if (!posA || !posB) return false;

  return this.layoutNormalizer.compare(posA, posB) <= 0.1;
}
```

- [ ] **Step 3: 기존 content box 메서드 제거**

UpdateSquashByIou에서 제거:
- 기존 `getContentBoxInfo()` (line ~182-199)
- 기존 `calcContentBoxForMergedNode()` (line ~201-250)

- [ ] **Step 4: VariantMerger에서 squash에 normalizer 전달**

VariantMerger.ts (line ~73-78) 변경:
```typescript
const squasher = new UpdateSquashByIou(
  this.dataManager,
  this.nodeToVariantRoot,
  layoutNormalizer  // Task 2에서 생성한 인스턴스 공유
);
```

`layoutNormalizer`를 `mergeTrees` 스코프에서 접근 가능하도록 인스턴스 변수로 승격:
```typescript
private layoutNormalizer?: LayoutNormalizer;

// buildNodeMapping() 내부 (기존 NodeMatcher 생성 부분):
this.layoutNormalizer = new LayoutNormalizer(this.dataManager);
this.nodeMatcher = new NodeMatcher(this.dataManager, this.nodeToVariantRoot, this.layoutNormalizer);

// mergeTrees() 내부 (squash 생성 부분):
const squasher = new UpdateSquashByIou(this.dataManager, this.nodeToVariantRoot, this.layoutNormalizer!);
```

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/UpdateSquashByIou.ts src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts
git commit -m "refactor(codegen): UpdateSquashByIou isSamePosition3Way를 LayoutNormalizer로 교체"
```

---

### Task 5: Chips 검증 + 리그레션 테스트

**Files:**
- Create: `test/tree-builder/layoutNormalizerIntegration.test.ts`

- [ ] **Step 1: Chips icon 매칭 통합 테스트 작성**

```typescript
// test/tree-builder/layoutNormalizerIntegration.test.ts
import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import fs from "fs";
import path from "path";

describe("LayoutNormalizer Integration", () => {
  describe("Chips fixture", () => {
    it("icon-checking과 icon_checking이 하나로 합쳐져야 한다", async () => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../fixtures/failing/Chips.json"), "utf-8")
      );
      const gen = new FigmaCodeGenerator(fixture as any, { strategy: "emotion" });
      const code = await gen.compile();

      // iconchecking이 하나의 slot으로만 존재해야 함
      expect(code).toBeTruthy();
      // icon이 size 조건 없이 렌더링되어야 함 (하나로 합쳐졌으므로)
      expect(code).not.toMatch(/size\s*===\s*["']small["']\s*&&\s*iconchecking/);
    });
  });

  describe("Checkbox fixture", () => {
    it("Box와 Interaction이 구분되어야 한다", async () => {
      const fixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../fixtures/any/Controlcheckbox.json"), "utf-8")
      );
      const gen = new FigmaCodeGenerator(fixture as any, { strategy: "emotion" });
      const code = await gen.compile();

      expect(code).toBeTruthy();
      // checked 조건부 렌더링이 존재해야 함
      expect(code).toMatch(/checked/);
    });
  });
});
```

- [ ] **Step 2: 전체 테스트 실행 + Chips/Checkbox 확인**

Run: `npx vitest run`
Expected: 전체 통과. Chips icon 합침 확인.

- [ ] **Step 3: 브라우저 테스트 실행**

Run: `npm run test:browser`
Expected: 기존 44개 통과

- [ ] **Step 4: 커밋**

```bash
git add test/tree-builder/layoutNormalizerIntegration.test.ts
git commit -m "test(codegen): LayoutNormalizer 통합 테스트 — Chips icon 합침 + Checkbox 구분"
```

---

### Task 6: 정리 — 미사용 코드 제거 + NodeMatcher 테스트 업데이트

**Files:**
- Modify: `test/tree-builder/nodeMatcher.test.ts` (기존 테스트가 제거된 메서드를 사용하면 수정)
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts` (미사용 import 정리)

- [ ] **Step 1: NodeMatcher 테스트 업데이트**

기존 `nodeMatcher.test.ts`에서 제거된 메서드 (`computeAutoLayoutShift` 등)를 직접 호출하는 테스트가 있으면 수정. `isSameNode`과 `getPositionCost` 공개 API 테스트는 유지.

- [ ] **Step 2: 미사용 import/타입 정리**

NodeMatcher.ts에서 `AutoLayoutInfo` 인터페이스, `autoLayoutCache` 등 제거 후 남은 미사용 코드 정리.

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 전체 통과

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "refactor(codegen): LayoutNormalizer 도입 완료 — 기존 root 기반 위치 비교 제거"
```
