# ChildrenShape Signal 디자인

> Variant Merger 엔진이 위치만 보고 다른 이름의 컨테이너를 같은 노드로 매칭하던 것을 막기 위해, 자식 구조까지 같이 보는 새 신호를 추가한다.

**작성일**: 2026-04-09
**관련**:
- `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` — 엔진 설계
- `docs/superpowers/specs/2026-04-09-engine-regression-analysis-tools-design.md` — 본 spec 검증에 사용할 도구

## 배경 / 문제

`failing/Buttonsolid` 등 다수의 fixture에서 VariantMerger가 **이름이 다른** 컨테이너 두 개를 같은 노드로 합치는 케이스가 발견됐다. 가장 명확한 예: `Wrapper`(자식 3개: Loading/Mask/Content) ↔ `Interaction`(자식 1개: INSTANCE). 두 노드는 의미가 완전히 다른데, 정규화된 위치가 비슷하다는 이유로 merger가 같은 노드 취급해 자식까지 재귀 병합한다.

문제의 근원은 `NormalizedPosition` 신호가 container pair에 대해 `decisive-match-with-cost` 결정을 내리고 short-circuit하여 후속 신호가 들어오지 못하는 데 있다. 이름·자식 구조 같은 추가 검증 기회 자체가 없다.

`anomaly-baseline.json` 기준 119건의 cross-name 매칭이 존재하며, 이전 시뮬레이션에서 자식 구조 점수만으로도 진짜 버그(`Wrapper↔Interaction` 등) 33/33을 잡고 legitimate rename(`Label↔Secondary` 등)에는 false positive 0이 관찰됐다.

## Goal

- container pair에 대해 위치 cost + 자식 구조 cost를 합산해 최종 결정.
- cross-name 매칭 줄이기 (목표: container 한정 hit 31 → ≤ 5).
- audit baseline 회귀는 0건 새로 발생.
- 변경 후 `npm run audit:diff` 결과가 깨끗하면 baseline 갱신 + 머지.

## 비-Goal

- TEXT / SHAPE / INSTANCE pair에 대한 변경. (이전 시뮬레이션에서 자식 구조 신호가 영향 없는 카테고리. 이번 작업에선 cost 0 반환만.)
- VariantMerger의 매칭 알고리즘 변경. (Hungarian, 2-pass 구조 그대로.)
- splitMultiComponentInstances 같은 후처리 변경.
- 새 detector 추가. (cross-name detector가 충분.)

## 설계

### 변경 3곳

#### 1. `NormalizedPosition.ts` — container pair에 한해 short-circuit 제거

현재 위치 검사가 통과하면 항상 `decisive-match-with-cost`를 반환해 후속 신호를 막는다. **container pair (FRAME/GROUP) 일 때만** `match-with-cost`로 강등해 ChildrenShape가 cost를 추가할 수 있게 한다. TEXT / INSTANCE / SHAPE pair는 기존 동작 유지.

**왜 container pair만**: `decisive-match-with-cost`의 원래 목적은 후속 fallback signal(TextSpecialMatch, InstanceSpecialMatch)이 같은 pair에 대해 중복 cost를 더하는 것을 막는 것이었음 (Phase 2 cost form 재설계 결정). container pair에서는 두 fallback signal이 type 가드로 걸러지므로 short-circuit을 풀어도 안전하지만, 다른 type pair에서는 부작용 위험이 남아있어 그대로 둔다.

변경 위치 (NormalizedPosition.ts 마지막 return):

```typescript
const isContainerPair =
  CONTAINER_TYPES.has(a.type) && CONTAINER_TYPES.has(b.type);

return {
  kind: isContainerPair ? "match-with-cost" : "decisive-match-with-cost",
  cost: totalCost,
  reason: `pos cost ${cost.toFixed(3)}${
    totalCost !== cost ? ` + overflow ${ctx.policy.overflowMismatchPenalty}` : ""
  }`,
};
```

