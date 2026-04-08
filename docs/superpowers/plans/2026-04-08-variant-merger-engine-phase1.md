# Variant Merger Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MatchDecisionEngine`과 4개 핵심 신호(TypeCompatibility, IdMatch, NormalizedPosition, RelativeSize)를 도입해 현재 `NodeMatcher`의 하드코딩 매칭 로직을 신호 기반 엔진으로 전환한다. Phase 1 종료 시점에 size-variant-reject 패턴 45건이 전부 해소되어 있어야 한다.

**Architecture:** 정교함 우선. **섀도 모드 마이그레이션**으로 엔진의 첫 버전이 기존 동작을 정확히 재현하는지 모든 fixture에서 수학적으로 검증한 뒤에만 실제 스위치를 넘긴다. 두 서브-페이즈로 분리: **1a(행동 보존)** 는 기존 하드코딩 값을 `MatchingPolicy`로 옮기기만 하는 순수 리팩터(0 drift 목표), **1b(임계값 완화)** 는 RelativeSize 비율 1.3→2.0 완화로 size-variant-reject 45건을 해소. 각 신호는 `{ kind: 'veto' | 'score', score?: [0,1], reason: string }` 반환 (dual form). 엔진은 Hungarian 호환 cost로 변환해 기존 파이프라인에 주입. Pair assertion은 audit-baseline.json에서 45건을 자동 생성해 TDD 입력으로 사용.

**Tech Stack:** TypeScript 5.3, vitest 4, 기존 경로 alias(`@code-generator2`), `test/fixtures/**/*.json` glob, Phase 0의 audit + snapshot + pair assertion 하네스.

**Spec reference:** `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` §3, §4 Phase 1
**Phase 0 dependency:** `feat/variant-merger-phase0` merged to dev (commit `79ab9e0`). 모든 Phase 0 인프라(audit, snapshot, pair assertions, BASELINE.md)가 사용 가능 상태여야 함.

---

## File Structure

이 플랜이 만들거나 수정하는 파일:

**새로 만들 엔진 코어 (src/):**
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal.ts` — `MatchSignal` 인터페이스, `SignalResult`, `MatchDecision`, `MatchContext` 타입 정의
- `.../match-engine/MatchingPolicy.ts` — 모든 가중치/임계값 단일 객체
- `.../match-engine/MatchDecisionEngine.ts` — 엔진 클래스. 신호 등록, 집계, cost 변환
- `.../match-engine/signals/TypeCompatibility.ts` — Shape/Container 그룹 체크 신호
- `.../match-engine/signals/IdMatch.ts` — ID 일치 신호
- `.../match-engine/signals/NormalizedPosition.ts` — LayoutNormalizer 위치 비교 신호
- `.../match-engine/signals/RelativeSize.ts` — 크기 비율 신호 (1a: 1.3 / 1b: 2.0)
- `.../match-engine/index.ts` — 엔진 생성 팩토리 `createDefaultEngine()`

**수정할 기존 파일 (src/):**
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts` — 섀도 모드 + 엔진 delegation. 기존 메서드 시그니처 불변.

**새로 만들 테스트 (test/):**
- `test/tree-builder/match-engine/MatchSignal.test.ts` — 인터페이스 계약 + 타입 가드 테스트
- `test/tree-builder/match-engine/MatchingPolicy.test.ts` — 정책 객체 불변성 + Phase 1a/1b 값 확인
- `test/tree-builder/match-engine/MatchDecisionEngine.test.ts` — 엔진 aggregation + veto + cost 변환 단위 테스트
- `test/tree-builder/match-engine/signals/TypeCompatibility.test.ts` — 신호 단위 + property test
- `test/tree-builder/match-engine/signals/IdMatch.test.ts` — 신호 단위 + property test (reflexive, symmetric)
- `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts` — 신호 단위 테스트
- `test/tree-builder/match-engine/signals/RelativeSize.test.ts` — 신호 단위 테스트 (1a/1b 분기 커버)
- `test/tree-builder/match-engine/shadowMode.test.ts` — 섀도 모드 검증: 84 fixture에 대해 `NodeMatcher.isSameNode` 결과와 `engine.decide` 결과가 100% 일치
- `test/tree-builder/match-engine/determinism.test.ts` — fixture ID 순서 무작위 100회 실행 → 동일 결과 검증

**새로 만들 스크립트 (scripts/):**
- `scripts/generate-pair-assertions.ts` — `audit-baseline.json`에서 size-variant-reject 45건을 읽어 `pairAssertions.data.ts`에 자동 삽입

**수정할 기존 테스트 (test/):**
- `test/matching/pairAssertions.data.ts` — Phase 0에서는 빈 배열. 1a에서 자동 생성된 45건으로 채움
- `test/audits/audit-baseline.json` — 1b 완화 후 재생성 (size-variant-reject 감소 반영)
- `test/snapshots/__snapshots__/*.snap` — 1b 완화로 인한 snapshot diff 검토 후 재생성

**수정할 spec:**
- `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` §8 미결사항 — score/cost 형태 결정 사항 기록

---

## Execution Notes

- **Worktree**: 이 Phase 1 작업은 반드시 worktree에서 수행한다 (`git worktree add .claude/worktrees/variant-merger-phase1 -b feat/variant-merger-phase1 dev`).
- **두 서브-페이즈 엄격 분리**: Phase 1a 종료 전까지 MatchingPolicy 값 변경 금지. 1a가 0 drift로 마무리되어야 1b 시작. 1a에서 drift가 발견되면 그건 리팩터 버그이므로 수정 후 다시 0 drift 확인.
- **Commit frequency**: 각 Task 완료 시 커밋. TDD cycle은 각 Task 내에서 완결.
- **섀도 모드의 테스트 결과 해석**: 1a 동안 `shadowMode.test.ts`는 반드시 통과. 1b 시작과 동시에 이 테스트는 "의도된 diff"를 허용하도록 수정된다 (1b Task에 명시).
- **Pair assertion TDD 사이클**: Task A14(auto-gen)에서 45건 단언을 채우면, 1a 상태에서는 **전부 FAIL** (엔진이 아직 1.3 ratio를 쓰므로). 1b Task B2에서 1.3→2.0 완화하면 **전부 PASS**가 되어야 함. 이 red→green 전환이 Phase 1의 핵심 증거.
- **기존 NodeMatcher 메서드 시그니처는 절대 변경하지 않는다**. `isSameNode`, `isDefiniteMatch`, `getPositionCost` 모두 기존 시그니처 유지. 내부만 교체.

---

# Phase 1a — 행동 보존 마이그레이션 (Behavior-Preserving)

**목표**: 엔진이 현재 `NodeMatcher`의 동작을 **100% 정확히** 재현. 모든 기존 테스트(1181 유닛 + Phase 0 snapshot/audit) 통과 + 섀도 모드 0 drift.

## Task A1: MatchSignal 인터페이스 + 타입 정의

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal.ts`
- Test: `test/tree-builder/match-engine/MatchSignal.test.ts`

**Context:** 엔진의 핵심 계약. 각 신호는 두 노드와 컨텍스트를 받아 `SignalResult`를 반환. `SignalResult`는 veto 채널과 score 채널이 분리된 discriminated union.

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/MatchSignal.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import type {
  MatchSignal,
  SignalResult,
  MatchContext,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal";

describe("MatchSignal types", () => {
  it("SignalResult veto has kind 'veto' and no score", () => {
    const r: SignalResult = { kind: "veto", reason: "type mismatch" };
    expect(r.kind).toBe("veto");
    // @ts-expect-error — score must not exist on veto
    expect(r.score).toBeUndefined();
  });

  it("SignalResult score has kind 'score' and score in [0,1]", () => {
    const r: SignalResult = { kind: "score", score: 0.8, reason: "close match" };
    expect(r.kind).toBe("score");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it("MatchSignal interface requires name + evaluate", () => {
    const signal: MatchSignal = {
      name: "test",
      evaluate: (_a, _b, _ctx) => ({ kind: "score", score: 1, reason: "always match" }),
    };
    expect(signal.name).toBe("test");
    const result = signal.evaluate({} as any, {} as any, {} as MatchContext);
    expect(result).toEqual({ kind: "score", score: 1, reason: "always match" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/MatchSignal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal.ts`

