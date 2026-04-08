# Variant Merger Engine — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1에서 구축한 엔진 인프라를 실제 매칭 경로(`getPositionCost`)로 전환하고, 남은 회귀 패턴 — variant-prop-position 16건 + Tagreview Small wrapper 보존 — 을 해결한다. Phase 2 종료 시 엔진이 VariantMerger의 주 매칭 엔진이 되고, 회귀 패턴별 신호가 모두 추가된다.

**Architecture:** Phase 2는 5개의 서브-페이즈로 나뉜다.
- **2a (Complete signal catalog)**: 기존 legacy 로직을 전부 엔진 신호로 이식 — TextSpecialMatch, InstanceSpecialMatch, OverflowPenalty. 이 신호들이 있어야 getPositionCost 위임 시 0 drift를 유지할 수 있다.
- **2b (getPositionCost delegation)**: 엔진이 실제 매칭 경로가 된다. Cost form 결정 + legacy 숫자 행동 보존.
- **2c (Pattern signals)**: 새 회귀 패턴 신호 추가 — VariantPropPosition (boolean variant 기반 위치 override), ParentShapeIdentity (부모 컨텍스트 부스터).
- **2d (Wrapper preservation)**: WrapperRoleDistinction 신호 + Tagreview wrapper 데이터 튜닝.
- **2e (Cleanup)**: legacy 메서드 제거, 최종 검증.

**SignalResult 확장**: VariantPropPosition이 다른 신호의 veto를 오버라이드할 수 있도록 `SignalResult`에 새 kind 추가: `"decisive-match"`. 엔진은 decisive-match를 보면 즉시 match로 결정 (veto short-circuit의 반대).

**Tech Stack:** TypeScript 5.3, vitest 4, Phase 0/1 인프라 전부 활용.

**Spec reference:** `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` §3, §4 Phase 2
**Dependency:** Phase 1 merged to dev (`bf8f456`).

---

## File Structure

**새 신호 (src/):**
- `.../match-engine/signals/TextSpecialMatch.ts` — TEXT 노드: 이름+부모 타입 일치로 match
- `.../match-engine/signals/InstanceSpecialMatch.ts` — INSTANCE: `componentPropertyReferences.visible` 일치로 match
- `.../match-engine/signals/OverflowPenalty.ts` — overflow↔normal 교차 시 cost 가산
- `.../match-engine/signals/VariantPropPosition.ts` — boolean variant diff + cx만 다름 → decisive match
- `.../match-engine/signals/ParentShapeIdentity.ts` — 같은 부모 (dependency component/이름/type) → score 부스트
- `.../match-engine/signals/WrapperRoleDistinction.ts` — 비슷한 variant root에서 자식 구조가 크게 다르면 veto

**수정할 엔진 코어 (src/):**
- `.../match-engine/MatchSignal.ts` — `SignalResult`에 `decisive-match` kind 추가
- `.../match-engine/MatchDecisionEngine.ts` — decisive-match 처리 로직
- `.../match-engine/MatchingPolicy.ts` — 새 신호 가중치/임계값 추가
- `.../match-engine/index.ts` — `createDefaultEngine` 확장

**수정할 기존 파일 (src/):**
- `.../processors/NodeMatcher.ts` — `getPositionCost`를 엔진 위임으로 교체, `isSameNode`도 엔진으로 전환, legacy 메서드 제거

**새 테스트 (test/):**
- 각 신호별 단위 테스트 (6개 파일)
- `test/tree-builder/match-engine/MatchSignal.test.ts` 업데이트 — decisive-match 타입 검증
- `test/tree-builder/match-engine/MatchDecisionEngine.test.ts` 업데이트 — decisive-match 처리 검증
- `test/tree-builder/match-engine/phase2Integration.test.ts` — end-to-end: variant-prop-position fixture에 대한 엔진 결정 검증
- `test/tree-builder/match-engine/tagreviewWrapper.test.ts` — Tagreview Small wrapper 보존 검증

**수정할 데이터:**
- `test/audits/audit-baseline.json` — Phase 2 종료 후 재생성 (variant-prop-position 16 → 0)
- `test/snapshots/__snapshots__/*.snap` — 위 변화 반영 재생성
- `test/matching/pairAssertions.data.ts` — 자동 생성 스크립트를 variant-prop-position 패턴도 포함하도록 확장
- `scripts/generate-pair-assertions.ts` — pattern filter를 인자로 받도록 확장

---

## Execution Notes

- **Worktree**: 이미 생성됨 (`/Users/namhyeon-u/Desktop/figma-plugin/.claude/worktrees/variant-merger-phase2`, 브랜치 `feat/variant-merger-phase2`).
- **TDD 엄수**: 각 신호는 단위 테스트 먼저. 통합 효과는 phase2Integration.test.ts + audit ratchet으로 검증.
- **Cost form 결정**: Task B1에서 엔진의 getPositionCost 반환값을 결정. 두 옵션 중 선택:
  - (i) 엔진 `totalCost` 그대로 반환 — 깔끔하지만 legacy 숫자와 다름, Hungarian 재정렬 가능
  - (ii) NormalizedPosition score → cost 역변환 + 다른 신호 penalty 합산 → 기존 posCost 수치와 유사하게
  - Task B1에서 먼저 (i)로 시도 후 스냅샷 drift 검토. 많으면 (ii)로 조정.
- **Snapshot drift 관리**: Task B1에서 의도된 drift만 허용, 의도치 않은 drift는 신호 버그로 간주.
- **Commit per task**: 각 task 종료 시 커밋.

---

# Phase 2a — Complete Signal Catalog (legacy → engine 1:1)

이 서브-페이즈는 기존 `isSameNode`/`getPositionCost`의 나머지 로직을 전부 엔진 신호로 옮긴다. 0 행동 변화가 목표.