`CONTAINER_TYPES`는 같은 파일 상단에 이미 정의됨 (`new Set(["GROUP", "FRAME"])`).

#### 2. 새 신호 `ChildrenShape.ts`

container pair (FRAME ↔ FRAME, GROUP ↔ GROUP, 또는 FRAME ↔ GROUP)에 대해 자식 구조 차이를 cost로 환산한다.

**점수 공식** (raw shape score, 0~1):

```
shapeScore = 0.5 × countDiff + 0.5 × typeDiff

countDiff  = |childrenA.length - childrenB.length| / max(childrenA.length, childrenB.length)
typeDiff   = Σ|countA[type] - countB[type]| / (childrenA.length + childrenB.length)
```

- `countDiff`: 자식 개수의 상대적 차이. 0 (같음) ~ 1 (한쪽이 0).
- `typeDiff`: 자식 type 다중집합의 차이. 자식 type 분포가 같으면 0.
- 둘 다 0~1 범위.

**반환 형태**:
- `node.type` 또는 둘 다 container 타입이 아닌 경우: `neutral` (cost 추가 없음, 다른 신호에 위임)
- 한쪽이라도 자식 정보 없음 (`undefined` 또는 `[]`이고 다른 쪽도 `[]`): `neutral`
- container pair이고 자식 정보 있음: `match-with-cost(weight × shapeScore)`

**weight**는 `MatchingPolicy`에서 받는다 (`childrenShapeWeight`, 출발점 1.0).

#### 3. 엔진에 신호 등록 + Policy 추가

`match-engine/index.ts`의 신호 배열에 NormalizedPosition 다음, VariantPropPosition 앞에 `ChildrenShape` 추가:

```typescript
[
  new TypeCompatibility(),
  new IdMatch(),
  new NormalizedPosition(),
  new ChildrenShape(),         // ← 새로 추가
  new VariantPropPosition(),
  new TextSpecialMatch(),
  new InstanceSpecialMatch(),
  new ParentShapeIdentity(),
]
```

`MatchingPolicy.ts`에 가중치 추가:

```typescript
readonly childrenShapeWeight: number;

// defaultMatchingPolicy:
childrenShapeWeight: 1.0,

signalWeights: {
  // ... 기존
  ChildrenShape: 1,  // 추가
}
```

`matchCostThreshold`(현재 0.6)는 그대로 유지하고 audit 결과를 보고 조정.

### 데이터 흐름

```
NodeMatcher.getPositionCost(a, b)
  ↓
MatchDecisionEngine.decide(a, b)
  ↓
TypeCompatibility → 호환 OK or 거부
IdMatch → ID 같으면 즉시 match
NormalizedPosition → 위치 cost (이제 short-circuit 안 함)
  ↓
ChildrenShape → container pair면 자식 구조 cost, 아니면 neutral
  ↓
... (나머지 fallback signals)
  ↓
totalCost = NP cost + ChildrenShape cost (+ 다른 신호의 cost들)
  ↓
totalCost ≤ matchCostThreshold(0.6) → match, 아니면 veto
```

**예시 — 정상 케이스 (Wrapper↔Wrapper)**:
- NP cost: ~0.05
- ChildrenShape cost: 0 (자식 구조 동일)
- total: 0.05 → match ✓

**예시 — Wrapper(3 children)↔Interaction(1 child)**:
- NP cost: ~0.07
- ChildrenShape cost: ~0.83
- total: ~0.90 → veto ✗ (목표 동작)

**예시 — Label↔Secondary (legitimate rename, TEXT)**:
- ChildrenShape: neutral (TEXT pair, container 아님)
- 영향 없음 ✓

### 가중치 / 임계값 조정 전략

audit:diff 결과에 따라 다음 순서로 튜닝:

1. **새 회귀 0건 + cross-name 충분히 줄어듦**: 갱신 + 머지.
2. **새 회귀 발생**: matchTrace로 원인 추적 → 어느 신호가 잘못 결정했는지 확인.
   - ChildrenShape cost가 너무 큰 케이스 → `childrenShapeWeight` 0.7~0.8로 낮춤.
   - 너무 보수적이 되면서 cross-name 효과가 사라지면 → 다른 출발점 시도.
3. **cross-name이 거의 안 줄어듦**: `childrenShapeWeight` 1.2~1.5로 높임 또는 `matchCostThreshold` 0.5로 좁힘.

각 조정 사이에 audit:diff와 audit:anomaly를 모두 재실행해 효과 확인.

### 컴포넌트 / 파일 구조

**새로 생성**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/ChildrenShape.ts`
- `test/tree-builder/match-engine/ChildrenShape.test.ts` (또는 기존 match-engine 테스트 위치 따름)

**수정**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/signals/NormalizedPosition.ts` — short-circuit 한 줄 변경
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/index.ts` — 신호 등록
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/match-engine/MatchingPolicy.ts` — `childrenShapeWeight` 추가, signalWeights에 `ChildrenShape: 1` 추가

**갱신될 baseline**:
- `test/audits/audit-baseline.json` (audit 회귀가 줄거나 그대로일 때)
- `test/audits/baselines/anomaly-baseline.json` (cross-name 줄어듦)

## 테스트 / 검증

### 단위 테스트 (ChildrenShape.test.ts)

다음 케이스 모두 커버:

1. **자식 구조 동일** (count + types 동일) → cost 0
2. **자식 개수만 다름** (3 vs 1, 같은 type) → 비례 cost
3. **자식 type 패턴 다름** (FRAME×2 vs TEXT×2, 같은 개수) → 비례 cost
4. **둘 다 자식 0개** → neutral
5. **한쪽만 container 타입** (FRAME vs TEXT) → neutral
6. **둘 다 container지만 한쪽 자식 정보 undefined** → neutral
7. **알려진 케이스: Wrapper(3) vs Interaction(1)** → 점수 ≥ 0.5

### NormalizedPosition 변경 단위 테스트

기존 NormalizedPosition 단위 테스트가 있으면 그대로 두고, container pair success 케이스가 `match-with-cost`를 반환하는지만 추가 검증.

### 통합 / 회귀 게이트

```
npm run audit          # 회귀 0건 증가 (PASS gate)
npm run audit:diff     # 새 회귀 / 사라진 회귀 상세
npm run audit:anomaly  # cross-name 변화 (감소 기대)
```

### 완료 기준

- 단위 테스트 모두 PASS
- `npm run audit`: 회귀 증가 0건 (1856 이하 유지)
- `npm run audit:anomaly`: cross-name container hit ≤ 5 (현재 31)
- 기존 snapshot: 변경된 것은 의도된 것임을 확인
- baseline 갱신 후 머지

### 롤백 조건

가중치를 조정해도 회귀 0건과 cross-name 감소를 동시에 못 잡으면:
- 사용자에게 보고
- spec 재검토 (예: 추가 신호 필요? 다른 공식?)
- 일부 회귀 수용 여부는 사용자 결정

## 의도적 단순화 (Out of Scope)

- ChildrenShape는 **재귀 깊이 1만** 본다 (직속 자식 구조). 손자까지 보면 비용이 커지고 효과 향상은 미미할 가능성.
- type 비교는 다중집합(unordered). 순서 비교는 false positive 위험 높음.
- name 비교 포함하지 않음. 이번 작업의 본질은 "이름 신뢰 못 함, 구조로 판단"이므로.
- 가중치 자동 튜닝 없음. 수동 조정 + audit:diff 반복.

## 다음 작업 (이 spec 이후)

이 spec이 끝나면 audit baseline의 남은 19건 회귀(variant-prop-position 20, same-name-same-type 7 등)를 별도 spec으로 다룬다. 그것들은 다른 매칭 알고리즘 한계(boolean swap, multi-prop, enum)에서 비롯되므로 ChildrenShape로는 안 풀린다.