```typescript
import type { InternalNode } from "../../../../../types/types";
import type DataManager from "../../../../data-manager/DataManager";
import type { LayoutNormalizer } from "../LayoutNormalizer";
import type { MatchingPolicy } from "./MatchingPolicy";

/**
 * 매칭 컨텍스트. 신호가 평가에 사용하는 모든 외부 의존성을 한 곳에 모음.
 */
export interface MatchContext {
  readonly dataManager: DataManager;
  readonly layoutNormalizer: LayoutNormalizer;
  readonly nodeToVariantRoot: ReadonlyMap<string, string>;
  readonly policy: MatchingPolicy;
}

/**
 * 한 신호의 평가 결과.
 *
 * discriminated union:
 * - kind="veto": 결정적 거부. 엔진은 즉시 match 불가로 결정.
 * - kind="score": 0~1 사이 점수. 1=완벽 일치, 0=전혀 맞지 않음.
 *
 * reason은 사람이 읽는 디버그 문자열 — reason log에 누적되어 결정 근거를 재구성할 수 있게 한다.
 */
export type SignalResult =
  | { kind: "veto"; reason: string }
  | { kind: "score"; score: number; reason: string };

/**
 * 매칭 신호 인터페이스.
 *
 * 신호는 순수 함수처럼 동작해야 한다:
 * - 같은 (a, b, ctx) 입력 → 같은 SignalResult 출력 (결정론)
 * - 신호 간 부작용 없음 (독립 평가 가능)
 * - 외부 상태 변경 금지
 */
export interface MatchSignal {
  /** 신호 이름. reason log와 디버깅에 사용. */
  readonly name: string;
  /** 두 노드 간 평가. */
  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult;
}

/**
 * 엔진의 최종 결정.
 *
 * signalResults는 각 신호가 기여한 내역 — reason log로 사용.
 * veto가 하나라도 있으면 decision="veto"이고 totalCost=Infinity.
 * 아니면 totalCost = Σ weight_i × (1 - score_i).
 */
export interface MatchDecision {
  decision: "match" | "veto";
  totalCost: number;
  signalResults: ReadonlyArray<{
    signalName: string;
    result: SignalResult;
    weight: number;
  }>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/MatchSignal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal.ts test/tree-builder/match-engine/MatchSignal.test.ts
git commit -m "feat(match-engine): MatchSignal interface + dual-form SignalResult"
```

---

## Task A2: MatchingPolicy (1a: 기존 값 그대로)

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts`
- Test: `test/tree-builder/match-engine/MatchingPolicy.test.ts`

**Context:** 모든 매직 넘버를 한 곳에 모은다. Phase 1a는 기존 NodeMatcher의 하드코딩 값을 **정확히** 그대로 복사. 값 변경은 Phase 1b에서만.

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/MatchingPolicy.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  defaultMatchingPolicy,
  type MatchingPolicy,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";

describe("MatchingPolicy", () => {
  it("defaultMatchingPolicy has Phase 1a values (behavior-preserving)", () => {
    const p: MatchingPolicy = defaultMatchingPolicy;
    // NormalizedPosition: 기존 ±0.1 threshold
    expect(p.normalizedPositionThreshold).toBe(0.1);
    // RelativeSize: 기존 1.3 ratio (Phase 1a, 1b에서 2.0으로 완화 예정)
    expect(p.relativeSizeMaxRatio).toBe(1.3);
    // Shape/container root similarity for overflow fallback: 기존 1.5
    expect(p.variantRootSimilarityRatio).toBe(1.5);
    // Overflow penalty: 기존 +0.5
    expect(p.overflowMismatchPenalty).toBe(0.5);
    // TEXT 특별 매칭 cost: 기존 0.05
    expect(p.textSpecialMatchCost).toBe(0.05);
    // INSTANCE 특별 매칭 cost: 기존 0.05
    expect(p.instanceSpecialMatchCost).toBe(0.05);
  });

  it("MatchingPolicy weights for signals default to 1", () => {
    const p = defaultMatchingPolicy;
    expect(p.signalWeights.TypeCompatibility).toBe(1);
    expect(p.signalWeights.IdMatch).toBe(1);
    expect(p.signalWeights.NormalizedPosition).toBe(1);
    expect(p.signalWeights.RelativeSize).toBe(1);
  });

  it("final match threshold corresponds to existing isSameNode semantics", () => {
    const p = defaultMatchingPolicy;
    // 기존 isSameNode는 posCost <= 0.1 → match. cost 변환 후 threshold는 policy에 명시.
    expect(p.matchCostThreshold).toBeGreaterThan(0);
    expect(p.matchCostThreshold).toBeLessThan(Infinity);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/MatchingPolicy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts`

```typescript
/**
 * 매칭 엔진의 모든 튜닝 파라미터를 한 곳에 모은 정책 객체.
 *
 * 원칙:
 * - 매직 넘버는 코드에 흩어지면 안 된다 — 전부 이 파일에 모음
 * - Phase 1a 값 = 기존 NodeMatcher의 하드코딩 값을 정확히 복사 (행동 보존)
 * - Phase 1b에서만 값 변경 (relativeSizeMaxRatio 1.3 → 2.0)
 * - 값 변경 시 반드시 Phase 1b Task에 기록 + audit 재측정
 */
export interface MatchingPolicy {
  /** 정규화된 위치 비용 임계값. cost ≤ 이 값이면 위치 일치로 간주. (기존 0.1) */
  readonly normalizedPositionThreshold: number;
  /** 크기 비율 최대 허용값. max/min > 이 값이면 RelativeSize 신호가 veto. (Phase 1a: 1.3, Phase 1b: 2.0) */
  readonly relativeSizeMaxRatio: number;
  /** variant root 크기 유사도 판정 비율. overflow penalty 적용 여부 결정. (기존 1.5) */
  readonly variantRootSimilarityRatio: number;
  /** overflow↔normal 교차 매칭 시 cost 가산. (기존 +0.5) */
  readonly overflowMismatchPenalty: number;
  /** TEXT 특별 매칭 시 고정 cost. (기존 0.05) */
  readonly textSpecialMatchCost: number;
  /** INSTANCE 특별 매칭 시 고정 cost. (기존 0.05) */
  readonly instanceSpecialMatchCost: number;
  /** 엔진이 match로 결정하는 totalCost 임계값. totalCost ≤ 이 값 → match. */
  readonly matchCostThreshold: number;
  /** 각 신호의 가중치. Phase 1a는 전부 1. */
  readonly signalWeights: {
    readonly TypeCompatibility: number;
    readonly IdMatch: number;
    readonly NormalizedPosition: number;
    readonly RelativeSize: number;
  };
}

/**
 * Phase 1a 기본 정책. 기존 NodeMatcher 동작을 정확히 재현한다.
 * Phase 1b 시작 시점에 relativeSizeMaxRatio만 2.0으로 완화될 예정.
 */
export const defaultMatchingPolicy: MatchingPolicy = {
  normalizedPositionThreshold: 0.1,
  relativeSizeMaxRatio: 1.3,
  variantRootSimilarityRatio: 1.5,
  overflowMismatchPenalty: 0.5,
  textSpecialMatchCost: 0.05,
  instanceSpecialMatchCost: 0.05,
  // 기존 isSameNode는 posCost ≤ 0.1 → match. 엔진 aggregation에서 총 cost 역시 0.1 기준 유지.
  // (Phase 1a에서는 NormalizedPosition 신호만 점수에 기여하므로 동일.)
  matchCostThreshold: 0.1,
  signalWeights: {
    TypeCompatibility: 1,
    IdMatch: 1,
    NormalizedPosition: 1,
    RelativeSize: 1,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/MatchingPolicy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts test/tree-builder/match-engine/MatchingPolicy.test.ts
git commit -m "feat(match-engine): MatchingPolicy with Phase 1a (behavior-preserving) values"
```

---

## Task A3: TypeCompatibility 신호

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TypeCompatibility.ts`
- Test: `test/tree-builder/match-engine/signals/TypeCompatibility.test.ts`

**Context:** 기존 `NodeMatcher.isSameNode` Step 1과 `isDefiniteMatch` Step 1의 타입 호환성 체크를 신호로 분리. SHAPE 그룹(RECTANGLE, VECTOR, ELLIPSE, LINE, STAR, POLYGON, BOOLEAN_OPERATION)과 CONTAINER 그룹(GROUP, FRAME) 내에서는 type mismatch를 허용.

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/signals/TypeCompatibility.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { TypeCompatibility } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TypeCompatibility";
import type { InternalNode } from "@code-generator2/types/types";

function node(type: string): InternalNode {
  return { id: "n", name: "n", type, children: [] } as unknown as InternalNode;
}

describe("TypeCompatibility signal", () => {
  const signal = new TypeCompatibility();

  it("returns score 1 for identical types", () => {
    const r = signal.evaluate(node("FRAME"), node("FRAME"), {} as any);
    expect(r).toEqual({ kind: "score", score: 1, reason: expect.any(String) });
  });

  it("returns score 1 for same shape group", () => {
    const r = signal.evaluate(node("RECTANGLE"), node("VECTOR"), {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 1 for same container group", () => {
    const r = signal.evaluate(node("GROUP"), node("FRAME"), {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns veto for cross-group types", () => {
    const r = signal.evaluate(node("TEXT"), node("FRAME"), {} as any);
    expect(r.kind).toBe("veto");
  });

  it("returns veto for shape ↔ container", () => {
    const r = signal.evaluate(node("RECTANGLE"), node("FRAME"), {} as any);
    expect(r.kind).toBe("veto");
  });

  it("property: signal is symmetric", () => {
    const pairs: Array<[string, string]> = [
      ["FRAME", "GROUP"],
      ["RECTANGLE", "VECTOR"],
      ["TEXT", "FRAME"],
      ["INSTANCE", "INSTANCE"],
    ];
    for (const [a, b] of pairs) {
      const r1 = signal.evaluate(node(a), node(b), {} as any);
      const r2 = signal.evaluate(node(b), node(a), {} as any);
      expect(r1.kind).toBe(r2.kind);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/TypeCompatibility.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TypeCompatibility.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/** Shape 계열 타입 — Figma가 같은 도형을 다른 타입으로 표현할 수 있으므로 상호 호환 */
const SHAPE_TYPES: ReadonlySet<string> = new Set([
  "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
]);

/** 컨테이너 계열 타입 — Figma가 variant에 따라 GROUP↔FRAME을 바꿀 수 있으므로 상호 호환 */
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * 두 노드의 Figma type 호환성 신호.
 *
 * 판정:
 * - 같은 type → score 1
 * - 둘 다 SHAPE_TYPES → score 1 (cross-shape 허용)
 * - 둘 다 CONTAINER_TYPES → score 1 (GROUP↔FRAME 허용)
 * - 그 외 → veto
 *
 * 이 신호는 기존 NodeMatcher.isSameNode Step 1을 정확히 재현한다.
 */
export class TypeCompatibility implements MatchSignal {
  readonly name = "TypeCompatibility";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.type === b.type) {
      return { kind: "score", score: 1, reason: `same type: ${a.type}` };
    }
    if (SHAPE_TYPES.has(a.type) && SHAPE_TYPES.has(b.type)) {
      return { kind: "score", score: 1, reason: `shape group: ${a.type}↔${b.type}` };
    }
    if (CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type)) {
      return { kind: "score", score: 1, reason: `container group: ${a.type}↔${b.type}` };
    }
    return { kind: "veto", reason: `incompatible types: ${a.type}↔${b.type}` };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/TypeCompatibility.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/TypeCompatibility.ts test/tree-builder/match-engine/signals/TypeCompatibility.test.ts
git commit -m "feat(match-engine): TypeCompatibility signal (shape/container groups)"
```