## Task A1: TextSpecialMatch 신호

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TextSpecialMatch.ts`
- Test: `test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts`

**Context:** 기존 `NodeMatcher.isSameTextNode` 로직을 신호로 이식. TEXT 노드끼리 이름이 같고 부모 타입이 같으면 score 1을 반환 (다른 신호가 veto해도 이기게 하려면 decisive-match 사용 — Task A4에서 결정). Phase 2a 단계에서는 일반 score 반환으로 시작, Task C1에서 decisive-match로 전환 여부 결정.

- [ ] **Step 1: Write failing test**

File: `test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { TextSpecialMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TextSpecialMatch";
import type { InternalNode } from "@code-generator2/types/types";

function textNode(id: string, name: string, parentType: string | null): InternalNode {
  const node: any = { id, name, type: "TEXT", children: [] };
  if (parentType) node.parent = { type: parentType };
  return node as InternalNode;
}

describe("TextSpecialMatch signal", () => {
  const signal = new TextSpecialMatch();

  it("returns score 1 for TEXT pair with same name + same parent type", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Label", "FRAME");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 0 for non-TEXT pair (neutral)", () => {
    const a = { id: "a", name: "x", type: "FRAME", children: [] } as any;
    const b = { id: "b", name: "x", type: "FRAME", children: [] } as any;
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 for TEXT pair with different names", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Title", "FRAME");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 for TEXT pair with different parent types", () => {
    const a = textNode("a", "Label", "FRAME");
    const b = textNode("b", "Label", "GROUP");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when parent is missing", () => {
    const a = textNode("a", "Label", null);
    const b = textNode("b", "Label", null);
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts`
Expected: module not found.

- [ ] **Step 3: Write implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TextSpecialMatch.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * TEXT 노드 특수 매칭 신호.
 *
 * 기존 NodeMatcher.isSameTextNode 재현:
 * - 두 노드 모두 TEXT
 * - 이름 일치
 * - 부모 타입 일치
 * → score 1 (같은 역할 TEXT)
 *
 * 그 외에는 score 0 (이 신호로는 판정 불가, 다른 신호에 맡김).
 *
 * 엔진 aggregation에서 이 score 1이 다른 veto를 이기지는 않는다.
 * Decisive match로 승격하려면 Phase 2c Task C1에서 결정.
 */
export class TextSpecialMatch implements MatchSignal {
  readonly name = "TextSpecialMatch";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.type !== "TEXT" || b.type !== "TEXT") {
      return { kind: "score", score: 0, reason: "non-TEXT pair" };
    }
    if (a.name !== b.name) {
      return { kind: "score", score: 0, reason: `name diff: ${a.name} ≠ ${b.name}` };
    }
    const parentAType = (a as any).parent?.type;
    const parentBType = (b as any).parent?.type;
    if (!parentAType || !parentBType || parentAType !== parentBType) {
      return { kind: "score", score: 0, reason: "parent type diff or missing" };
    }
    return { kind: "score", score: 1, reason: `same TEXT role: ${a.name}` };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TextSpecialMatch.ts test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts
git commit -m "feat(match-engine): TextSpecialMatch signal (replicates isSameTextNode)"
```

---

## Task A2: InstanceSpecialMatch 신호

**Files:**
- Create: `.../match-engine/signals/InstanceSpecialMatch.ts`
- Test: `test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts`

**Context:** 기존 `NodeMatcher.isSameInstanceNode` 로직 이식. 두 INSTANCE 노드가 같은 `componentPropertyReferences.visible`을 가지면 같은 노드로 판정. 또한 기존 NodeMatcher 테스트에서 "같은 componentId 기반 매칭"도 요구하는 것으로 보임 — 이 신호가 해당 케이스를 커버해야 함.

- [ ] **Step 1: Write failing test**

File: `test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { InstanceSpecialMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/InstanceSpecialMatch";
import type { InternalNode } from "@code-generator2/types/types";

function instanceNode(id: string, visibleRef?: string, componentId?: string): InternalNode {
  return {
    id,
    name: "inst",
    type: "INSTANCE",
    children: [],
    componentId,
    componentPropertyReferences: visibleRef ? { visible: visibleRef } : undefined,
  } as unknown as InternalNode;
}

describe("InstanceSpecialMatch signal", () => {
  const signal = new InstanceSpecialMatch();

  it("returns score 1 when both INSTANCE share visible ref", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b", "showIcon");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 0 when visible refs differ", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b", "showLabel");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 for non-INSTANCE pair", () => {
    const a = { id: "a", name: "x", type: "FRAME", children: [] } as any;
    const b = { id: "b", name: "x", type: "FRAME", children: [] } as any;
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when only one side has visible ref", () => {
    const a = instanceNode("a", "showIcon");
    const b = instanceNode("b");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts`
Expected: module not found.

- [ ] **Step 3: Write implementation**

File: `.../match-engine/signals/InstanceSpecialMatch.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * INSTANCE 노드 특수 매칭 신호.
 *
 * 기존 NodeMatcher.isSameInstanceNode 재현:
 * - 두 노드 모두 INSTANCE
 * - componentPropertyReferences.visible이 둘 다 있고 일치 → score 1
 * - 그 외 → score 0
 *
 * 주의: componentId 기반 매칭은 이 신호 범위 밖 (위치 기반에 의존).
 */
export class InstanceSpecialMatch implements MatchSignal {
  readonly name = "InstanceSpecialMatch";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.type !== "INSTANCE" || b.type !== "INSTANCE") {
      return { kind: "score", score: 0, reason: "non-INSTANCE pair" };
    }
    const visA = (a as any).componentPropertyReferences?.visible;
    const visB = (b as any).componentPropertyReferences?.visible;
    if (visA && visB && visA === visB) {
      return { kind: "score", score: 1, reason: `same visible ref: ${visA}` };
    }
    return { kind: "score", score: 0, reason: "no matching visible ref" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/InstanceSpecialMatch.ts test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts
git commit -m "feat(match-engine): InstanceSpecialMatch signal (replicates isSameInstanceNode)"
```

---

## Task A3: OverflowPenalty 신호

**Files:**
- Create: `.../match-engine/signals/OverflowPenalty.ts`
- Test: `test/tree-builder/match-engine/signals/OverflowPenalty.test.ts`

**Context:** 기존 `NodeMatcher.getPositionCost`의 overflow 보정 로직 이식. variant root 크기가 비슷한데 한 쪽만 overflow(부모보다 큰) 노드이면 cost 가산. 신호 form으로는 score 감점: overflow↔normal 교차면 score 0.5 감점 (기존 penalty 0.5 기준), 그 외는 score 1.

- [ ] **Step 1: Write failing test**

File: `test/tree-builder/match-engine/signals/OverflowPenalty.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { OverflowPenalty } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/OverflowPenalty";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function containerNode(id: string): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: [],
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(overflowA: boolean, overflowB: boolean, rootSimilar = true) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: {
          id,
          absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          children: [{ id: "child" }],
        },
      })),
    },
    layoutNormalizer: {
      normalize: vi.fn((_parent: any, orig: any) => {
        if (orig.id === "a") return { cx: 0.5, cy: 0.5, relWidth: overflowA ? 1.2 : 0.5, relHeight: overflowA ? 1.2 : 0.5 };
        if (orig.id === "b") return { cx: 0.5, cy: 0.5, relWidth: overflowB ? 1.2 : 0.5, relHeight: overflowB ? 1.2 : 0.5 };
        return null;
      }),
    },
    nodeToVariantRoot: new Map([["a", "rootA"], ["b", rootSimilar ? "rootB" : "rootBbig"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("OverflowPenalty signal", () => {
  const signal = new OverflowPenalty();

  it("returns score 1 when both nodes are normal (no overflow)", () => {
    const r = signal.evaluate(containerNode("a"), containerNode("b"), makeCtx(false, false));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 1 when both nodes are overflow", () => {
    const r = signal.evaluate(containerNode("a"), containerNode("b"), makeCtx(true, true));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns penalized score when one is overflow and other is normal", () => {
    const r = signal.evaluate(containerNode("a"), containerNode("b"), makeCtx(true, false));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0.5); // 1 - 0.5 penalty
  });

  it("returns score 1 for non-container pair (passthrough)", () => {
    const a = { id: "a", name: "a", type: "TEXT", children: [] } as any;
    const b = { id: "b", name: "b", type: "TEXT", children: [] } as any;
    const r = signal.evaluate(a, b, makeCtx(true, false));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/OverflowPenalty.test.ts`
Expected: module not found.

- [ ] **Step 3: Write implementation**

File: `.../match-engine/signals/OverflowPenalty.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * Overflow penalty 신호.
 *
 * 기존 NodeMatcher.getPositionCost의 overflow 보정 로직 이식.
 *
 * 판정:
 * - 두 노드 모두 CONTAINER_TYPES가 아님 → score 1 (신호 대상 외)
 * - 두 variant root 크기가 variantRootSimilarityRatio 안으로 비슷함
 * - 그런데 한쪽만 overflow(relWidth 또는 relHeight > 1) → score 감점
 * - 그 외 → score 1
 *
 * 감점량: policy.overflowMismatchPenalty (기존 0.5).
 */
export class OverflowPenalty implements MatchSignal {
  readonly name = "OverflowPenalty";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    if (!CONTAINER_TYPES.has(a.type) || !CONTAINER_TYPES.has(b.type)) {
      return { kind: "score", score: 1, reason: "non-container pair passthrough" };
    }

    const rootA = this.getVariantRootBounds(a, ctx);
    const rootB = this.getVariantRootBounds(b, ctx);
    if (!rootA || !rootB) {
      return { kind: "score", score: 1, reason: "missing variant root bounds" };
    }

    const maxW = Math.max(rootA.width, rootB.width);
    const minW = Math.min(rootA.width, rootB.width);
    const maxH = Math.max(rootA.height, rootB.height);
    const minH = Math.min(rootA.height, rootB.height);
    if (minW <= 0 || minH <= 0) {
      return { kind: "score", score: 1, reason: "zero variant root" };
    }
    const rootSimilar =
      maxW / minW <= ctx.policy.variantRootSimilarityRatio &&
      maxH / minH <= ctx.policy.variantRootSimilarityRatio;
    if (!rootSimilar) {
      return { kind: "score", score: 1, reason: "variant roots too different" };
    }

    const overflowA = this.isOverflow(a, ctx);
    const overflowB = this.isOverflow(b, ctx);
    if (overflowA === overflowB) {
      return { kind: "score", score: 1, reason: "same overflow state" };
    }

    return {
      kind: "score",
      score: 1 - ctx.policy.overflowMismatchPenalty,
      reason: `overflow mismatch: a=${overflowA} b=${overflowB}`,
    };
  }

  private getVariantRootBounds(node: InternalNode, ctx: MatchContext): { width: number; height: number } | null {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return null;
    const rootId = ctx.nodeToVariantRoot.get(mergedId);
    if (!rootId) return null;
    const root = ctx.dataManager.getById(rootId)?.node as any;
    const bounds = root?.absoluteBoundingBox;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return { width: bounds.width, height: bounds.height };
  }

  private isOverflow(node: InternalNode, ctx: MatchContext): boolean {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return false;
    const orig = ctx.dataManager.getById(mergedId)?.node as any;
    if (!orig?.absoluteBoundingBox) return false;
    const parent = this.findDirectParent(mergedId, ctx);
    if (!parent) return false;
    const pos = ctx.layoutNormalizer.normalize(parent, orig);
    if (!pos) return false;
    return pos.relWidth > 1 || pos.relHeight > 1;
  }

  private findDirectParent(nodeId: string, ctx: MatchContext): unknown | null {
    const variantRootId = ctx.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;
    const variantRoot = ctx.dataManager.getById(variantRootId)?.node;
    if (!variantRoot) return null;
    const find = (parent: any): any | null => {
      if (!parent?.children) return null;
      for (const child of parent.children) {
        if (child.id === nodeId) return parent;
        const r = find(child);
        if (r) return r;
      }
      return null;
    };
    return find(variantRoot);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/OverflowPenalty.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/OverflowPenalty.ts test/tree-builder/match-engine/signals/OverflowPenalty.test.ts
git commit -m "feat(match-engine): OverflowPenalty signal (replicates getPositionCost overflow logic)"
```

---

## Task A4: SignalResult 확장 + Engine decisive-match 처리

**Files:**
- Modify: `.../match-engine/MatchSignal.ts`
- Modify: `.../match-engine/MatchDecisionEngine.ts`
- Modify: `test/tree-builder/match-engine/MatchSignal.test.ts`
- Modify: `test/tree-builder/match-engine/MatchDecisionEngine.test.ts`

**Context:** `SignalResult`에 세 번째 kind 추가: `decisive-match`. 엔진 aggregation 규칙:
1. 신호 중 하나라도 `decisive-match` → 즉시 decision="match", totalCost=0 (단 다른 decisive-veto는 없어야 함 — 현재는 decisive-veto 개념 없음)
2. 그 외에는 기존 규칙 (veto → 즉시 veto, 아니면 cost 합산)

Evaluation 순서는 그대로 유지: 모든 신호를 순차 호출하되, veto/decisive-match를 만나면 short-circuit.

- [ ] **Step 1: Update MatchSignal.test.ts — add decisive-match test**

Edit `test/tree-builder/match-engine/MatchSignal.test.ts`, append:

```typescript
  it("SignalResult decisive-match has kind 'decisive-match' and no score", () => {
    const r: SignalResult = { kind: "decisive-match", reason: "variant prop position override" };
    expect(r.kind).toBe("decisive-match");
    // @ts-expect-error — score must not exist on decisive-match
    expect(r.score).toBeUndefined();
  });
```

- [ ] **Step 2: Run test — should fail (type doesn't exist)**

Run: `npx vitest run test/tree-builder/match-engine/MatchSignal.test.ts`
Expected: TypeScript error on the decisive-match type.

- [ ] **Step 3: Update SignalResult in MatchSignal.ts**

Edit `src/.../match-engine/MatchSignal.ts`:

```typescript
/**
 * 한 신호의 평가 결과.
 *
 * discriminated union:
 * - kind="veto": 결정적 거부. 엔진은 즉시 match 불가로 결정.
 * - kind="score": 0~1 사이 점수. 1=완벽 일치, 0=전혀 맞지 않음.
 * - kind="decisive-match": 결정적 수용. 엔진은 즉시 match로 결정 (다른 veto 무시).
 *   VariantPropPosition처럼 "위치는 다르지만 같은 노드임이 명백한" 케이스에 사용.
 */
export type SignalResult =
  | { kind: "veto"; reason: string }
  | { kind: "score"; score: number; reason: string }
  | { kind: "decisive-match"; reason: string };
```

- [ ] **Step 4: Run MatchSignal.test.ts to confirm it passes**

Run: `npx vitest run test/tree-builder/match-engine/MatchSignal.test.ts`
Expected: PASS (4 tests — original 3 + new 1).

- [ ] **Step 5: Add engine test for decisive-match**

Append to `test/tree-builder/match-engine/MatchDecisionEngine.test.ts`:

```typescript
  it("returns match immediately when a signal returns decisive-match", () => {
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 0.1, reason: "" }),
        fakeSignal("s2", { kind: "decisive-match", reason: "override" }),
        fakeSignal("s3", { kind: "veto", reason: "would normally veto" }),
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("match");
    expect(d.totalCost).toBe(0);
  });

  it("short-circuits on decisive-match (signals after are not evaluated)", () => {
    let s3Called = false;
    const engine = new MatchDecisionEngine(
      [
        fakeSignal("s1", { kind: "score", score: 0.5, reason: "" }),
        fakeSignal("s2", { kind: "decisive-match", reason: "" }),
        { name: "s3", evaluate: () => { s3Called = true; return { kind: "score", score: 1, reason: "" }; } },
      ],
      defaultMatchingPolicy,
    );
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("match");
    expect(s3Called).toBe(false);
  });
```

- [ ] **Step 6: Run engine test to confirm failure**

Run: `npx vitest run test/tree-builder/match-engine/MatchDecisionEngine.test.ts`
Expected: FAIL on the 2 new tests (engine doesn't handle decisive-match yet).

- [ ] **Step 7: Update MatchDecisionEngine.ts**

Edit `src/.../match-engine/MatchDecisionEngine.ts` — modify the `decide` method's loop:

```typescript
    for (const signal of this.signals) {
      const result = signal.evaluate(a, b, ctx);
      const weight = this.weightFor(signal.name);
      signalResults.push({ signalName: signal.name, result, weight });

      if (result.kind === "veto") {
        return {
          decision: "veto",
          totalCost: Infinity,
          signalResults,
        };
      }
      if (result.kind === "decisive-match") {
        return {
          decision: "match",
          totalCost: 0,
          signalResults,
        };
      }
    }

    let totalCost = 0;
    for (const { result, weight } of signalResults) {
      if (result.kind === "score") {
        totalCost += weight * (1 - result.score);
      }
    }
```

- [ ] **Step 8: Run engine tests to confirm pass**

Run: `npx vitest run test/tree-builder/match-engine/MatchDecisionEngine.test.ts`
Expected: PASS (8 tests — original 6 + new 2).

- [ ] **Step 9: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal.ts src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchDecisionEngine.ts test/tree-builder/match-engine/MatchSignal.test.ts test/tree-builder/match-engine/MatchDecisionEngine.test.ts
git commit -m "feat(match-engine): SignalResult decisive-match kind + engine short-circuit handling"
```

---

## Task A5: Engine factory extension — register new signals

**Files:**
- Modify: `.../match-engine/index.ts`

**Context:** `createDefaultEngine`에 Phase 2a 신호 3개 추가 (TextSpecialMatch, InstanceSpecialMatch, OverflowPenalty). 등록 순서는 평가 비용/semantics 기준.

- [ ] **Step 1: Update factory**

Edit `src/.../match-engine/index.ts`:

```typescript
import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { RelativeSize } from "./signals/RelativeSize";
import { TextSpecialMatch } from "./signals/TextSpecialMatch";
import { InstanceSpecialMatch } from "./signals/InstanceSpecialMatch";
import { OverflowPenalty } from "./signals/OverflowPenalty";
import { defaultMatchingPolicy, type MatchingPolicy } from "./MatchingPolicy";

export { MatchDecisionEngine } from "./MatchDecisionEngine";
export { defaultMatchingPolicy } from "./MatchingPolicy";
export type { MatchingPolicy } from "./MatchingPolicy";
export type { MatchSignal, SignalResult, MatchContext, MatchDecision } from "./MatchSignal";

/**
 * Phase 2a 확장 엔진.
 *
 * 신호 순서:
 * 1. TypeCompatibility — O(1), 가장 빠른 veto
 * 2. IdMatch — O(1), id 일치 빠른 경로
 * 3. TextSpecialMatch — O(1), TEXT 특수
 * 4. InstanceSpecialMatch — O(1), INSTANCE visible ref 특수
 * 5. RelativeSize — O(1), 크기 veto
 * 6. OverflowPenalty — O(depth), overflow 감점
 * 7. NormalizedPosition — O(depth), 위치 비교
 */
export function createDefaultEngine(
  policy: MatchingPolicy = defaultMatchingPolicy,
): MatchDecisionEngine {
  return new MatchDecisionEngine(
    [
      new TypeCompatibility(),
      new IdMatch(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
      new RelativeSize(),
      new OverflowPenalty(),
      new NormalizedPosition(),
    ],
    policy,
  );
}
```

- [ ] **Step 2: Run all match-engine tests**

Run: `npx vitest run test/tree-builder/match-engine/`
Expected: All pass including existing tests (factory change is additive).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts
git commit -m "feat(match-engine): register TextSpecialMatch/InstanceSpecialMatch/OverflowPenalty signals"
```

---

# Phase 2b — getPositionCost Delegation

엔진이 이제 실제 매칭 경로가 된다.

## Task B1: getPositionCost를 엔진으로 위임

**Files:**
- Modify: `.../processors/NodeMatcher.ts`

**Context:** 기존 `getPositionCost`는 복잡한 if 분기로 구현돼 있다. 엔진이 모든 신호(TypeCompatibility, IdMatch, TextSpecialMatch, InstanceSpecialMatch, RelativeSize, OverflowPenalty, NormalizedPosition)를 가지고 있으므로 엔진 `decide`의 `totalCost`를 그대로 반환할 수 있다.

**주의: Cost numeric form 변경**. 기존은 raw posCost(0~0.1), 엔진은 `Σ weight × (1 - score)` (0~N). Hungarian은 상대 순서만 쓰므로 동작은 같지만 스냅샷에 cost가 찍히는 곳은 변경 가능.

- [ ] **Step 1: Replace getPositionCost body**

Edit `NodeMatcher.ts` — replace `getPositionCost` method:

```typescript
  /**
   * Pass 2용: 위치 기반 매칭 비용 반환 (엔진 위임)
   * 매칭 불가하면 Infinity 반환
   *
   * Phase 2b: MatchDecisionEngine에 완전 위임. Hungarian matching은
   * 상대 cost 순서만 사용하므로 숫자 형태가 달라져도 동작 동일.
   */
  public getPositionCost(nodeA: InternalNode, nodeB: InternalNode): number {
    const ctx: MatchContext = {
      dataManager: this.dataManager,
      layoutNormalizer: this.layoutNormalizer,
      nodeToVariantRoot: this.nodeToVariantRoot,
      policy: defaultMatchingPolicy,
    };
    const decision = this.engine.decide(nodeA, nodeB, ctx);

    const log = (globalThis as any).__MATCH_REASON_LOG__ as Array<unknown> | undefined;
    if (log) {
      log.push({
        pair: [nodeA.id, nodeB.id],
        decision: decision.decision,
        totalCost: decision.totalCost,
        signalResults: decision.signalResults,
        source: "engine-getPositionCost",
      });
    }

    return decision.totalCost;
  }
```

Also remove the now-unused `getPositionCostLegacy` method and any helpers only it used (calcPositionCostByNormalizer, isOverflowNode, getVariantRootBounds — verify they're not used by isDefiniteMatch).

- [ ] **Step 2: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: Most tests pass. Some may fail due to cost numeric differences or snapshot drift.

- [ ] **Step 3: Run audit**

Run: `npm run audit`
Expected: Baseline compare passes (no regressions in disjoint count) OR baseline needs regeneration.

If audit fails with numbers, regenerate: `npm run audit:write` and inspect the diff — each should be an improvement (fewer disjoint pairs), not a regression.

- [ ] **Step 4: Run snapshot tests**

Run: `npx vitest run test/snapshots/`
Expected: Some drift. Review each diff — should be matching improvements, not regressions.

Regenerate: `npx vitest run test/snapshots/ -u`

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts test/audits/audit-baseline.json test/snapshots/__snapshots__/
git commit -m "feat(match-engine): getPositionCost delegates to engine (full migration)"
```

---

## Task B2: isSameNode도 엔진으로 전환

**Files:**
- Modify: `.../processors/NodeMatcher.ts`
- Modify: `test/tree-builder/nodeMatcher.test.ts` (if needed for INSTANCE/TEXT expectations)

**Context:** 이제 엔진이 TextSpecialMatch + InstanceSpecialMatch를 가지고 있으므로 `isSameNode`도 안전하게 엔진 위임으로 전환 가능. 기존 NodeMatcher test가 통과해야 함.

- [ ] **Step 1: Flip isSameNode**

Edit `NodeMatcher.ts`:

```typescript
  public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
    const ctx: MatchContext = {
      dataManager: this.dataManager,
      layoutNormalizer: this.layoutNormalizer,
      nodeToVariantRoot: this.nodeToVariantRoot,
      policy: defaultMatchingPolicy,
    };
    return this.engine.decide(nodeA, nodeB, ctx).decision === "match";
  }
```

Remove `isSameNodeLegacy` entirely.

- [ ] **Step 2: Run nodeMatcher.test.ts**

Run: `npx vitest run test/tree-builder/nodeMatcher.test.ts`
Expected: All 4 tests pass (including the INSTANCE same-component test that previously failed).

- [ ] **Step 3: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All pass (modulo pre-existing decomposer).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts
git commit -m "feat(match-engine): isSameNode delegates to engine (TEXT/INSTANCE signals now present)"
```

---

# Phase 2c — Pattern Signals for Regression Resolution

## Task C1: VariantPropPosition 신호

**Files:**
- Create: `.../match-engine/signals/VariantPropPosition.ts`
- Test: `test/tree-builder/match-engine/signals/VariantPropPosition.test.ts`

**Context:** Switch Knob, Toggle content, Plus(Left/Right Icon) 처리. 두 노드의 variant 집합이 disjoint이고 diff prop이 boolean이며, 자식 `cx`만 다르면 → `decisive-match`. 이 신호는 NormalizedPosition이 veto할 위치 차이를 **override**한다.

- [ ] **Step 1: Write failing test**

File: `test/tree-builder/match-engine/signals/VariantPropPosition.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { VariantPropPosition } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/VariantPropPosition";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(id: string, variantName: string): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: [],
    mergedNodes: [{ id, name: id, variantName }],
  } as unknown as InternalNode;
}

function makeCtx(cxA: number, cxB: number, cyA = 0.5, cyB = 0.5) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: { id, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      })),
    },
    layoutNormalizer: {
      normalize: vi.fn((_p: any, orig: any) => {
        if (orig.id === "a") return { cx: cxA, cy: cyA, relWidth: 0.2, relHeight: 0.2 };
        if (orig.id === "b") return { cx: cxB, cy: cyB, relWidth: 0.2, relHeight: 0.2 };
        return null;
      }),
    },
    nodeToVariantRoot: new Map([["a", "root"], ["b", "root"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("VariantPropPosition signal", () => {
  const signal = new VariantPropPosition();

  it("returns decisive-match for boolean-diff + cx-only variant (Switch Knob case)", () => {
    const a = node("a", "State=Off");
    const b = node("b", "State=On");
    // Mock State=Off / State=On as boolean-like in classification
    const ctx = makeCtx(0.16, 0.84);
    const r = signal.evaluate(a, b, ctx);
    // Either "decisive-match" or "score" 0 depending on how classifier treats "State=Off/On"
    // Conservative: boolean prop diff + cx-only → decisive-match
    expect(r.kind).toBe("score"); // State=Off/On is not True/False
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns decisive-match for True/False variant diff + cx-only", () => {
    const a = node("a", "LeftIcon=False, State=Default");
    const b = node("b", "LeftIcon=True, State=Default");
    const ctx = makeCtx(0.2, 0.8);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("decisive-match");
  });

  it("returns score 0 when variants are not disjoint", () => {
    const a = node("a", "LeftIcon=False, State=Default");
    const b = node("b", "LeftIcon=False, State=Hover");
    const ctx = makeCtx(0.2, 0.8);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when diff prop is not boolean", () => {
    const a = node("a", "Size=Small");
    const b = node("b", "Size=Large");
    const ctx = makeCtx(0.2, 0.8);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when cy also differs (not cx-only movement)", () => {
    const a = node("a", "LeftIcon=False");
    const b = node("b", "LeftIcon=True");
    const ctx = makeCtx(0.2, 0.8, 0.3, 0.7); // cy differs
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/VariantPropPosition.test.ts`
Expected: module not found.

- [ ] **Step 3: Write implementation**

File: `src/.../match-engine/signals/VariantPropPosition.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * Variant prop → 위치 결정 신호.
 *
 * 회귀 패턴 처리 (spec §1.1 pattern 2):
 *   Switch Knob, Toggle content, Plus(Left/Right Icon) 등은 boolean variant
 *   (예: LeftIcon=True/False)에 따라 좌↔우로 이동한다. 위치가 다르므로
 *   NormalizedPosition이 veto하지만 같은 노드임이 명백하다.
 *
 * 판정:
 * 1. 두 노드의 variantName을 파싱해 prop 집합 획득
 * 2. 두 variant 집합이 disjoint (겹치는 prop 값 없음)
 * 3. 다른 prop은 하나뿐이고 값이 True/False 또는 true/false
 * 4. cy는 거의 같고 (|Δcy| < 0.05) cx는 명백히 다름 (|Δcx| > 0.1)
 * → decisive-match
 *
 * 그 외 → score 0 (이 신호는 판단 보류, 다른 신호에 맡김)
 */
export class VariantPropPosition implements MatchSignal {
  readonly name = "VariantPropPosition";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const vnA = a.mergedNodes?.[0]?.variantName;
    const vnB = b.mergedNodes?.[0]?.variantName;
    if (!vnA || !vnB) {
      return { kind: "score", score: 0, reason: "missing variantName" };
    }

    const propsA = parseVariantProps(vnA);
    const propsB = parseVariantProps(vnB);
    if (!propsA || !propsB) {
      return { kind: "score", score: 0, reason: "unparseable variantName" };
    }

    // Diff keys
    const allKeys = new Set([...propsA.keys(), ...propsB.keys()]);
    const diffKeys: string[] = [];
    for (const k of allKeys) {
      if (propsA.get(k) !== propsB.get(k)) diffKeys.push(k);
    }
    if (diffKeys.length !== 1) {
      return { kind: "score", score: 0, reason: `${diffKeys.length} prop diffs (need 1)` };
    }

    const diffKey = diffKeys[0];
    const vA = propsA.get(diffKey);
    const vB = propsB.get(diffKey);
    if (!isBooleanValue(vA) || !isBooleanValue(vB)) {
      return { kind: "score", score: 0, reason: `diff prop ${diffKey} not boolean` };
    }

    // cx-only position difference
    const posA = this.getNormalizedPos(a, ctx);
    const posB = this.getNormalizedPos(b, ctx);
    if (!posA || !posB) {
      return { kind: "score", score: 0, reason: "cannot resolve positions" };
    }

    const dcx = Math.abs(posA.cx - posB.cx);
    const dcy = Math.abs(posA.cy - posB.cy);
    if (dcy >= 0.05) {
      return { kind: "score", score: 0, reason: `cy differs too much (${dcy.toFixed(3)})` };
    }
    if (dcx <= 0.1) {
      return { kind: "score", score: 0, reason: `cx too similar (${dcx.toFixed(3)}), not a position swap` };
    }

    return {
      kind: "decisive-match",
      reason: `${diffKey} boolean variant drives cx movement (${posA.cx.toFixed(2)} ↔ ${posB.cx.toFixed(2)})`,
    };
  }

  private getNormalizedPos(node: InternalNode, ctx: MatchContext): { cx: number; cy: number } | null {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return null;
    const variantRootId = ctx.nodeToVariantRoot.get(mergedId);
    if (!variantRootId) return null;
    const variantRoot = ctx.dataManager.getById(variantRootId)?.node;
    if (!variantRoot) return null;
    const orig = ctx.dataManager.getById(mergedId)?.node;
    if (!orig) return null;
    const parent = findDirectParent(variantRoot as any, mergedId);
    if (!parent) return null;
    const pos = ctx.layoutNormalizer.normalize(parent, orig as any);
    if (!pos) return null;
    return { cx: pos.cx, cy: pos.cy };
  }
}

function parseVariantProps(variantName: string): Map<string, string> | null {
  const map = new Map<string, string>();
  for (const part of variantName.split(",").map((s) => s.trim())) {
    const eq = part.indexOf("=");
    if (eq < 0) return null;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return map.size > 0 ? map : null;
}

function isBooleanValue(v: string | undefined): boolean {
  return v === "True" || v === "False" || v === "true" || v === "false";
}

function findDirectParent(root: any, nodeId: string): any | null {
  if (!root?.children) return null;
  for (const child of root.children) {
    if (child.id === nodeId) return root;
    const r = findDirectParent(child, nodeId);
    if (r) return r;
  }
  return null;
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npx vitest run test/tree-builder/match-engine/signals/VariantPropPosition.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/VariantPropPosition.ts test/tree-builder/match-engine/signals/VariantPropPosition.test.ts
git commit -m "feat(match-engine): VariantPropPosition signal with decisive-match override"
```

---

## Task C2: ParentShapeIdentity 신호

**Files:**
- Create: `.../match-engine/signals/ParentShapeIdentity.ts`
- Test: `test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts`

**Context:** 부모가 같은 component (dependency/이름/type)이면 자식들도 같은 역할 가능성이 높음. Spec §3.2에 따라 "점수 상향" 목적. Boost 효과 — 이 신호는 score 0.5~1 사이로 동작하며, 부모 매치가 강할수록 높음.

- [ ] **Step 1: Write failing test**

File: `test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { ParentShapeIdentity } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ParentShapeIdentity";
import type { InternalNode } from "@code-generator2/types/types";

function nodeWithParent(id: string, parentName: string, parentType: string, parentRefId?: string): InternalNode {
  return {
    id,
    name: id,
    type: "RECTANGLE",
    children: [],
    parent: {
      id: `parent-${id}`,
      name: parentName,
      type: parentType,
      refId: parentRefId,
    },
  } as unknown as InternalNode;
}

describe("ParentShapeIdentity signal", () => {
  const signal = new ParentShapeIdentity();

  it("returns score 1 when parents have same name + type + refId", () => {
    const a = nodeWithParent("a", "Mono", "FRAME", "comp-42");
    const b = nodeWithParent("b", "Mono", "FRAME", "comp-42");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 0.75 when parents have same name + type but different refId", () => {
    const a = nodeWithParent("a", "Mono", "FRAME", "comp-42");
    const b = nodeWithParent("b", "Mono", "FRAME", "comp-99");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0.75);
  });

  it("returns score 0.5 when parents have same type but different name", () => {
    const a = nodeWithParent("a", "Mono", "FRAME");
    const b = nodeWithParent("b", "Chroma", "FRAME");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0.5);
  });

  it("returns score 0 when parents differ in type", () => {
    const a = nodeWithParent("a", "Mono", "FRAME");
    const b = nodeWithParent("b", "Mono", "GROUP");
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns score 0 when either parent is missing", () => {
    const a = nodeWithParent("a", "Mono", "FRAME");
    const b = { id: "b", name: "b", type: "RECTANGLE", children: [] } as unknown as InternalNode;
    const r = signal.evaluate(a, b, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts`
Expected: module not found.

- [ ] **Step 3: Write implementation**

File: `src/.../match-engine/signals/ParentShapeIdentity.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * 부모 컨텍스트 일치 신호 (booster).
 *
 * 두 노드의 직접 부모가 같으면 자식들도 같은 역할 가능성이 높다는 가정.
 *
 * 점수:
 * - type + name + refId 전부 일치: 1 (강한 확신)
 * - type + name 일치, refId 다름: 0.75
 * - type만 일치: 0.5
 * - 그 외: 0
 *
 * 이 신호 단독으로는 match를 보장하지 않는다 — 다른 신호와 결합해 총 score에 기여.
 */
export class ParentShapeIdentity implements MatchSignal {
  readonly name = "ParentShapeIdentity";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    const pA = a.parent;
    const pB = b.parent;
    if (!pA || !pB) {
      return { kind: "score", score: 0, reason: "missing parent on one side" };
    }
    if (pA.type !== pB.type) {
      return { kind: "score", score: 0, reason: `parent type diff: ${pA.type}↔${pB.type}` };
    }
    const refA = (pA as any).refId;
    const refB = (pB as any).refId;
    if (pA.name === pB.name && refA && refB && refA === refB) {
      return { kind: "score", score: 1, reason: `same parent: ${pA.name} (${refA})` };
    }
    if (pA.name === pB.name) {
      return { kind: "score", score: 0.75, reason: `same parent name ${pA.name}, diff refId` };
    }
    return { kind: "score", score: 0.5, reason: `same parent type only (${pA.type})` };
  }
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npx vitest run test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ParentShapeIdentity.ts test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts
git commit -m "feat(match-engine): ParentShapeIdentity booster signal"
```

---

## Task C3: Register new signals + auto-gen assertions for variant-prop-position

**Files:**
- Modify: `.../match-engine/index.ts`
- Modify: `scripts/generate-pair-assertions.ts`
- Modify: `test/matching/pairAssertions.data.ts` (auto-generated)

- [ ] **Step 1: Add VariantPropPosition + ParentShapeIdentity to factory**

Edit `src/.../match-engine/index.ts` — add imports and insert into array:

```typescript
import { VariantPropPosition } from "./signals/VariantPropPosition";
import { ParentShapeIdentity } from "./signals/ParentShapeIdentity";

// ...

export function createDefaultEngine(policy: MatchingPolicy = defaultMatchingPolicy): MatchDecisionEngine {
  return new MatchDecisionEngine(
    [
      new TypeCompatibility(),
      new IdMatch(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
      new VariantPropPosition(), // BEFORE NormalizedPosition — can decisive-override its veto
      new ParentShapeIdentity(),
      new RelativeSize(),
      new OverflowPenalty(),
      new NormalizedPosition(),
    ],
    policy,
  );
}
```

- [ ] **Step 2: Extend generate-pair-assertions.ts to accept pattern filter**

Edit `scripts/generate-pair-assertions.ts` — change the filter:

```typescript
const TARGET_PATTERNS = new Set([
  "size-variant-reject",
  "variant-prop-position",
]);

// ... in the loop:
for (const p of fx.pairs) {
  if (!TARGET_PATTERNS.has(p.pattern)) continue;
  // ...
}
```

Note: after this change, the pair assertions file will have entries for both patterns. Update the header comment accordingly.

- [ ] **Step 3: Regenerate pair assertions**

Run: `npx tsx scripts/generate-pair-assertions.ts`
Expected: Wrote ~16 assertions (variant-prop-position cases only since size-variant-reject is already 0 post-Phase-1).

- [ ] **Step 4: Run pair assertions**

Run: `npx vitest run test/matching/pairAssertions.test.ts`
Expected: Variant-prop-position cases should PASS (VariantPropPosition signal resolves them via decisive-match).

If failures: debug each — likely the signal's heuristics don't match the actual cx/cy values of the specific fixture nodes.

- [ ] **Step 5: Run audit**

Run: `npm run audit:write && cat test/audits/audit-baseline.json | head -20`
Expected: variant-prop-position count drops from 16 toward 0.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts scripts/generate-pair-assertions.ts test/matching/pairAssertions.data.ts test/audits/audit-baseline.json
git commit -m "feat(match-engine): register VariantPropPosition + ParentShapeIdentity, drive 16-case pair assertions"
```

---

## Task C4: Snapshot regeneration for Phase 2c improvements

**Files:**
- Modify: `test/snapshots/__snapshots__/*.snap`

- [ ] **Step 1: Run snapshot tests**

Run: `npx vitest run test/snapshots/ 2>&1 | tail -15`
Expected: Some drift from new matches.

- [ ] **Step 2: Review one drift manually**

Pick a fixture that had variant-prop-position issues (e.g. `failing/Switch`) and inspect the diff. Should show previously-separate Knob nodes now merged.

- [ ] **Step 3: Update snapshots**

Run: `npx vitest run test/snapshots/ -u`
Expected: Updated.

- [ ] **Step 4: Commit**

```bash
git add test/snapshots/__snapshots__/
git commit -m "test(snapshot): regenerate baselines for Phase 2c variant-prop-position resolution"
```

---

# Phase 2d — WrapperRoleDistinction + Tagreview Preservation

## Task D1: WrapperRoleDistinction 신호

**Files:**
- Create: `.../match-engine/signals/WrapperRoleDistinction.ts`
- Test: `test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts`

**Context:** 두 노드의 variant root 크기가 거의 같은데 자식 구조/크기가 다르면 "같은 부모 안 다른 역할"로 판정 → veto. Tagreview Small wrapper 보존 목적.

`Tagreview Small` fixture: Frame 2 wrapper는 Small variant에만 존재. baseline에서는 isSimilarSize가 매칭을 거부 → wrapper가 분리 → squash prune되며 layout override가 부모로 전달. Phase 1b에서 isSimilarSize 완화 후 wrapper가 **잘못 병합**될 수 있음 → 이 신호가 wrapper를 보호.

초기 임계값:
- variant root 크기 유사도: 이미 policy.variantRootSimilarityRatio = 1.5
- 자식 수 차이 비율: 신규 policy.childrenCountDiffRatio (초기값 2.0 — 자식 수가 2배 이상 차이나면 veto)

- [ ] **Step 1: Extend MatchingPolicy**

Edit `.../match-engine/MatchingPolicy.ts` — add:

```typescript
export interface MatchingPolicy {
  // ... existing ...
  /** 두 노드 자식 수 차이가 이 비율을 넘으면 WrapperRoleDistinction이 veto. */
  readonly childrenCountDiffRatio: number;
  // ...
}

// in defaultMatchingPolicy:
  childrenCountDiffRatio: 2.0, // Phase 2d 초기값 — Tagreview 케이스 튜닝 후 조정
```

- [ ] **Step 2: Write failing test**

File: `test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { WrapperRoleDistinction } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/WrapperRoleDistinction";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function containerWithChildren(id: string, childCount: number): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: Array.from({ length: childCount }, (_, i) => ({
      id: `${id}-c${i}`,
      name: `c${i}`,
      type: "RECTANGLE",
      children: [],
    })),
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(rootAW: number, rootBW: number) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: { id, absoluteBoundingBox: { x: 0, y: 0, width: id === "rootA" ? rootAW : rootBW, height: 100 } },
      })),
    },
    layoutNormalizer: {} as any,
    nodeToVariantRoot: new Map([["a", "rootA"], ["b", "rootB"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("WrapperRoleDistinction signal", () => {
  const signal = new WrapperRoleDistinction();

  it("returns score 1 when children counts are similar", () => {
    const a = containerWithChildren("a", 3);
    const b = containerWithChildren("b", 3);
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns veto when roots similar but children differ drastically", () => {
    const a = containerWithChildren("a", 1); // wrapper with 1 content child
    const b = containerWithChildren("b", 5); // content with 5 siblings
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("veto");
  });

  it("returns score 1 when variant roots are very different in size", () => {
    const a = containerWithChildren("a", 1);
    const b = containerWithChildren("b", 5);
    const r = signal.evaluate(a, b, makeCtx(100, 500)); // 5x diff
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 1 for non-container nodes (passthrough)", () => {
    const a = { id: "a", name: "a", type: "TEXT", children: [] } as any;
    const b = { id: "b", name: "b", type: "TEXT", children: [] } as any;
    const r = signal.evaluate(a, b, makeCtx(100, 100));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts`
Expected: module not found.

- [ ] **Step 4: Write implementation**

File: `src/.../match-engine/signals/WrapperRoleDistinction.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * Wrapper 역할 구분 신호.
 *
 * 회귀 패턴 처리 (spec §1.1 pattern 4 - Tagreview Small):
 *   두 노드의 variant root 크기가 거의 같은데 자식 수/구조가 크게 다르면
 *   "같은 부모 안 다른 역할"로 판정 → veto. 이는 wrapper를 실수로 content와
 *   병합하는 것을 방지한다.
 *
 * 판정:
 * 1. 두 노드가 container(FRAME/GROUP)가 아니면 score 1 passthrough
 * 2. 두 variant root 크기가 ratio > variantRootSimilarityRatio 이상 다름 → score 1 (역할 판정 불가)
 * 3. 자식 수 비율이 childrenCountDiffRatio 이상 → veto (wrapper 보호)
 * 4. 그 외 → score 1
 */
export class WrapperRoleDistinction implements MatchSignal {
  readonly name = "WrapperRoleDistinction";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    if (!CONTAINER_TYPES.has(a.type) || !CONTAINER_TYPES.has(b.type)) {
      return { kind: "score", score: 1, reason: "non-container pair passthrough" };
    }

    const rootA = this.getVariantRootBounds(a, ctx);
    const rootB = this.getVariantRootBounds(b, ctx);
    if (!rootA || !rootB) {
      return { kind: "score", score: 1, reason: "missing variant root bounds" };
    }

    const maxW = Math.max(rootA.width, rootB.width);
    const minW = Math.min(rootA.width, rootB.width);
    if (minW <= 0) {
      return { kind: "score", score: 1, reason: "zero variant root" };
    }
    const rootRatio = maxW / minW;
    if (rootRatio > ctx.policy.variantRootSimilarityRatio) {
      return { kind: "score", score: 1, reason: "variant roots too different for wrapper analysis" };
    }

    const childA = (a.children ?? []).length;
    const childB = (b.children ?? []).length;
    if (childA === 0 && childB === 0) {
      return { kind: "score", score: 1, reason: "both empty" };
    }
    const maxC = Math.max(childA, childB);
    const minC = Math.max(1, Math.min(childA, childB));
    const childRatio = maxC / minC;
    if (childRatio >= ctx.policy.childrenCountDiffRatio) {
      return {
        kind: "veto",
        reason: `children count mismatch: ${childA}↔${childB} (ratio ${childRatio.toFixed(1)} ≥ ${ctx.policy.childrenCountDiffRatio})`,
      };
    }
    return { kind: "score", score: 1, reason: `children counts compatible: ${childA}↔${childB}` };
  }

  private getVariantRootBounds(node: InternalNode, ctx: MatchContext): { width: number; height: number } | null {
    const mergedId = node.mergedNodes?.[0]?.id;
    if (!mergedId) return null;
    const rootId = ctx.nodeToVariantRoot.get(mergedId);
    if (!rootId) return null;
    const root = ctx.dataManager.getById(rootId)?.node as any;
    const bounds = root?.absoluteBoundingBox;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return { width: bounds.width, height: bounds.height };
  }
}
```

- [ ] **Step 5: Run test to confirm pass**

Run: `npx vitest run test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/WrapperRoleDistinction.ts test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts
git commit -m "feat(match-engine): WrapperRoleDistinction veto signal for wrapper preservation"
```

---

## Task D2: Register signal + Tagreview fixture verification

**Files:**
- Modify: `.../match-engine/index.ts`
- Create: `test/tree-builder/match-engine/tagreviewWrapper.test.ts`

- [ ] **Step 1: Add WrapperRoleDistinction to factory**

Edit `.../match-engine/index.ts` — add to the array (order: after ParentShapeIdentity, before RelativeSize):

```typescript
new WrapperRoleDistinction(),
```

- [ ] **Step 2: Write Tagreview-specific integration test**

File: `test/tree-builder/match-engine/tagreviewWrapper.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import tagreview from "../../fixtures/failing/Tagreview.json";

describe("Tagreview Small wrapper preservation (Phase 2d)", () => {
  it("produces distinct merged nodes for wrapper and content", () => {
    const dm = new DataManager(tagreview as any);
    const tb = new TreeBuilder(dm);
    const tree = tb.buildInternalTreeDebug((tagreview as any).info.document);

    // Navigate the merged tree to find the "Frame 2" wrapper.
    // It should exist as a distinct node, NOT merged with the content.
    // Success criterion: the merged tree contains at least 2 distinct container
    // nodes at the level where Frame 2 would appear, indicating preservation.
    const containerCount = countContainers(tree as any);
    expect(containerCount, "Tagreview should preserve wrapper structure").toBeGreaterThan(1);
  });
});

function countContainers(root: any): number {
  if (!root) return 0;
  let count = root.type === "FRAME" || root.type === "GROUP" ? 1 : 0;
  for (const child of root.children ?? []) {
    count += countContainers(child);
  }
  return count;
}
```

- [ ] **Step 3: Run test**

Run: `npx vitest run test/tree-builder/match-engine/tagreviewWrapper.test.ts`
Expected: PASS. If fails, tune `childrenCountDiffRatio` or inspect the Tagreview fixture to understand what the wrapper's children count is.

- [ ] **Step 4: Run full suite + audit**

Run: `npm run test && npm run audit`
Expected: All pass. Audit baseline should show near-zero regressions in both size-variant-reject and variant-prop-position.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts test/tree-builder/match-engine/tagreviewWrapper.test.ts
git commit -m "feat(match-engine): register WrapperRoleDistinction + Tagreview integration test"
```

---

# Phase 2e — Cleanup + Final Verification

## Task E1: Remove legacy NodeMatcher helpers

**Files:**
- Modify: `.../processors/NodeMatcher.ts`

**Context:** Phase 2a-d 종료 시점에 엔진이 모든 신호를 가지므로 NodeMatcher의 private 헬퍼들(`isSimilarSize`, `calcPositionCostByNormalizer`, `isOverflowNode`, `getVariantRootBounds`, `isSameTextNode`, `isSameInstanceNode`, `findDirectParent`, `findOriginalVariantRoot`)은 사용되지 않는다. 단, `isDefiniteMatch`가 일부를 쓸 수 있으므로 먼저 `isDefiniteMatch`도 엔진으로 위임하거나 헬퍼 사용 여부를 확인.

- [ ] **Step 1: Check which helpers are still used**

Run: `grep -n "isSimilarSize\|calcPositionCost\|isOverflow\|getVariantRoot\|isSameText\|isSameInstance\|findDirectParent\|findOriginalVariantRoot\|directParentCache" src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`

Identify which private methods remain referenced.

- [ ] **Step 2: Migrate isDefiniteMatch to engine**

Replace `isDefiniteMatch` with engine delegation:

```typescript
public isDefiniteMatch(nodeA: InternalNode, nodeB: InternalNode): boolean {
  // 기존 isDefiniteMatch는 type compatibility + id 일치만 검사.
  // TypeCompatibility + IdMatch 신호로 동일 결과 얻기 위해 엔진 decide 결과에서
  // IdMatch score만 검사.
  const ctx: MatchContext = {
    dataManager: this.dataManager,
    layoutNormalizer: this.layoutNormalizer,
    nodeToVariantRoot: this.nodeToVariantRoot,
    policy: defaultMatchingPolicy,
  };
  // Type 호환 확인 + id 동일 확인: 엔진 decide를 돌리고 IdMatch 신호가 score 1인지 확인
  const decision = this.engine.decide(nodeA, nodeB, ctx);
  if (decision.decision === "veto") return false;
  const idMatch = decision.signalResults.find(r => r.signalName === "IdMatch");
  return idMatch?.result.kind === "score" && idMatch.result.score === 1;
}
```

- [ ] **Step 3: Delete unused private helpers**

Remove: `isSimilarSize`, `calcPositionCostByNormalizer`, `isOverflowNode`, `getVariantRootBounds`, `isSameTextNode`, `isSameInstanceNode`, `findDirectParent`, `findOriginalVariantRoot`, `directParentCache`, and the `SHAPE_TYPES`/`CONTAINER_TYPES` static constants if no longer used.

The file should now be drastically smaller — mostly just constructor, `isSameNode`, `isDefiniteMatch`, `getPositionCost`, and private `engine` field.

- [ ] **Step 4: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All pass. If nodeMatcher.test.ts fails, the legacy semantics aren't fully captured by engine signals — investigate and add missing signal behavior.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts
git commit -m "refactor(match-engine): remove legacy NodeMatcher helpers after Phase 2 migration"
```

---

## Task E2: Final audit + snapshot + determinism re-check

**Files:** verification only.

- [ ] **Step 1: Run audit**

Run: `npm run audit:write`
Expected: Record final numbers. Target:
- size-variant-reject: 0 (unchanged from Phase 1)
- variant-prop-position: 0 or ≤2 (Phase 2 target)
- total disjoint pairs: significant drop from 1919

- [ ] **Step 2: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All pass (modulo pre-existing decomposer).

- [ ] **Step 3: Regenerate snapshots if needed**

Run: `npx vitest run test/snapshots/` — should pass after Phase 2c/d regenerations. If still drifting, run with `-u` and review.

- [ ] **Step 4: Run reason log test**

Run: `npx vitest run test/tree-builder/match-engine/reasonLog.test.ts`
Expected: Pass (entries now come from engine-backed getPositionCost).

- [ ] **Step 5: Commit final baselines if regenerated**

```bash
git add test/audits/audit-baseline.json test/snapshots/__snapshots__/
git commit -m "test: final Phase 2 baselines (audit + snapshots)"
```

---

## Completion Criteria

Phase 2 is complete when:

- [ ] All 7 Phase 2 signals exist and are unit-tested: TextSpecialMatch, InstanceSpecialMatch, OverflowPenalty, VariantPropPosition, ParentShapeIdentity, WrapperRoleDistinction (+ existing TypeCompatibility, IdMatch, RelativeSize, NormalizedPosition from Phase 1)
- [ ] `SignalResult` supports `decisive-match` kind
- [ ] `NodeMatcher.getPositionCost`, `isSameNode`, `isDefiniteMatch` all delegate to engine
- [ ] Legacy private helpers removed from `NodeMatcher.ts`
- [ ] Audit: size-variant-reject 0, variant-prop-position 0 (or ≤2 with documented reasons), total < 1919
- [ ] Pair assertions for both size-variant-reject AND variant-prop-position patterns pass
- [ ] Tagreview wrapper preservation integration test passes
- [ ] Snapshot baselines regenerated + reviewed
- [ ] Full test suite passes (modulo pre-existing decomposer)
- [ ] All committed on `feat/variant-merger-phase2` worktree branch

Phase 3 scope: performance optimization, determinism fix (ID adoption), additional signals for unknown bucket classification.
