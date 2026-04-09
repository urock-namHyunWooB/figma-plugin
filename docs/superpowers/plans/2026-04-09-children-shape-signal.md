# ChildrenShape Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** container pair (FRAME/GROUP)에 대해 NodeMatcher가 위치뿐 아니라 자식 구조도 고려하도록 `ChildrenShape` 신호를 추가하고, NormalizedPosition의 container-pair short-circuit을 풀어 cost 합산이 이뤄지게 한다. 목표는 cross-name 매칭(현재 119건) 감소 + audit 회귀 0건 증가.

**Architecture:** 기존 match-engine 신호 파이프라인에 새 신호 한 개를 삽입한다. NormalizedPosition은 container pair일 때만 `decisive-match-with-cost` → `match-with-cost`로 강등해서 ChildrenShape가 뒤이어 cost를 추가할 수 있게 한다. 엔진(`MatchDecisionEngine`)과 `NodeMatcher` wiring은 변경하지 않는다. `childrenShapeWeight` 정책 파라미터 한 개만 추가.

**Tech Stack:** TypeScript 5.3, vitest 4, Node.js ≥22

**Spec:** `docs/superpowers/specs/2026-04-09-children-shape-signal-design.md`

---

## File Structure

**새로 생성**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ChildrenShape.ts` — 새 신호. container pair에서 자식 구조 cost 계산 (Task 1)
- `test/tree-builder/match-engine/signals/ChildrenShape.test.ts` — 단위 테스트 (Task 1)

**수정**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts` — `childrenShapeWeight` 추가 + `signalWeights.ChildrenShape` 추가 (Task 1)
- `test/tree-builder/match-engine/MatchingPolicy.test.ts` (존재 시) — 새 필드 확인 (Task 1)
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts` — 마지막 return에서 container pair 분기 (Task 2)
- `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts` — container pair match-with-cost 케이스 추가 (Task 2)
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts` — 신호 등록 (Task 3)

**갱신될 baseline**:
- `test/audits/audit-baseline.json` (Task 4)
- `test/audits/baselines/anomaly-baseline.json` (Task 4)

---

## Task 1: ChildrenShape 신호 + Policy 필드

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ChildrenShape.ts`
- Create: `test/tree-builder/match-engine/signals/ChildrenShape.test.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts`

**목적**: 새 신호 파일과 정책 필드를 동시에 만든다. 신호는 container pair의 자식 구조를 점수로 환산해 `match-with-cost`를 반환. TDD 순서(test → 구현 → verify).

- [ ] **Step 1: MatchingPolicy에 `childrenShapeWeight` 필드 + `signalWeights.ChildrenShape` 추가**

Edit `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts`:

interface에 (line 26 뒤, signalWeights 블록 앞에) 추가:

```typescript
  /** ChildrenShape: container pair 자식 구조 점수 cost에 곱할 가중치. 1.0 = raw score 그대로 사용. */
  readonly childrenShapeWeight: number;
```

interface의 `signalWeights` 블록에 `ChildrenShape: number` 필드 추가:

```typescript
  readonly signalWeights: {
    readonly TypeCompatibility: number;
    readonly IdMatch: number;
    readonly NormalizedPosition: number;
    readonly RelativeSize: number;
    readonly ChildrenShape: number;
  };
```

`defaultMatchingPolicy` 객체에 `childrenShapeWeight: 1.0` 추가 (matchCostThreshold 뒤, childrenCountDiffRatio 앞 권장):

```typescript
  childrenShapeWeight: 1.0, // Phase 3: cross-name container 매칭 감소용 (출발점, audit 결과 보고 조정)
```

그리고 `signalWeights` 블록에 `ChildrenShape: 1` 추가:

```typescript
  signalWeights: {
    TypeCompatibility: 1,
    IdMatch: 1,
    NormalizedPosition: 1,
    RelativeSize: 1,
    ChildrenShape: 1,
  },