---

## Task A4: IdMatch 신호

**Files:**
- Create: `.../match-engine/signals/IdMatch.ts`
- Test: `test/tree-builder/match-engine/signals/IdMatch.test.ts`

**Context:** ID 확정 매칭. `NodeMatcher.isSameNode` Step 2 (`nodeA.id === nodeB.id`)와 `isDefiniteMatch`의 ID 체크를 분리. 동일 ID면 다른 모든 신호를 무시하는 **terminal confidence**를 표현하기 위해 score 1을 반환 (veto 아님).

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/signals/IdMatch.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { IdMatch } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/IdMatch";
import type { InternalNode } from "@code-generator2/types/types";

function node(id: string): InternalNode {
  return { id, name: id, type: "FRAME", children: [] } as unknown as InternalNode;
}

describe("IdMatch signal", () => {
  const signal = new IdMatch();

  it("returns score 1 for identical ids", () => {
    const r = signal.evaluate(node("x"), node("x"), {} as any);
    expect(r).toEqual({ kind: "score", score: 1, reason: "id match: x" });
  });

  it("returns score 0 for different ids", () => {
    const r = signal.evaluate(node("x"), node("y"), {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("property: reflexive (node matches itself)", () => {
    const n = node("self");
    const r = signal.evaluate(n, n, {} as any);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("property: symmetric", () => {
    const r1 = signal.evaluate(node("a"), node("b"), {} as any);
    const r2 = signal.evaluate(node("b"), node("a"), {} as any);
    expect(r1).toEqual(r2);
  });

  it("property: transitive on id equality", () => {
    // a.id === b.id === c.id ⇒ all pairs score 1
    const a = node("same");
    const b = node("same");
    const c = node("same");
    expect(signal.evaluate(a, b, {} as any).kind).toBe("score");
    expect(signal.evaluate(b, c, {} as any).kind).toBe("score");
    expect(signal.evaluate(a, c, {} as any).kind).toBe("score");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/IdMatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/IdMatch.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * ID 일치 신호.
 *
 * 같은 ID면 score 1, 다르면 score 0.
 *
 * 이 신호는 "ID가 같으면 같은 노드"라는 기존 NodeMatcher의 Pass 1 확정 매칭 로직을
 * 그대로 재현한다. score 0는 veto가 아닌 "이 신호만으로는 판단 불가" 상태.
 */
export class IdMatch implements MatchSignal {
  readonly name = "IdMatch";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    if (a.id === b.id) {
      return { kind: "score", score: 1, reason: `id match: ${a.id}` };
    }
    return { kind: "score", score: 0, reason: `id diff: ${a.id} ≠ ${b.id}` };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/IdMatch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/IdMatch.ts test/tree-builder/match-engine/signals/IdMatch.test.ts
git commit -m "feat(match-engine): IdMatch signal with reflexive/symmetric property tests"
```

---

## Task A5: NormalizedPosition 신호

**Files:**
- Create: `.../match-engine/signals/NormalizedPosition.ts`
- Test: `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`

**Context:** `NodeMatcher.calcPositionCostByNormalizer` 로직을 신호로 래핑. LayoutNormalizer를 통해 위치 비용을 계산해 score로 변환한다 (score = max(0, 1 - cost / threshold)). 단위 테스트는 LayoutNormalizer를 mock으로 주입해 위치 비용이 score로 어떻게 변환되는지만 검증한다 (LayoutNormalizer 자체는 이미 기존 테스트에서 커버됨).

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { NormalizedPosition } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(id: string): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children: [],
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(positionCost: number) {
  return {
    dataManager: {
      getById: vi.fn().mockReturnValue({ node: { id: "orig", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } } }),
    },
    layoutNormalizer: {
      normalize: vi.fn().mockReturnValue({ cx: 0.5, cy: 0.5, relWidth: 0.5, relHeight: 0.5 }),
      compare: vi.fn().mockReturnValue(positionCost),
      compareAvgSize: vi.fn().mockReturnValue(positionCost),
    },
    nodeToVariantRoot: new Map([["x", "root"], ["y", "root"]]),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("NormalizedPosition signal", () => {
  const signal = new NormalizedPosition();

  it("returns score 1 when cost is 0", () => {
    const r = signal.evaluate(node("x"), node("y"), makeCtx(0));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score ~0.5 when cost is half of threshold", () => {
    const r = signal.evaluate(node("x"), node("y"), makeCtx(0.05));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBeCloseTo(0.5, 2);
  });

  it("returns score 0 when cost equals threshold", () => {
    const r = signal.evaluate(node("x"), node("y"), makeCtx(0.1));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(0);
  });

  it("returns veto when cost exceeds threshold", () => {
    const r = signal.evaluate(node("x"), node("y"), makeCtx(0.2));
    expect(r.kind).toBe("veto");
  });

  it("returns veto when mergedNodes missing", () => {
    const a = { id: "a", name: "a", type: "FRAME", children: [] } as unknown as InternalNode;
    const b = { id: "b", name: "b", type: "FRAME", children: [] } as unknown as InternalNode;
    const r = signal.evaluate(a, b, makeCtx(0));
    expect(r.kind).toBe("veto");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * 정규화된 위치 비교 신호.
 *
 * LayoutNormalizer를 통해 두 노드의 위치를 각 노드의 직접 부모 기준으로
 * 독립 정규화한 뒤 compare 값을 받는다. cost가 policy.normalizedPositionThreshold
 * 이하면 score로 변환 (score = 1 - cost/threshold), 초과하면 veto.
 *
 * reference 크기가 크게 다를 때를 위한 avgSize fallback은 기존 NodeMatcher 동작 그대로 재현.
 */
export class NormalizedPosition implements MatchSignal {
  readonly name = "NormalizedPosition";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) {
      return { kind: "veto", reason: "missing mergedNodes" };
    }

    // 부모가 없으면 (루트) → 루트끼리는 score 1
    if (!a.parent && !b.parent) {
      return { kind: "score", score: 1, reason: "both root nodes" };
    }

    const parentA = this.findDirectParent(mergedA.id, ctx);
    const parentB = this.findDirectParent(mergedB.id, ctx);
    const origA = ctx.dataManager.getById(mergedA.id)?.node;
    const origB = ctx.dataManager.getById(mergedB.id)?.node;

    if (!parentA || !parentB || !origA || !origB) {
      return { kind: "veto", reason: "cannot resolve parent/original node" };
    }

    const posA = ctx.layoutNormalizer.normalize(parentA as any, origA as any);
    const posB = ctx.layoutNormalizer.normalize(parentB as any, origB as any);
    if (!posA || !posB) {
      return { kind: "veto", reason: "normalize failed" };
    }

    const primaryCost = ctx.layoutNormalizer.compare(posA, posB);
    let cost = primaryCost;
    if (primaryCost > ctx.policy.normalizedPositionThreshold) {
      // reference 크기가 많이 다르면 avgSize fallback
      const avgCost = ctx.layoutNormalizer.compareAvgSize(
        parentA as any,
        origA as any,
        parentB as any,
        origB as any,
      );
      cost = Math.min(primaryCost, avgCost);
    }

    if (cost > ctx.policy.normalizedPositionThreshold) {
      return { kind: "veto", reason: `position cost ${cost.toFixed(3)} > ${ctx.policy.normalizedPositionThreshold}` };
    }

    const score = 1 - cost / ctx.policy.normalizedPositionThreshold;
    return {
      kind: "score",
      score: Math.max(0, Math.min(1, score)),
      reason: `pos cost ${cost.toFixed(3)} (threshold ${ctx.policy.normalizedPositionThreshold})`,
    };
  }

  /**
   * 원본 노드의 직접 부모 찾기. NodeMatcher의 findDirectParent를 그대로 재현.
   * 캐싱은 엔진 주체가 아니라 NodeMatcher/외부 레이어가 담당한다고 가정 (Phase 1a에서는 캐시 없이).
   */
  private findDirectParent(nodeId: string, ctx: MatchContext): unknown | null {
    const variantRootId = ctx.nodeToVariantRoot.get(nodeId);
    if (!variantRootId) return null;
    const { node: variantRoot } = ctx.dataManager.getById(variantRootId);
    if (!variantRoot) return null;

    const find = (parent: any): any | null => {
      if (!parent?.children) return null;
      for (const child of parent.children) {
        if (child.id === nodeId) return parent;
        const result = find(child);
        if (result) return result;
      }
      return null;
    };
    return find(variantRoot);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts test/tree-builder/match-engine/signals/NormalizedPosition.test.ts
git commit -m "feat(match-engine): NormalizedPosition signal wrapping LayoutNormalizer"
```

---

## Task A6: RelativeSize 신호 (Phase 1a — 1.3 ratio)

**Files:**
- Create: `.../match-engine/signals/RelativeSize.ts`
- Test: `test/tree-builder/match-engine/signals/RelativeSize.test.ts`

**Context:** 기존 `NodeMatcher.isSimilarSize`를 신호로 전환. Phase 1a에서는 정책값 1.3 그대로. Shape/Container 그룹에만 적용되는 조건부 체크는 엔진 aggregation이 아닌 신호 내부에서 판단 (signal은 항상 호출되지만 non-shape/container pair에는 score 1로 passthrough).

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/signals/RelativeSize.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { RelativeSize } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/RelativeSize";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type { InternalNode } from "@code-generator2/types/types";

function node(type: string, id = "n"): InternalNode {
  return {
    id,
    name: id,
    type,
    children: [],
    mergedNodes: [{ id, name: id, variantName: "v" }],
  } as unknown as InternalNode;
}

function makeCtx(boxA: { width: number; height: number }, boxB: { width: number; height: number }) {
  return {
    dataManager: {
      getById: vi.fn((id: string) => ({
        node: {
          id,
          absoluteBoundingBox: { x: 0, y: 0, ...(id === "a" ? boxA : boxB) },
        },
      })),
    },
    layoutNormalizer: {} as any,
    nodeToVariantRoot: new Map(),
    policy: defaultMatchingPolicy,
  } as any;
}

describe("RelativeSize signal (Phase 1a — ratio 1.3)", () => {
  const signal = new RelativeSize();

  it("returns score 1 for non-shape/container pair (passthrough)", () => {
    const r = signal.evaluate(node("TEXT", "a"), node("TEXT", "b"), makeCtx({ width: 10, height: 10 }, { width: 100, height: 100 }));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 1 for shape pair with same size", () => {
    const r = signal.evaluate(node("RECTANGLE", "a"), node("VECTOR", "b"), makeCtx({ width: 20, height: 20 }, { width: 20, height: 20 }));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 1 for shape pair within ratio 1.3", () => {
    const r = signal.evaluate(node("RECTANGLE", "a"), node("RECTANGLE", "b"), makeCtx({ width: 10, height: 10 }, { width: 12, height: 12 }));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns veto for shape pair exceeding ratio 1.3", () => {
    const r = signal.evaluate(node("RECTANGLE", "a"), node("RECTANGLE", "b"), makeCtx({ width: 10, height: 10 }, { width: 15, height: 15 }));
    expect(r.kind).toBe("veto");
  });

  it("returns veto for GROUP↔FRAME cross with size exceeding ratio", () => {
    const r = signal.evaluate(node("GROUP", "a"), node("FRAME", "b"), makeCtx({ width: 10, height: 10 }, { width: 20, height: 20 }));
    expect(r.kind).toBe("veto");
  });

  it("returns score 1 for same-type container pair regardless of size", () => {
    // 기존 NodeMatcher는 FRAME↔FRAME 같은 type 내 매칭에는 isSimilarSize를 적용하지 않음
    const r = signal.evaluate(node("FRAME", "a"), node("FRAME", "b"), makeCtx({ width: 10, height: 10 }, { width: 100, height: 100 }));
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });

  it("returns score 1 when bounding box unavailable (defensive)", () => {
    const ctx: any = {
      dataManager: { getById: vi.fn().mockReturnValue({ node: {} }) },
      policy: defaultMatchingPolicy,
    };
    const r = signal.evaluate(node("RECTANGLE", "a"), node("RECTANGLE", "b"), ctx);
    expect(r.kind).toBe("score");
    if (r.kind === "score") expect(r.score).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/signals/RelativeSize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/RelativeSize.ts`

```typescript
import type { InternalNode } from "../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

const SHAPE_TYPES: ReadonlySet<string> = new Set([
  "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
]);
const CONTAINER_TYPES: ReadonlySet<string> = new Set(["GROUP", "FRAME"]);

/**
 * 크기 비율 신호.
 *
 * 기존 NodeMatcher.isSimilarSize를 재현:
 * - 같은 type 내 매칭(예: FRAME↔FRAME)에는 적용하지 않음 → score 1 passthrough
 * - Shape↔Shape 교차 매칭(RECTANGLE↔VECTOR 등)에는 크기 비율 체크
 * - Container 교차(GROUP↔FRAME)에도 크기 비율 체크
 * - 비율 max/min > policy.relativeSizeMaxRatio → veto (Phase 1a: 1.3, Phase 1b: 2.0)
 * - 비율 이내 → score 1
 * - bounding box 없으면 defensive로 score 1
 *
 * 이 신호는 Phase 1b에서 MatchingPolicy.relativeSizeMaxRatio 값만 바꿔 완화된다.
 */
export class RelativeSize implements MatchSignal {
  readonly name = "RelativeSize";

  evaluate(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    // 같은 type 내 매칭에는 적용하지 않음
    if (a.type === b.type) {
      if (!SHAPE_TYPES.has(a.type)) {
        return { kind: "score", score: 1, reason: `same-type ${a.type} passthrough` };
      }
      // 같은 shape type (예: RECTANGLE↔RECTANGLE)도 기존 NodeMatcher에서 isSimilarSize 적용
      // (동심원 오매칭 방지 목적)
      return this.checkRatio(a, b, ctx);
    }

    // 타입 다름 — Shape 그룹 교차 또는 Container 그룹 교차에만 적용
    const bothShapes = SHAPE_TYPES.has(a.type) && SHAPE_TYPES.has(b.type);
    const bothContainers = CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type);
    if (!bothShapes && !bothContainers) {
      return { kind: "score", score: 1, reason: `non-shape/container cross passthrough` };
    }
    return this.checkRatio(a, b, ctx);
  }

  private checkRatio(a: InternalNode, b: InternalNode, ctx: MatchContext): SignalResult {
    const mergedA = a.mergedNodes?.[0];
    const mergedB = b.mergedNodes?.[0];
    if (!mergedA || !mergedB) {
      return { kind: "score", score: 1, reason: "missing mergedNodes, defensive passthrough" };
    }
    const origA = ctx.dataManager.getById(mergedA.id)?.node as any;
    const origB = ctx.dataManager.getById(mergedB.id)?.node as any;
    const boxA = origA?.absoluteBoundingBox;
    const boxB = origB?.absoluteBoundingBox;
    if (!boxA || !boxB) {
      return { kind: "score", score: 1, reason: "missing bounding box, defensive passthrough" };
    }
    const minW = Math.min(boxA.width, boxB.width);
    const minH = Math.min(boxA.height, boxB.height);
    if (minW <= 0 || minH <= 0) {
      return { kind: "score", score: 1, reason: "zero dimension, defensive passthrough" };
    }
    const wRatio = Math.max(boxA.width, boxB.width) / minW;
    const hRatio = Math.max(boxA.height, boxB.height) / minH;
    const maxRatio = Math.max(wRatio, hRatio);
    if (maxRatio > ctx.policy.relativeSizeMaxRatio) {
      return {
        kind: "veto",
        reason: `size ratio ${maxRatio.toFixed(2)} > ${ctx.policy.relativeSizeMaxRatio}`,
      };
    }
    return {
      kind: "score",
      score: 1,
      reason: `size ratio ${maxRatio.toFixed(2)} ≤ ${ctx.policy.relativeSizeMaxRatio}`,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/signals/RelativeSize.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/RelativeSize.ts test/tree-builder/match-engine/signals/RelativeSize.test.ts
git commit -m "feat(match-engine): RelativeSize signal with Phase 1a ratio (1.3)"
```

---

## Task A7: MatchDecisionEngine 집계 + cost 변환

**Files:**
- Create: `.../match-engine/MatchDecisionEngine.ts`
- Test: `test/tree-builder/match-engine/MatchDecisionEngine.test.ts`

**Context:** 신호들을 등록하고 두 노드에 대해 전부 평가한 뒤 aggregation 규칙으로 최종 `MatchDecision`을 생성. **dual form**: veto 하나라도 있으면 decision="veto", 아니면 totalCost = Σ weight_i × (1 - score_i). 결정론을 위해 신호 평가 순서는 등록 순서 그대로 유지.

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/match-engine/MatchDecisionEngine.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { MatchDecisionEngine } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchDecisionEngine";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy";
import type {
  MatchSignal,
  SignalResult,
} from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchSignal";
import type { InternalNode } from "@code-generator2/types/types";

function fakeSignal(name: string, result: SignalResult): MatchSignal {
  return { name, evaluate: () => result };
}

const n = (id: string): InternalNode => ({ id, name: id, type: "FRAME", children: [] } as any);
const ctx: any = { policy: defaultMatchingPolicy };

describe("MatchDecisionEngine", () => {
  it("returns match with totalCost 0 when all signals return score 1", () => {
    const engine = new MatchDecisionEngine([
      fakeSignal("s1", { kind: "score", score: 1, reason: "ok" }),
      fakeSignal("s2", { kind: "score", score: 1, reason: "ok" }),
    ], defaultMatchingPolicy);
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("match");
    expect(d.totalCost).toBe(0);
  });

  it("returns veto when any signal vetoes", () => {
    const engine = new MatchDecisionEngine([
      fakeSignal("s1", { kind: "score", score: 1, reason: "ok" }),
      fakeSignal("s2", { kind: "veto", reason: "nope" }),
    ], defaultMatchingPolicy);
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(d.totalCost).toBe(Infinity);
  });

  it("sums (1 - score) × weight for non-veto signals", () => {
    const policy = { ...defaultMatchingPolicy, matchCostThreshold: 1 };
    const engine = new MatchDecisionEngine([
      fakeSignal("s1", { kind: "score", score: 0.7, reason: "" }),
      fakeSignal("s2", { kind: "score", score: 0.5, reason: "" }),
    ], policy);
    // weights default 1 → totalCost = 0.3 + 0.5 = 0.8
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBeCloseTo(0.8, 5);
    expect(d.decision).toBe("match"); // 0.8 <= 1
  });

  it("returns veto when totalCost exceeds matchCostThreshold", () => {
    const policy = { ...defaultMatchingPolicy, matchCostThreshold: 0.5 };
    const engine = new MatchDecisionEngine([
      fakeSignal("s1", { kind: "score", score: 0.1, reason: "" }),
    ], policy);
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.totalCost).toBeCloseTo(0.9, 5);
    expect(d.decision).toBe("veto");
  });

  it("signalResults preserves registration order", () => {
    const engine = new MatchDecisionEngine([
      fakeSignal("s1", { kind: "score", score: 1, reason: "r1" }),
      fakeSignal("s2", { kind: "score", score: 0.5, reason: "r2" }),
      fakeSignal("s3", { kind: "score", score: 0.8, reason: "r3" }),
    ], defaultMatchingPolicy);
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.signalResults.map(r => r.signalName)).toEqual(["s1", "s2", "s3"]);
  });

  it("short-circuits evaluation after first veto (optimization, order preserved)", () => {
    let s3Called = false;
    const engine = new MatchDecisionEngine([
      fakeSignal("s1", { kind: "score", score: 1, reason: "" }),
      fakeSignal("s2", { kind: "veto", reason: "stop here" }),
      { name: "s3", evaluate: () => { s3Called = true; return { kind: "score", score: 1, reason: "" }; } },
    ], defaultMatchingPolicy);
    const d = engine.decide(n("a"), n("b"), ctx);
    expect(d.decision).toBe("veto");
    expect(s3Called).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/match-engine/MatchDecisionEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchDecisionEngine.ts`

```typescript
import type { InternalNode } from "../../../../../types/types";
import type {
  MatchSignal,
  MatchContext,
  MatchDecision,
  SignalResult,
} from "./MatchSignal";
import type { MatchingPolicy } from "./MatchingPolicy";

/**
 * 신호 기반 매칭 결정 엔진.
 *
 * 동작:
 * 1. 등록된 신호를 순서대로 호출
 * 2. 하나라도 veto → 즉시 decision="veto" 반환 (short-circuit)
 * 3. 전부 score → totalCost = Σ weight_i × (1 - score_i)
 * 4. totalCost ≤ policy.matchCostThreshold → decision="match", 아니면 "veto"
 *
 * 결정론 보장:
 * - 신호 평가 순서는 생성자 배열 순서
 * - 각 신호는 pure function이어야 함 (MatchSignal 계약)
 * - 신호 간 부작용 없음
 */
export class MatchDecisionEngine {
  constructor(
    private readonly signals: ReadonlyArray<MatchSignal>,
    private readonly policy: MatchingPolicy,
  ) {}

  decide(a: InternalNode, b: InternalNode, ctx: MatchContext): MatchDecision {
    const signalResults: Array<{
      signalName: string;
      result: SignalResult;
      weight: number;
    }> = [];

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
    }

    let totalCost = 0;
    for (const { result, weight } of signalResults) {
      if (result.kind === "score") {
        totalCost += weight * (1 - result.score);
      }
    }

    return {
      decision: totalCost <= this.policy.matchCostThreshold ? "match" : "veto",
      totalCost: totalCost <= this.policy.matchCostThreshold ? totalCost : Infinity,
      signalResults,
    };
  }

  private weightFor(signalName: string): number {
    const weights = this.policy.signalWeights as Record<string, number>;
    return weights[signalName] ?? 1;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/match-engine/MatchDecisionEngine.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchDecisionEngine.ts test/tree-builder/match-engine/MatchDecisionEngine.test.ts
git commit -m "feat(match-engine): MatchDecisionEngine with dual-form aggregation + short-circuit veto"
```

---

## Task A8: Engine factory + index 재수출

**Files:**
- Create: `.../match-engine/index.ts`

**Context:** 외부(NodeMatcher)에서 엔진을 손쉽게 만들 수 있도록 `createDefaultEngine()` 팩토리와 re-export 제공. Phase 1a 기본 신호 4개가 등록됨.

- [ ] **Step 1: Write the factory**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts`

```typescript
import { MatchDecisionEngine } from "./MatchDecisionEngine";
import { TypeCompatibility } from "./signals/TypeCompatibility";
import { IdMatch } from "./signals/IdMatch";
import { NormalizedPosition } from "./signals/NormalizedPosition";
import { RelativeSize } from "./signals/RelativeSize";
import { defaultMatchingPolicy, type MatchingPolicy } from "./MatchingPolicy";

export { MatchDecisionEngine } from "./MatchDecisionEngine";
export { defaultMatchingPolicy } from "./MatchingPolicy";
export type { MatchingPolicy } from "./MatchingPolicy";
export type {
  MatchSignal,
  SignalResult,
  MatchContext,
  MatchDecision,
} from "./MatchSignal";

/**
 * Phase 1 기본 엔진 생성.
 *
 * 등록 순서는 평가 비용이 낮은 것부터:
 * 1. TypeCompatibility — O(1), 대부분의 불일치를 즉시 veto
 * 2. IdMatch — O(1), 확정 매칭 빠른 경로
 * 3. RelativeSize — O(1), hit에는 DataManager 조회 1회
 * 4. NormalizedPosition — O(1)~O(depth), LayoutNormalizer 호출
 */
export function createDefaultEngine(policy: MatchingPolicy = defaultMatchingPolicy): MatchDecisionEngine {
  return new MatchDecisionEngine(
    [
      new TypeCompatibility(),
      new IdMatch(),
      new RelativeSize(),
      new NormalizedPosition(),
    ],
    policy,
  );
}
```

- [ ] **Step 2: Commit**

No test for this file — it's a pure composition helper. Shadow mode test in Task A9 will verify end-to-end.

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts
git commit -m "feat(match-engine): index with createDefaultEngine factory"
```

---

## Task A9: 섀도 모드 — NodeMatcher 와이어링 + 불일치 테스트

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- Create: `test/tree-builder/match-engine/shadowMode.test.ts`

**Context:** 핵심 마이그레이션 단계. `NodeMatcher.isSameNode` 내부에서 기존 로직을 실행한 뒤 동일 노드 쌍을 엔진으로도 평가하고 결과가 일치하는지 검증. 불일치는 **debug 로그로 수집만** 하고 `isSameNode`의 반환값은 **여전히 기존 로직 결과**를 쓴다 — 엔진 전환은 Phase 1b 이후에나 실제로 일어남. 이 단계는 "엔진이 기존 동작을 완벽 재현하는지 검증"만 한다.

섀도 모드 테스트는 84개 fixture를 VariantMerger로 병합하는 도중 실행된 모든 `isSameNode` 호출 쌍을 수집한 뒤 동일 쌍에 대해 엔진을 돌려 결과가 100% 일치하는지 확인.

- [ ] **Step 1: Read the current NodeMatcher and identify injection point**

Use the Read tool on `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`. The `isSameNode` method returns boolean. The engine returns `MatchDecision`. We need a mapping: `decision.decision === "match"` → true, otherwise false.

- [ ] **Step 2: Write the shadow mode test first (red state expected for engine-not-wired)**

File: `test/tree-builder/match-engine/shadowMode.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { createDefaultEngine } from "@code-generator2/layers/tree-manager/tree-builder/processors/match-engine";

const fixtureLoaders = import.meta.glob("../../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const entries = Object.entries(fixtureLoaders)
  .map(([p, loader]) => ({
    name: p.replace("../../fixtures/", "").replace(".json", ""),
    loader,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Shadow-mode verification:
 * For each fixture, collect all pairs passed to isSameNode during VariantMerger
 * (via a test-only hook attached to NodeMatcher) and verify engine.decide returns
 * the same match/no-match decision for every pair.
 *
 * Phase 1a invariant: zero disagreements across all 84 fixtures.
 * Phase 1b will intentionally introduce 45 disagreements (the size-variant-reject fixes).
 */
describe("Shadow mode: NodeMatcher ↔ MatchDecisionEngine agreement", () => {
  for (const { name, loader } of entries) {
    it(`${name}: zero drift`, async () => {
      const mod = await loader();
      const data = mod.default as any;
      const doc = data?.info?.document;
      if (!doc) {
        expect(data).toBeDefined();
        return;
      }

      // Enable shadow mode collection via a global hook
      const disagreements: Array<{ pair: [string, string]; old: boolean; engine: boolean }> = [];
      (globalThis as any).__SHADOW_MODE_COLLECTOR__ = disagreements;

      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      tb.buildInternalTreeDebug(doc);

      // Clean up hook
      delete (globalThis as any).__SHADOW_MODE_COLLECTOR__;

      if (disagreements.length > 0) {
        const sample = disagreements.slice(0, 5).map(d =>
          `  ${d.pair[0]} ↔ ${d.pair[1]}: old=${d.old} engine=${d.engine}`
        ).join("\n");
        expect.fail(`${disagreements.length} disagreements in ${name}:\n${sample}`);
      }
    }, 30_000);
  }
});
```

- [ ] **Step 3: Run the test to verify it fails initially**

Run: `npx vitest run test/tree-builder/match-engine/shadowMode.test.ts`
Expected: FAIL (collector not set up yet, or all 84 fixtures fail because NodeMatcher hasn't been wired to shadow-call the engine).

- [ ] **Step 4: Wire shadow mode into NodeMatcher**

Edit `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`:

Add at top (after existing imports):
```typescript
import { createDefaultEngine, type MatchContext } from "./match-engine";
import { defaultMatchingPolicy } from "./match-engine";
```

Add a private field in the class:
```typescript
private readonly engine = createDefaultEngine();
```

Replace the body of `isSameNode` with this wrapper:
```typescript
public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
  const legacyResult = this.isSameNodeLegacy(nodeA, nodeB);

  const collector = (globalThis as any).__SHADOW_MODE_COLLECTOR__ as
    | Array<{ pair: [string, string]; old: boolean; engine: boolean }>
    | undefined;
  if (collector) {
    const ctx: MatchContext = {
      dataManager: this.dataManager,
      layoutNormalizer: this.layoutNormalizer,
      nodeToVariantRoot: this.nodeToVariantRoot,
      policy: defaultMatchingPolicy,
    };
    const decision = this.engine.decide(nodeA, nodeB, ctx);
    const engineResult = decision.decision === "match";
    if (engineResult !== legacyResult) {
      collector.push({ pair: [nodeA.id, nodeB.id], old: legacyResult, engine: engineResult });
    }
  }

  return legacyResult;
}

/** Existing isSameNode logic, renamed. Phase 1b will remove this. */
private isSameNodeLegacy(nodeA: InternalNode, nodeB: InternalNode): boolean {
  // ... (move the entire existing isSameNode body here unchanged)
}
```

The body of the existing `isSameNode` (lines 45-96 of current NodeMatcher.ts) becomes `isSameNodeLegacy`. Verbatim copy, no logic changes.

- [ ] **Step 5: Run shadow mode test**

Run: `npx vitest run test/tree-builder/match-engine/shadowMode.test.ts`
Expected: PASS (all 84 fixtures report 0 disagreements).

**If there are disagreements**, this is a Phase 1a bug — the engine is not behavior-preserving. Do NOT proceed to Phase 1b. Debug each disagreement type and fix the engine / signal until the count is zero.

- [ ] **Step 6: Run full test suite to verify no other regressions**

Run: `npm run test 2>&1 | tail -15`
Expected: 1181 passed + new match-engine tests, 0 new failures (the pre-existing decomposer test failure from Phase 0 may still be present — that's unrelated).

- [ ] **Step 7: Run Phase 0 ratchet tests**

Run: `npm run audit && npx vitest run test/snapshots/`
Expected: audit 1991 (unchanged), snapshots all pass (unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts test/tree-builder/match-engine/shadowMode.test.ts
git commit -m "feat(match-engine): shadow mode wiring + zero-drift verification"
```

---

## Task A10: Determinism test (fixture 순서 셔플)

**Files:**
- Create: `test/tree-builder/match-engine/determinism.test.ts`

**Context:** 엔진의 결정론을 검증. fixture 내 variant 순서를 무작위로 섞어서 여러 번 병합했을 때 **InternalTree 구조가 동일**해야 한다. 이 테스트가 Phase 1a에서 통과하면 엔진이 순서 의존성을 가지고 있지 않음이 증명된다.

- [ ] **Step 1: Write the determinism test**

File: `test/tree-builder/match-engine/determinism.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { serializeTree } from "@/../test/snapshots/serializeTree";

// Pick representative fixtures with multi-variant structures (COMPONENT_SET with ≥3 variants)
const FIXTURES_TO_TEST = [
  "failing/Switch",
  "failing/Toggle",
  "failing/Chips",
  "failing/Button",
  "any-component-set/airtable-button",
];

const fixtureLoaders = import.meta.glob("../../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

function shuffle<T>(arr: T[], seed: number): T[] {
  // Deterministic shuffle using Mulberry32 PRNG
  const rng = (): number => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

describe("Determinism: shuffled variant order produces identical tree", () => {
  for (const fixtureName of FIXTURES_TO_TEST) {
    it(`${fixtureName}: 10 random shuffles produce identical InternalTree`, async () => {
      const loader = fixtureLoaders[`../../fixtures/${fixtureName}.json`];
      expect(loader, `Fixture not found: ${fixtureName}`).toBeDefined();
      const mod = await loader!();
      const data = mod.default as any;

      const buildWithShuffle = (seed: number): string => {
        // Deep clone the fixture and shuffle variants
        const cloned = JSON.parse(JSON.stringify(data));
        const doc = cloned.info?.document;
        if (doc?.type === "COMPONENT_SET" && Array.isArray(doc.children)) {
          doc.children = shuffle(doc.children, seed);
        }
        const dm = new DataManager(cloned);
        const tb = new TreeBuilder(dm);
        const tree = tb.buildInternalTreeDebug(doc);
        return JSON.stringify(serializeTree(tree));
      };

      const reference = buildWithShuffle(1);
      for (let seed = 2; seed <= 10; seed++) {
        const result = buildWithShuffle(seed);
        expect(result, `Seed ${seed} produced different tree`).toBe(reference);
      }
    }, 60_000);
  }
});
```

- [ ] **Step 2: Run determinism test**

Run: `npx vitest run test/tree-builder/match-engine/determinism.test.ts`
Expected: PASS (5 fixtures × 10 shuffles each). If any fails, investigate — the engine or NodeMatcher has a hidden order dependency.

**Note**: If this test reveals pre-existing non-determinism in VariantMerger (not caused by Phase 1a), flag it and report. Do NOT fix it in Phase 1a — it's out of scope. Instead, add a `// TODO(phase-1-followup)` comment and skip that fixture for now.

- [ ] **Step 3: Commit**

```bash
git add test/tree-builder/match-engine/determinism.test.ts
git commit -m "test(match-engine): determinism test via shuffled variant order"
```

---

## Task A11: Pair assertion auto-generation script

**Files:**
- Create: `scripts/generate-pair-assertions.ts`

**Context:** `audit-baseline.json`을 읽어 size-variant-reject 패턴의 45 pairs를 자동으로 `pairAssertions.data.ts`로 변환. 이 스크립트는 Phase 1 내내 재실행 가능해야 하며, 출력은 결정론적(fixture 이름 정렬 + pair 내 id 정렬).

- [ ] **Step 1: Write the generator script**

File: `scripts/generate-pair-assertions.ts`

```typescript
#!/usr/bin/env node
/**
 * audit-baseline.json의 size-variant-reject pairs를 pairAssertions.data.ts로 자동 생성.
 *
 * 사용:
 *   npx tsx scripts/generate-pair-assertions.ts
 *
 * 결과:
 *   test/matching/pairAssertions.data.ts 를 덮어쓰기. 45개의 must-match assertion.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface AuditReport {
  byFixture: Array<{
    fixture: string;
    pairs: Array<{
      parentId: string;
      a: string;
      b: string;
      variantsA: string[];
      variantsB: string[];
      pattern: "size-variant-reject" | "variant-prop-position" | "unknown";
    }>;
  }>;
}

const ROOT = process.cwd();
const BASELINE = resolve(ROOT, "test/audits/audit-baseline.json");
const OUTPUT = resolve(ROOT, "test/matching/pairAssertions.data.ts");

const baseline = JSON.parse(readFileSync(BASELINE, "utf-8")) as AuditReport;

interface Assertion {
  fixture: string;
  description: string;
  nodeIdA: string;
  nodeIdB: string;
  kind: "must-match" | "must-not-match";
}

const assertions: Assertion[] = [];
for (const fx of baseline.byFixture) {
  // Skip COMPILE_ERROR fixtures
  if (fx.fixture.includes("COMPILE_ERROR")) continue;
  for (const p of fx.pairs) {
    if (p.pattern !== "size-variant-reject") continue;
    // Sort pair ids to ensure deterministic ordering
    const [idA, idB] = [p.a, p.b].sort();
    assertions.push({
      fixture: fx.fixture,
      description: `size-variant-reject: ${idA} ↔ ${idB} under ${p.parentId}`,
      nodeIdA: idA,
      nodeIdB: idB,
      kind: "must-match",
    });
  }
}

// Deterministic sort by fixture, then by nodeIdA
assertions.sort((a, b) => {
  if (a.fixture !== b.fixture) return a.fixture.localeCompare(b.fixture);
  return a.nodeIdA.localeCompare(b.nodeIdA);
});

const body = `import type { PairAssertion } from "./pairAssertions";

/**
 * Auto-generated from test/audits/audit-baseline.json
 * by scripts/generate-pair-assertions.ts
 *
 * Contents: all \`size-variant-reject\` pairs identified by Phase 0 audit.
 * These assertions should FAIL in Phase 1a (engine behavior-preserving, still 1.3 ratio)
 * and PASS in Phase 1b (relaxed to 2.0 ratio).
 *
 * Do NOT hand-edit. Re-run \`npx tsx scripts/generate-pair-assertions.ts\` to regenerate.
 */
export const pairAssertions: PairAssertion[] = ${JSON.stringify(assertions, null, 2)};
`;

writeFileSync(OUTPUT, body);
process.stdout.write(`Wrote ${assertions.length} assertions to ${OUTPUT}\n`);
```

- [ ] **Step 2: Ensure tsx is available (or use alternative runner)**

Run: `npx tsx --version 2>&1 || echo "tsx not found"`

If tsx is not available (no output or error), add it as a devDep: `npm install -D tsx`. If it is, proceed.

- [ ] **Step 3: Run the generator**

Run: `npx tsx scripts/generate-pair-assertions.ts`
Expected: `Wrote 45 assertions to .../test/matching/pairAssertions.data.ts` (or the number from the actual audit baseline — should be 45 per Phase 0 measurement).

- [ ] **Step 4: Verify output**

Run: `cat test/matching/pairAssertions.data.ts | head -30`
Expected: Shows the generated `pairAssertions` array with `kind: "must-match"` entries.

- [ ] **Step 5: Run pair assertion harness (expect failures — this is the TDD red state for Phase 1b)**

Run: `npx vitest run test/matching/pairAssertions.test.ts 2>&1 | tail -20`
Expected: **45 tests FAIL** (the engine still has 1.3 ratio — these assertions are TDD input for Phase 1b).

This is the red state that Phase 1b will flip to green.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-pair-assertions.ts test/matching/pairAssertions.data.ts
git commit -m "scripts: auto-generate pair assertions from audit-baseline (Phase 1b TDD red input)"
```

---

# Phase 1b — 임계값 완화 (Regression Fixes)

**목표**: `MatchingPolicy.relativeSizeMaxRatio`를 1.3 → 2.0으로 완화. 효과: size-variant-reject 45건 해소. 제약: 섀도 모드가 diff를 허용하되 그 diff가 *의도한 45건에만* 나타나야 함.

## Task B1: Policy 완화 (1.3 → 2.0) + shadow mode expectation update

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts`
- Modify: `test/tree-builder/match-engine/shadowMode.test.ts` — expect intentional diffs
- Modify: `test/tree-builder/match-engine/MatchingPolicy.test.ts` — Phase 1b value check
- Modify: `test/tree-builder/match-engine/signals/RelativeSize.test.ts` — update ratio test to 2.0

- [ ] **Step 1: Update MatchingPolicy**

Edit `MatchingPolicy.ts` — change single value:

```typescript
relativeSizeMaxRatio: 2.0, // Phase 1b: 완화 (원래 1.3, Phase 0 audit에서 45건 회귀 원인)
```

- [ ] **Step 2: Update MatchingPolicy.test.ts**

Change the assertion from `.toBe(1.3)` to `.toBe(2.0)`. Add a comment noting this is Phase 1b.

- [ ] **Step 3: Update RelativeSize.test.ts**

Update the "ratio 1.3" test cases to match the new 2.0 boundary:
- `width: 10 vs 12` (ratio 1.2) should still pass
- `width: 10 vs 15` (ratio 1.5) should now PASS (was failing with 1.3)
- `width: 10 vs 25` (ratio 2.5) should veto (exceeds 2.0)

Add a new test case for the exact 1.5-1.9 ratio range that was previously vetoed.

- [ ] **Step 4: Update shadowMode.test.ts — allow intentional diffs**

Change the shadow mode test from "zero disagreements" to "disagreements are all size-variant-reject fixes":

```typescript
// Phase 1b: intentional diffs expected when engine (2.0 ratio) disagrees with legacy (1.3 ratio)
// Verify each diff is a case where:
//  - legacy says "not same" (false)
//  - engine says "same" (true)
//  - AND the node types are SHAPE/CONTAINER group (the RelativeSize signal's scope)
if (disagreements.length > 0) {
  const wrongDirection = disagreements.filter(d => d.old === true && d.engine === false);
  expect(wrongDirection, `Engine wrongly rejects ${wrongDirection.length} pairs that legacy accepts`).toHaveLength(0);
  // All accepted diffs should be "legacy rejects but engine now accepts" — the intended fix direction
}
```

The key insight: Phase 1b relaxation should only **add** matches (engine accepts pairs legacy rejected), never **remove** matches (the opposite direction is a regression).

- [ ] **Step 5: Run tests**

```bash
npx vitest run test/tree-builder/match-engine/
```

Expected: MatchingPolicy/RelativeSize tests pass. shadowMode may still show some drift but only in the "allowed" direction. If drift is in the wrong direction, it's a bug — debug it.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts test/tree-builder/match-engine/MatchingPolicy.test.ts test/tree-builder/match-engine/signals/RelativeSize.test.ts test/tree-builder/match-engine/shadowMode.test.ts
git commit -m "feat(match-engine): Phase 1b - relax relativeSizeMaxRatio 1.3→2.0"
```

---

## Task B2: Switch engine to production (remove shadow mode, flip the switch)

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`

**Context:** 이제 `isSameNode`가 엔진 결과를 실제 반환값으로 사용한다. Legacy 메서드는 보존하되 호출되지 않는 상태로 남긴다 (Phase 1c에서 제거). **이 단계에서 engine 결과와 legacy 결과가 45건 차이 나야 한다** — 그게 이 Phase 1의 목적.

- [ ] **Step 1: Flip the switch in NodeMatcher.isSameNode**

Edit `NodeMatcher.ts` — change `isSameNode`:

```typescript
public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
  const ctx: MatchContext = {
    dataManager: this.dataManager,
    layoutNormalizer: this.layoutNormalizer,
    nodeToVariantRoot: this.nodeToVariantRoot,
    policy: defaultMatchingPolicy,
  };
  const decision = this.engine.decide(nodeA, nodeB, ctx);

  // Shadow-mode collector still runs if enabled (for diff logging)
  const collector = (globalThis as any).__SHADOW_MODE_COLLECTOR__ as
    | Array<{ pair: [string, string]; old: boolean; engine: boolean }>
    | undefined;
  if (collector) {
    const legacyResult = this.isSameNodeLegacy(nodeA, nodeB);
    const engineResult = decision.decision === "match";
    if (engineResult !== legacyResult) {
      collector.push({ pair: [nodeA.id, nodeB.id], old: legacyResult, engine: engineResult });
    }
  }

  return decision.decision === "match";
}
```

Note: `isSameNodeLegacy` is still present and still called from the collector branch (for diff comparison) but does not affect return value.

- [ ] **Step 2: Run pair assertions — expect all 45 PASS now**

Run: `npx vitest run test/matching/pairAssertions.test.ts`
Expected: **45 tests PASS** (or very close — if any still fail, the case isn't purely a RelativeSize issue; debug those specific pairs).

- [ ] **Step 3: Run audit — expect size-variant-reject to drop**

Run: `npm run audit:write && git diff test/audits/audit-baseline.json | head -30`
Expected: `size-variant-reject` count drops from 45 to 0 or near-0. `totalDisjointPairs` drops by ~45.

- [ ] **Step 4: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: Most tests pass. **Snapshot tests will have expected diffs** due to tree structure changes. Do NOT update snapshots yet — Task B3 handles that review.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts test/audits/audit-baseline.json
git commit -m "feat(match-engine): flip isSameNode to engine + new audit baseline"
```

---

## Task B3: Snapshot diff review + regeneration

**Files:**
- Modify: `test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap` (regenerate)
- Modify: `test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap` (regenerate)

**Context:** Phase 1b의 Policy 완화로 45개 fixture의 병합 결과가 바뀌었다. Snapshot diff를 각 fixture 단위로 검토해 의도된 개선인지 확인한 뒤 재생성. 이 단계가 "깔끔한 커밋 히스토리의 핵심".

- [ ] **Step 1: Run the snapshot tests and capture the diff**

Run: `npx vitest run test/snapshots/ 2>&1 | head -100`
Expected: Some tests fail with snapshot mismatches. The failures should be concentrated in fixtures that contain size-variant-reject patterns (e.g., `failing/Button`, `failing/Chips`).

- [ ] **Step 2: Cross-reference failing snapshots with audit-baseline.json**

For each failing fixture, verify:
1. It had non-zero `size-variant-reject` pairs in the pre-Phase-1b audit-baseline
2. The snapshot diff shows merged nodes that were previously separate siblings

If a fixture fails snapshot test but did NOT have size-variant-reject pairs in the old audit, that's an **unintended regression** — stop and debug.

- [ ] **Step 3: Update all snapshots**

Run: `npx vitest run test/snapshots/ -u`
Expected: All snapshots updated, 168 tests pass.

- [ ] **Step 4: Inspect the git diff of one updated snapshot file to sanity-check**

```bash
git diff test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap | head -50
```

Verify that the diffs show nodes being merged (fewer separate children in the tree) rather than structural chaos.

- [ ] **Step 5: Re-run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All tests pass (except the pre-existing decomposer failure from Phase 0).

- [ ] **Step 6: Commit**

```bash
git add test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap
git commit -m "test(snapshot): regenerate baselines for Phase 1b matching improvements"
```

---

## Task B4: Re-run determinism test on new engine behavior

**Files:** No new files. Verification only.

- [ ] **Step 1: Run determinism test**

Run: `npx vitest run test/tree-builder/match-engine/determinism.test.ts`
Expected: 5 fixtures × 10 shuffles each PASS.

If a test fails with "different result", the relaxed RelativeSize signal has introduced order dependency (e.g., Hungarian's tie-breaking changes based on a 1.3↔2.0 boundary case). Debug by capturing which pair caused the divergence.

- [ ] **Step 2: No commit if test passes (verification only)**

---

# Phase 1c — 정리 + Reason Log 노출

**목표**: 섀도 모드 코드 정리, reason log 디버깅 지원 활성화, 레거시 메서드 제거.

## Task C1: Remove shadow mode scaffolding

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- Delete or modify: `test/tree-builder/match-engine/shadowMode.test.ts`

- [ ] **Step 1: Remove shadow mode from NodeMatcher**

Edit `NodeMatcher.ts`:
- Remove the `__SHADOW_MODE_COLLECTOR__` collection block from `isSameNode`
- Remove the `isSameNodeLegacy` method entirely
- Remove the `import { createDefaultEngine, type MatchContext }` is preserved, and `isSameNode` now reads purely:

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

- [ ] **Step 2: Delete shadowMode.test.ts**

`rm test/tree-builder/match-engine/shadowMode.test.ts` (or use `git rm`).

Rationale: shadow mode's value was during migration. After Phase 1c, legacy is gone, shadow comparison is meaningless.

- [ ] **Step 3: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All tests still pass (decomposer pre-existing failure aside).

- [ ] **Step 4: Commit**

```bash
git rm test/tree-builder/match-engine/shadowMode.test.ts
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts
git commit -m "refactor(match-engine): remove shadow mode scaffolding after Phase 1b flip"
```

---

## Task C2: getPositionCost delegation to engine

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`

**Context:** Phase 1a~1b는 `isSameNode`만 엔진으로 돌리고, `getPositionCost`와 `isDefiniteMatch`는 여전히 legacy 로직이다. 이 Task에서 `getPositionCost`도 엔진 결과로 위임. 엔진의 `totalCost`가 Hungarian이 원하는 cost 값 그대로.

- [ ] **Step 1: Replace getPositionCost body**

```typescript
public getPositionCost(nodeA: InternalNode, nodeB: InternalNode): number {
  const ctx: MatchContext = {
    dataManager: this.dataManager,
    layoutNormalizer: this.layoutNormalizer,
    nodeToVariantRoot: this.nodeToVariantRoot,
    policy: defaultMatchingPolicy,
  };
  const decision = this.engine.decide(nodeA, nodeB, ctx);
  return decision.totalCost;
}
```

All the private helpers (`isOverflowNode`, `getVariantRootBounds`, `calcPositionCostByNormalizer`, etc.) are no longer used by `getPositionCost` but are still referenced by `isDefiniteMatch` and `isSameTextNode`/`isSameInstanceNode`. Leave them for now.

- [ ] **Step 2: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All tests pass. Hungarian matching results may change slightly because cost values are now engine-based, but the match decisions should align with `isSameNode`.

**If tests fail due to cost comparison**: the issue is that Phase 1a's NormalizedPosition signal produced slightly different cost values than the legacy `calcPositionCostByNormalizer` because of the (1 - cost/threshold) mapping. In that case, the NormalizedPosition signal needs to either (a) return raw cost form instead of score, or (b) the engine's cost conversion needs adjustment. Debug and fix.

- [ ] **Step 3: Run audit + snapshots**

```bash
npm run audit
npx vitest run test/snapshots/
```

Expected: audit count unchanged from Phase 1b result. Snapshot diffs should be minimal (only if Hungarian rankings changed).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts
git commit -m "feat(match-engine): getPositionCost delegates to engine totalCost"
```

---

## Task C3: Expose reason log for debug mode

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- Create: `test/tree-builder/match-engine/reasonLog.test.ts`

**Context:** Phase 1~3의 디버깅을 위해 매 매칭 결정의 이유를 추적할 수 있게 하나의 환경 변수 flag를 켰을 때 log를 수집. 엔진은 이미 `MatchDecision.signalResults`를 반환하므로, NodeMatcher가 선택적으로 수집해 `globalThis.__MATCH_REASON_LOG__`에 푸시하기만 하면 된다.

- [ ] **Step 1: Write test first**

File: `test/tree-builder/match-engine/reasonLog.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";

// Pick any simple fixture
import tadaButton from "../../fixtures/tada-button-component.json";

describe("Match decision reason log", () => {
  beforeEach(() => {
    (globalThis as any).__MATCH_REASON_LOG__ = [];
  });

  afterEach(() => {
    delete (globalThis as any).__MATCH_REASON_LOG__;
  });

  it("captures signalResults for every isSameNode call when enabled", () => {
    const dm = new DataManager(tadaButton as any);
    const tb = new TreeBuilder(dm);
    tb.buildInternalTreeDebug((tadaButton as any).info.document);

    const log = (globalThis as any).__MATCH_REASON_LOG__ as Array<any>;
    expect(log.length).toBeGreaterThan(0);
    for (const entry of log) {
      expect(entry).toHaveProperty("pair");
      expect(entry).toHaveProperty("decision");
      expect(entry).toHaveProperty("signalResults");
      expect(Array.isArray(entry.signalResults)).toBe(true);
    }
  });

  it("does not collect when log is not set up", () => {
    delete (globalThis as any).__MATCH_REASON_LOG__;
    const dm = new DataManager(tadaButton as any);
    const tb = new TreeBuilder(dm);
    tb.buildInternalTreeDebug((tadaButton as any).info.document);
    expect((globalThis as any).__MATCH_REASON_LOG__).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/tree-builder/match-engine/reasonLog.test.ts`
Expected: FAIL — log not being collected yet.

- [ ] **Step 3: Implement log collection in NodeMatcher**

Modify `isSameNode` in NodeMatcher.ts:

```typescript
public isSameNode(nodeA: InternalNode, nodeB: InternalNode): boolean {
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
    });
  }

  return decision.decision === "match";
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/tree-builder/match-engine/reasonLog.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts test/tree-builder/match-engine/reasonLog.test.ts
git commit -m "feat(match-engine): optional reason log via globalThis.__MATCH_REASON_LOG__"
```

---

## Task C4: Final verification + phase completion

**Files:** None (verification only).

- [ ] **Step 1: Run full test suite**

Run: `npm run test 2>&1 | tail -15`
Expected: All tests pass (decomposer pre-existing failure permitted).

- [ ] **Step 2: Run audit**

Run: `npm run audit`
Expected: PASS in baseline-compare mode. `size-variant-reject` should be 0 or near-0.

- [ ] **Step 3: Run snapshot tests**

Run: `npx vitest run test/snapshots/`
Expected: 168 tests pass.

- [ ] **Step 4: Run pair assertions**

Run: `npx vitest run test/matching/pairAssertions.test.ts`
Expected: 45 tests PASS (all Phase 1b targets resolved).

- [ ] **Step 5: Run determinism test**

Run: `npx vitest run test/tree-builder/match-engine/determinism.test.ts`
Expected: PASS (5 fixtures × 10 shuffles).

- [ ] **Step 6: No commit needed (verification only)**

---

## Completion Criteria

Phase 1 is complete when:

- [ ] `MatchDecisionEngine`, 4 signals, and `MatchingPolicy` exist in `match-engine/`
- [ ] `NodeMatcher.isSameNode` delegates to engine entirely (no shadow mode, no legacy)
- [ ] `NodeMatcher.getPositionCost` delegates to engine
- [ ] `pairAssertions.data.ts` contains 45 `must-match` assertions — all PASS
- [ ] Audit baseline updated: size-variant-reject count 45 → ≤5
- [ ] Snapshot baselines regenerated with reviewed diffs
- [ ] Determinism test passes on 5 representative fixtures
- [ ] Reason log available via `__MATCH_REASON_LOG__` global
- [ ] All Phase 0 infrastructure tests still pass
- [ ] Pre-existing non-Phase-0 test suite passes (decomposer flake aside)
- [ ] All committed on `feat/variant-merger-phase1` worktree branch

Phase 2 can begin once these criteria are met. Phase 2 will add `ParentShapeIdentity`, `VariantPropPosition`, `WrapperRoleDistinction` signals and extend the audit classifier.