```

- [ ] **Step 2: ChildrenShape 단위 테스트 작성 (failing)**

Create `test/tree-builder/match-engine/signals/ChildrenShape.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ChildrenShape } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ChildrenShape";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(
  id: string,
  type: string,
  children: InternalNode[] = []
): InternalNode {
  return {
    id,
    name: id,
    type: type as any,
    children,
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function ctx() {
  return {
    dataManager: {} as any,
    layoutNormalizer: {} as any,
    nodeToVariantRoot: new Map(),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("ChildrenShape signal", () => {
  const signal = new ChildrenShape();

  it("returns neutral when either node is not a container type", () => {
    const a = node("a", "TEXT");
    const b = node("b", "TEXT");
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when one side is container and the other is not", () => {
    const a = node("a", "FRAME", [node("c1", "TEXT")]);
    const b = node("b", "TEXT");
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when both containers have zero children", () => {
    const a = node("a", "FRAME", []);
    const b = node("b", "FRAME", []);
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("neutral");
  });

  it("returns match-with-cost 0 when children count and types are identical", () => {
    const a = node("a", "FRAME", [
      node("c1", "TEXT"),
      node("c2", "FRAME"),
      node("c3", "INSTANCE"),
    ]);
    const b = node("b", "FRAME", [
      node("d1", "TEXT"),
      node("d2", "FRAME"),
      node("d3", "INSTANCE"),
    ]);
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") expect(r.cost).toBe(0);
  });

  it("returns cost proportional to children count mismatch when types match", () => {
    // A has 3 FRAME children, B has 1 FRAME child
    // countDiff = |3-1|/3 = 0.667
    // typeDiff  = (|3-1| for FRAME) / (3+1) = 2/4 = 0.5
    // score     = 0.5*0.667 + 0.5*0.5 = 0.583
    const a = node("a", "FRAME", [
      node("c1", "FRAME"),
      node("c2", "FRAME"),
      node("c3", "FRAME"),
    ]);
    const b = node("b", "FRAME", [node("d1", "FRAME")]);
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") {
      expect(r.cost).toBeGreaterThan(0.5);
      expect(r.cost).toBeLessThan(0.7);
    }
  });

  it("returns cost proportional to children type pattern mismatch when counts match", () => {
    // A: [FRAME, FRAME], B: [TEXT, TEXT]
    // countDiff = 0
    // typeDiff  = (|2-0| FRAME + |0-2| TEXT) / 4 = 4/4 = 1.0
    // score     = 0.5*0 + 0.5*1.0 = 0.5
    const a = node("a", "FRAME", [node("c1", "FRAME"), node("c2", "FRAME")]);
    const b = node("b", "FRAME", [node("d1", "TEXT"), node("d2", "TEXT")]);
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") {
      expect(r.cost).toBeCloseTo(0.5, 2);
    }
  });

  it("known Wrapper(3)↔Interaction(1) pattern produces cost ≥ 0.5", () => {
    // Real-world case: Wrapper has Loading/Mask/Content (FRAME), Interaction has single INSTANCE
    // countDiff = |3-1|/3 = 0.667
    // typeDiff  = (|3-0| FRAME + |0-1| INSTANCE) / 4 = 4/4 = 1.0
    // score     = 0.5*0.667 + 0.5*1.0 = 0.833
    const wrapper = node("wrapper", "FRAME", [
      node("loading", "FRAME"),
      node("mask", "FRAME"),
      node("content", "FRAME"),
    ]);
    const interaction = node("interaction", "FRAME", [
      node("click", "INSTANCE"),
    ]);
    const r = signal.evaluate(wrapper, interaction, ctx());
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") {
      expect(r.cost).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("multiplies raw score by policy.childrenShapeWeight", () => {
    const a = node("a", "FRAME", [
      node("c1", "FRAME"),
      node("c2", "FRAME"),
      node("c3", "FRAME"),
    ]);
    const b = node("b", "FRAME", [node("d1", "INSTANCE")]);
    const halfWeightCtx = {
      ...ctx(),
      policy: { ...defaultMatchingPolicy, childrenShapeWeight: 0.5 },
    };
    const fullWeightCtx = ctx();
    const rFull = signal.evaluate(a, b, fullWeightCtx);
    const rHalf = signal.evaluate(a, b, halfWeightCtx);
    if (rFull.kind !== "match-with-cost" || rHalf.kind !== "match-with-cost") {
      throw new Error("expected match-with-cost");
    }
    expect(rHalf.cost).toBeCloseTo(rFull.cost * 0.5, 5);
  });

  it("GROUP pair is treated as container", () => {
    const a = node("a", "GROUP", [node("c1", "FRAME")]);
    const b = node("b", "GROUP", [node("d1", "FRAME"), node("d2", "FRAME")]);
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("match-with-cost");
  });

  it("FRAME ↔ GROUP is treated as container pair", () => {
    const a = node("a", "FRAME", [node("c1", "FRAME")]);
    const b = node("b", "GROUP", [node("d1", "FRAME")]);
    const r = signal.evaluate(a, b, ctx());
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") expect(r.cost).toBe(0);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run test/tree-builder/match-engine/signals/ChildrenShape.test.ts`
Expected: FAIL — "Cannot find module ChildrenShape" 또는 유사한 모듈 해결 실패.

- [ ] **Step 4: ChildrenShape 신호 구현**

Create `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ChildrenShape.ts`:

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * ChildrenShape — container pair의 자식 구조를 cost로 환산.
 *
 * 의도: Variant Merger가 위치만 보고 "이름·자식 구조가 다른" 컨테이너를 같은
 * 노드로 매칭하는 문제(예: Wrapper↔Interaction)를 막기 위한 보조 신호.
 *
 * 공식 (raw score, 0~1):
 *   countDiff = |lenA - lenB| / max(lenA, lenB)
 *   typeDiff  = Σ|countA[type] - countB[type]| / (lenA + lenB)
 *   score     = 0.5 * countDiff + 0.5 * typeDiff
 *
 * 반환:
 *   - container pair가 아니면 neutral
 *   - 둘 다 자식 0개면 neutral
 *   - 그 외 match-with-cost(policy.childrenShapeWeight × score)
 *
 * 엔진 파이프라인에서 NormalizedPosition(container pair일 때 match-with-cost) 다음에
 * 배치되어 cost가 누적된다. totalCost > matchCostThreshold면 엔진이 veto 처리.
 */
export class ChildrenShape implements MatchSignal {
  readonly name = "ChildrenShape";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    if (!CONTAINER_TYPES.has(a.type) || !CONTAINER_TYPES.has(b.type)) {
      return { kind: "neutral", reason: "non-container pair" };
    }

    const childrenA = a.children ?? [];
    const childrenB = b.children ?? [];
    const lenA = childrenA.length;
    const lenB = childrenB.length;

    if (lenA === 0 && lenB === 0) {
      return { kind: "neutral", reason: "both containers empty" };
    }

    const maxLen = Math.max(lenA, lenB);
    const countDiff = Math.abs(lenA - lenB) / maxLen;

    const typeCountsA = new Map<string, number>();
    const typeCountsB = new Map<string, number>();
    for (const c of childrenA) {
      typeCountsA.set(c.type, (typeCountsA.get(c.type) ?? 0) + 1);
    }
    for (const c of childrenB) {
      typeCountsB.set(c.type, (typeCountsB.get(c.type) ?? 0) + 1);
    }
    const allTypes = new Set<string>([
      ...typeCountsA.keys(),
      ...typeCountsB.keys(),
    ]);
    let absDiff = 0;
    for (const t of allTypes) {
      absDiff += Math.abs((typeCountsA.get(t) ?? 0) - (typeCountsB.get(t) ?? 0));
    }
    const typeDiff = absDiff / (lenA + lenB);

    const score = 0.5 * countDiff + 0.5 * typeDiff;
    const cost = ctx.policy.childrenShapeWeight * score;

    return {
      kind: "match-with-cost",
      cost,
      reason: `children shape score ${score.toFixed(3)} (count=${countDiff.toFixed(3)}, type=${typeDiff.toFixed(3)})`,
    };
  }
}
```

- [ ] **Step 5: 단위 테스트 통과 확인**

Run: `npx vitest run test/tree-builder/match-engine/signals/ChildrenShape.test.ts`
Expected: PASS (10 tests). 모든 케이스 통과.

- [ ] **Step 6: 기존 match-engine 테스트에 영향 없는지 확인**

Run: `npx vitest run test/tree-builder/match-engine/`
Expected: PASS. MatchDecisionEngine, MatchSignal, MatchingPolicy, determinism, reasonLog, 그리고 signals/* 모두 통과.

만약 `MatchingPolicy.test.ts`가 필드 구조를 엄격 검증해서 실패하면, 해당 테스트의 expected 객체에 `childrenShapeWeight: 1.0`과 `signalWeights.ChildrenShape: 1`을 추가.

- [ ] **Step 7: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ChildrenShape.ts src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts test/tree-builder/match-engine/signals/ChildrenShape.test.ts
# MatchingPolicy.test.ts가 같이 수정됐다면 그것도 add
git commit -m "$(cat <<'EOF'
feat(match-engine): ChildrenShape 신호 + MatchingPolicy.childrenShapeWeight 추가

container pair의 자식 구조를 점수로 환산해 match-with-cost를 반환하는
새 신호. 공식 = 0.5 × count 차이 + 0.5 × type 패턴 차이. non-container
pair나 빈 컨테이너 쌍은 neutral. policy.childrenShapeWeight로 가중치
튜닝 가능 (출발점 1.0).

아직 엔진에 등록하지 않았음 — Task 3에서 등록한 후 Task 4에서 audit
측정.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: NormalizedPosition container-pair short-circuit 강등

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts`
- Modify: `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`

**목적**: container pair (FRAME/GROUP)일 때만 `decisive-match-with-cost` → `match-with-cost`로 강등. 다른 type pair는 기존 동작 유지. 이 변경 자체는 엔진 동작을 크게 바꾸지 않음 (ChildrenShape가 등록되기 전까지 container pair에서 cost만 추가됨, 다른 신호들은 여전히 neutral 반환).

- [ ] **Step 1: NormalizedPosition 테스트 수정 + 새 케이스 추가**

Edit `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`.

**1a. 기존 첫 번째 테스트 `"returns decisive-match-with-cost 0 when raw posCost is 0"` 수정**

기존 `node()` 헬퍼(L6-L14)가 type `"FRAME"`을 default로 반환하므로 이 테스트는 FRAME↔FRAME pair에 대해 `decisive-match-with-cost`를 기대하고 있다. 변경 후 FRAME pair는 `match-with-cost`를 반환할 것이므로 기대값을 갱신한다.

기존 L44-L50:

```typescript
  it("returns decisive-match-with-cost 0 when raw posCost is 0", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBe(0);
  });
```

으로 교체:

```typescript
  it("returns match-with-cost 0 for FRAME pair when raw posCost is 0", () => {
    const a = { ...node("x"), parent: {} } as any;
    const b = { ...node("y"), parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") expect(r.cost).toBe(0);
  });
```

**1b. 파일의 다른 기존 테스트도 같은 방식으로 수정**

파일 전체를 읽고 `toBe("decisive-match-with-cost")`가 나오는 모든 케이스를 확인한다:

Run: `grep -n "decisive-match-with-cost" test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`

검출된 각 위치에 대해 테스트 fixture가 FRAME pair(기본값)인지 non-container type을 명시했는지 확인한다:
- FRAME pair (default `node()`) 또는 GROUP pair면 → `match-with-cost`로 갱신
- TEXT/INSTANCE/RECTANGLE 등 non-container면 → 그대로 두기

테스트 중 `parent: null` 또는 `parent: undefined`로 루트 노드를 테스트하는 케이스(`"both root nodes"` 분기)는 변경하지 않는다. 루트 분기는 마지막 return을 거치지 않으므로 영향 없음.

**1c. 새 테스트 2개 추가**

describe 블록 마지막에 추가:

```typescript
  it("returns match-with-cost (not decisive) for GROUP pair so later signals can add cost", () => {
    const a = { ...node("x"), type: "GROUP", parent: {} } as any;
    const b = { ...node("y"), type: "GROUP", parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("match-with-cost");
    if (r.kind === "match-with-cost") expect(r.cost).toBe(0);
  });

  it("keeps decisive-match-with-cost for non-container pair (TEXT)", () => {
    const a = { ...node("x"), type: "TEXT", parent: {} } as any;
    const b = { ...node("y"), type: "TEXT", parent: {} } as any;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") expect(r.cost).toBe(0);
  });
```

- [ ] **Step 2: 새 테스트 실패 확인**

Run: `npx vitest run test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`
Expected: 새 "returns match-with-cost for FRAME pair" 테스트 FAIL — 현재는 여전히 `decisive-match-with-cost`를 반환하기 때문.

- [ ] **Step 3: NormalizedPosition.ts의 마지막 return을 container 분기로 수정**

Edit `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts`:

파일 마지막 return (현재 L104-108):

```typescript
    return {
      kind: "decisive-match-with-cost",
      cost: totalCost,
      reason: `pos cost ${cost.toFixed(3)}${totalCost !== cost ? ` + overflow ${ctx.policy.overflowMismatchPenalty}` : ""}`,
    };
```

을 다음으로 교체:

```typescript
    // Phase 3: container pair에 한해 match-with-cost로 강등해서 ChildrenShape가
    // 뒤이어 cost를 추가할 수 있게 한다. TEXT/INSTANCE/SHAPE pair는 기존 동작 유지
    // (Phase 2 cost form 재설계 결정: fallback signal 중복 방지).
    const isContainerPair =
      CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type);
    return {
      kind: isContainerPair ? "match-with-cost" : "decisive-match-with-cost",
      cost: totalCost,
      reason: `pos cost ${cost.toFixed(3)}${totalCost !== cost ? ` + overflow ${ctx.policy.overflowMismatchPenalty}` : ""}`,
    };
```

(`CONTAINER_TYPES`는 파일 상단 L7에 이미 정의되어 있으므로 추가 import 불필요.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`
Expected: PASS. 새로 추가한 두 케이스와 기존 (수정된) 케이스 모두 통과.

- [ ] **Step 5: 엔진 통합 테스트 영향 확인**

Run: `npx vitest run test/tree-builder/match-engine/`
Expected: PASS. 모든 match-engine 테스트 통과.

단, `MatchDecisionEngine.test.ts`나 `determinism.test.ts`에서 container pair에 대한 assertion이 `decisive-match-with-cost`를 기대하는 경우가 있을 수 있음. 그 경우:
- assertion이 kind 자체를 검증하면 `match-with-cost`로 업데이트
- totalCost만 검증하면 그대로 통과할 것
실제 실패 출력 보고 최소 수정으로 대응.

- [ ] **Step 6: audit은 아직 실행하지 않음**

ChildrenShape가 엔진에 아직 등록되지 않았으므로 이 시점에 `npm run audit`을 돌려도 회귀 증가가 생길 수 있다 (NP가 cost만 남기고 끝, 다른 신호 중 아무도 매치 주장 안 함 → `anyMatchIndication=false` → veto). Task 3에서 ChildrenShape를 등록한 뒤 Task 4에서 함께 측정한다.

- [ ] **Step 7: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts test/tree-builder/match-engine/signals/NormalizedPosition.test.ts
# 다른 match-engine 테스트가 수정됐다면 함께 add
git commit -m "$(cat <<'EOF'
refactor(match-engine): NormalizedPosition container pair short-circuit 강등

container pair(FRAME/GROUP)일 때만 decisive-match-with-cost 대신
match-with-cost를 반환. TEXT/INSTANCE/SHAPE pair는 기존 동작 유지.
이로써 후속 신호(ChildrenShape, Task 3에서 등록)가 cost를 추가할 수 있음.

Phase 2 cost form 재설계의 "mutually exclusive fallback" 불변식은
container pair 밖에서만 유지한다. container pair에서는
Text/InstanceSpecialMatch가 type guard로 자동 배제되므로 중복 cost 위험 없음.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: match-engine에 ChildrenShape 신호 등록

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts`

**목적**: `createDefaultEngine` 신호 배열에 `ChildrenShape`를 `NormalizedPosition` 바로 뒤에 추가. 이 순서로 해야 container pair의 cost가 NP + ChildrenShape 순으로 누적된다.

- [ ] **Step 1: index.ts에 import와 등록 추가**

Edit `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts`:

import 블록 (현재 L2-L9)에 `ChildrenShape` 추가:

```typescript
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { ChildrenShape } from "./signals/ChildrenShape";
```

(NormalizedPosition import 바로 다음 줄)

`createDefaultEngine` 내 신호 배열 (현재 L40-L48)에 `new ChildrenShape()`를 `new NormalizedPosition()` 바로 뒤, `new VariantPropPosition()` 앞에 추가:

```typescript
  return new MatchDecisionEngine(
    // Phase 2d 결정: WrapperRoleDistinction은 정의돼 있지만 등록하지 않는다.
    // 이유: Tagreview는 이미 NormalizedPosition의 size check로 보존되고 있어
    // 추가 wrapper veto가 불필요. 등록 시 Headersub/SegmentedControl에 false positive 발생.
    [
      new TypeCompatibility(),
      new IdMatch(),
      new NormalizedPosition(),
      new ChildrenShape(),
      new VariantPropPosition(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
      new ParentShapeIdentity(),
    ],
    policy,
  );
```

파일 상단 주석 블록(L17-L32)의 신호 순서 설명에도 ChildrenShape 한 줄 끼워넣기 (optional — 추가하면 문서성 향상, 생략해도 동작엔 영향 없음). 간결을 위해 다음만 추가:

```
 * 3.5. ChildrenShape — container pair 자식 구조 cost. NP가 container pair에서
 *      match-with-cost로 강등됐을 때만 의미 있게 동작. 다른 pair에서는 neutral.
```

- [ ] **Step 2: 엔진 테스트로 sanity 확인**

Run: `npx vitest run test/tree-builder/match-engine/`
Expected: PASS. 모든 기존 엔진 테스트 통과 (엔진은 새 신호를 단순히 파이프라인에 추가한 것이므로 기존 동작과 호환).

만약 `determinism.test.ts`가 신호 수를 하드코딩해서 검증하는 경우 실패할 수 있음. 그 경우 expected 숫자를 +1.

- [ ] **Step 3: 전체 tree-builder 테스트 sanity 확인**

Run: `npx vitest run test/tree-builder/`
Expected: PASS. 이 레벨에서 깨지는 테스트가 나오면 Task 4의 audit 단계로 넘어가기 전에 원인을 식별해야 한다. 단순히 fixture 기반 회귀일 가능성이 있으니 실패 로그의 패턴을 메모하고 Task 4에서 종합 판단한다.

- [ ] **Step 4: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts
git commit -m "$(cat <<'EOF'
feat(match-engine): ChildrenShape 신호를 기본 엔진에 등록

NormalizedPosition 다음, VariantPropPosition 앞에 배치.
container pair에서 NP가 match-with-cost로 cost를 제출하면
ChildrenShape가 자식 구조 cost를 누적한다.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Audit / Anomaly 측정 + 가중치 조정 루프 + baseline 갱신

**Files:**
- Possibly modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts` (튜닝 필요 시)
- Update: `test/audits/audit-baseline.json`
- Update: `test/audits/baselines/anomaly-baseline.json`

**목적**: 실제 엔진 동작에서 회귀 변화 측정. 회귀 0건 / anomaly 감소가 목표. 필요 시 `childrenShapeWeight` 튜닝 반복.

- [ ] **Step 1: `npm run audit:diff` 실행 — 회귀 변화 확인**

Run: `npm run audit:diff`
출력을 꼼꼼히 확인:
- "Total: 1856 → N (delta)" — N이 증가했다면 새 회귀 발생. 감소했다면 개선.
- "Patterns:" 섹션 — 어느 패턴이 바뀌었는지
- "New regressions" 섹션 — 어느 fixture에서 어느 pair가 새로 생겼는지
- "Resolved regressions" 섹션 — 어느 pair가 사라졌는지

**새 회귀가 0건이면** Step 4로 진행.
**새 회귀가 있으면** Step 2로 진행.

- [ ] **Step 2: 새 회귀 원인 추적 — `npm run audit:trace`**

새 회귀 목록에서 첫 pair를 고른다 (예: `failing/Switch  parent=74:150  74:157 ↔ 74:153  [pattern]`).

Run:
```bash
TRACE_FIXTURE=failing/Switch TRACE_A=74:157 TRACE_B=74:153 npm run audit:trace
```

출력의 signal 표를 읽고 어느 신호가 결정에 기여했는지 파악:
- ChildrenShape cost가 크면 → 이 pair는 자식 구조 차이 때문에 거부됨. 이게 **정당한 거부**인지(cross-name bug) **과잉 거부**인지(legitimate) 확인.
- 둘 다 container인데 legitimate하게 자식 구조가 다를 수 있음 (예: variant 간에 자식 개수 1개 차이).

새 회귀가 **전부 정당한 거부**라면 회귀 자체가 "이 pair는 매치 안 하는 게 맞음"일 수도 있음 — audit의 classifyPattern이 이들을 disjoint로 잡긴 해도 실제로 bug가 아닐 수 있다. 이 경우 사용자에게 보고하고 함께 판단.

새 회귀가 **과잉 거부**로 판단되면 Step 3으로.

- [ ] **Step 3: 가중치 튜닝 — `childrenShapeWeight` 조정**

Edit `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts`:

한 번에 한 값만 바꾼다 (실험 추적 위해):

```typescript
childrenShapeWeight: 0.7, // was 1.0
```

또는:

```typescript
childrenShapeWeight: 0.5,
```

Step 1로 돌아가서 `npm run audit:diff` 재실행. 다음과 같이 반복:
- weight 0.7 시도 → 결과 측정
- 회귀가 줄었지만 0이 아니면 0.5 시도
- 0.5에서도 회귀가 있으면 문제 pair 개별 trace + 구조적 한계 판단

**상한**: 3회 이내에 수렴하지 않으면 Step 5(롤백/상의)로 이동.

- [ ] **Step 4: 회귀 0건 + 개선 확인 시 baseline 갱신**

새 회귀 0건이 되었고 개선(resolved regressions 또는 감소한 total)이 관찰되면:

Run: `npm run audit:write`
Expected: "Baseline written" 메시지. `test/audits/audit-baseline.json` 업데이트됨.

Run: `npm run audit:anomaly:write`
Expected: "Anomaly baseline written" 메시지. `test/audits/baselines/anomaly-baseline.json` 업데이트됨. Total이 119보다 낮은 숫자가 되어야 함 (cross-name 감소가 목표).

Run: `npm run audit:anomaly`
Expected: PASS, "Total: (줄어든 숫자) → (같은 숫자) (+0)". baseline과 일치.

Run: `npm run audit`
Expected: PASS. 이전보다 같거나 낮은 회귀 숫자.

- [ ] **Step 5: (수렴 안 할 때) 사용자에게 보고**

만약 Step 3에서 3회 튜닝 후에도 회귀 0건을 달성 못 하면:
1. 현재 관찰된 trade-off를 요약 (어느 회귀가 남는지, childrenShapeWeight 값별 효과)
2. 사용자에게 옵션 제시:
   - (a) 일부 회귀 수용하고 머지
   - (b) spec 재검토 (공식 수정, 추가 신호, 또는 새 접근)
   - (c) Task 1-3 롤백 (`git reset --hard` 이전 commit)
3. 결정 대기. 이 경우 Step 6으로 진행하지 않는다.

- [ ] **Step 6: snapshot / 전체 테스트 회귀 확인**

Run: `npm run test`
Expected: 이전 main repo 상태와 비교해 신규 실패 0건. 이전에 있던 pre-existing failure(예: decomposer.test.ts, allFixtures.test.ts의 Buttonsolid/Checkbox)는 이 작업과 무관하므로 허용.

- [ ] **Step 7: 커밋 — baseline 갱신 + (혹은) 튜닝 변경**

```bash
git add test/audits/audit-baseline.json test/audits/baselines/anomaly-baseline.json
# 튜닝 변경이 있었다면 MatchingPolicy.ts도 add
# (위 Step 3에서 childrenShapeWeight를 수정했다면)

git commit -m "$(cat <<'EOF'
chore(audit): ChildrenShape 신호 도입 후 baseline 갱신

audit-baseline.json: 회귀 N → M (감소)
anomaly-baseline.json: cross-name 119 → K (감소)

[튜닝 변경이 있었다면 아래 한 줄 추가]
childrenShapeWeight 1.0 → 0.X로 조정 (Step 3 audit:diff 루프 참조).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 완료 검증

모든 task 완료 후 다음을 확인:

- [ ] **`npx vitest run test/tree-builder/match-engine/signals/ChildrenShape.test.ts`** — PASS (10 tests)
- [ ] **`npx vitest run test/tree-builder/match-engine/`** — PASS (모든 엔진 테스트)
- [ ] **`npm run audit`** — PASS (회귀 증가 0건)
- [ ] **`npm run audit:diff`** — "New regressions (0)"
- [ ] **`npm run audit:anomaly`** — PASS, cross-name Total이 119보다 낮음
- [ ] **`npm run test`** — 이 작업으로 인한 신규 실패 0건

## 다음 작업

이 spec이 끝나면 audit baseline의 남은 회귀들(variant-prop-position 20, same-name-same-type 7 등)을 별도 spec으로 다룬다. 그것들은 다른 매칭 알고리즘 한계(boolean swap, multi-prop, enum)에서 비롯되므로 ChildrenShape로는 풀리지 않는다.
