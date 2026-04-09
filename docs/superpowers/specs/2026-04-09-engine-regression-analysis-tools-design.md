# 엔진 회귀 분석 도구 디자인

> Variant matching engine 변경 시 회귀를 자동으로 추적·분석할 수 있는 재사용 가능한 도구 세트.

**작성일**: 2026-04-09
**관련**: `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md`

## 배경

Variant Merger 엔진의 신호(signal)를 추가/변경할 때마다 audit baseline 회귀가 발생할 수 있다. 현재까지는 회귀 측정과 원인 분석이 수동·일회성으로 이루어졌다 — 매번 즉석 스크립트를 만들고, 새 회귀가 어디서 왔는지 사람이 트리 덤프를 읽어 추적했다.

이 작업의 동기는 다음 신호 추가(ChildrenShape signal) 작업을 안전하게 진행하는 것이지만, 도구는 **이후 모든 엔진 변경 작업에서 재사용**되도록 설계한다.

## Goal

엔진 변경 후 다음 질문에 자동으로 답할 수 있게:
1. 회귀가 늘었나, 줄었나? 어디서?
2. 회귀로는 안 잡히지만 의심스러운 매칭이 있나?
3. 특정 노드 pair가 왜 매칭됐나/안 됐나?

도구는 모두 vitest 테스트로 구성하여 기존 audit 인프라(`fixtureLoaders`, `DataManager`, `TreeBuilder`)를 재사용한다.

## Architecture

```
test/audits/
├── variantMatchingAudit.test.ts   (기존 — audit baseline 생성)
├── auditDiff.test.ts              (NEW — baseline 비교)
├── anomalyScan.test.ts            (NEW — 이상한 매칭 탐지)
└── matchTrace.test.ts             (NEW — 신호별 결정 추적)

test/audits/baselines/
├── audit-baseline.json            (기존)
└── anomaly-baseline.json          (NEW)

docs/guide/8-workflow/
└── regression-analysis.md         (NEW — 사용법 가이드)
```

엔진 코드는 변경하지 않는다. `NodeMatcher.ts:78`에 이미 존재하는 `__MATCH_REASON_LOG__` global hook을 활용한다.

## Components

### 1. auditDiff — 비교 도구

**파일**: `test/audits/auditDiff.test.ts`
**npm script**: `npm run audit:diff`

**동작**:
1. 현재 audit 실행 (기존 `runAudit()` 재사용)
2. `test/audits/audit-baseline.json`과 비교
3. 텍스트 리포트 출력:
   - 패턴별 변화 (`+3 same-name-same-type`, `-2 variant-prop-position` 등)
   - 새 회귀 fixture별 목록
   - 사라진 회귀 fixture별 목록

**baseline 갱신**: `UPDATE_BASELINE=1 npm run audit:diff`로 명시할 때만.

**출력 예시**:
```
=== Audit Diff ===
Total: 1856 → 1834 (-22)
Patterns:
  same-name-same-type:    7 → 5  (-2)
  variant-prop-position: 20 → 5  (-15)
  size-variant-reject:    1 → 0  (-1)
  different-name:       931 → 927 (-4)

New regressions: 0
Resolved regressions:
  - failing/Switch (variant-prop-position ×2)
  - failing/Buttonsolid (variant-prop-position ×4)
  ...
```

### 2. anomalyScan — 이상한 매칭 탐지

**파일**: `test/audits/anomalyScan.test.ts`
**npm script**: `npm run audit:anomaly`

**동작**:
1. 모든 fixture의 **raw merged tree** 스캔 (`buildInternalTreeDebug({ skipInteractionStripper: true })`)
2. 등록된 detector를 각 노드에 적용
3. 결과를 `test/audits/baselines/anomaly-baseline.json`에 저장
4. 기존 baseline과 비교 (auditDiff와 같은 방식)

**Detector 인터페이스**:
```typescript
interface AnomalyDetector {
  readonly name: string;
  detect(node: InternalNode, ctx: AnomalyContext): Anomaly | null;
}
```

**초기 detector (1개)**: `CrossNameMerge` — `mergedNodes`에 서로 다른 `name`이 섞인 노드 탐지. 기존 `cross-name-merge-scan.test.ts` 로직 이관.

**확장 가능**: 다른 anomaly 패턴이 발견되면 detector 추가만 하면 됨.

### 3. matchTrace — 신호별 결정 추적

**파일**: `test/audits/matchTrace.test.ts`
**npm script**: `npm run audit:trace -- <fixture> <figmaNodeIdA> <figmaNodeIdB>`

**동작**:
1. 인자로 fixture 이름과 두 Figma node ID(예: `16215:37749`) 받기
   - ID 종류: 원본 Figma node id (audit baseline의 `pair.a`/`pair.b`와 같은 형식)
2. 해당 fixture 로드, `buildInternalTreeDebug({ skipInteractionStripper: true })` 실행
3. 빌드된 InternalTree를 walk 하면서 두 ID에 해당하는 InternalNode 찾기 (mergedNodes에 ID 포함되어 있는 노드)
4. `(globalThis as any).__MATCH_REASON_LOG__ = []` 초기화
5. NodeMatcher를 직접 호출 (`getPositionCost(internalNodeA, internalNodeB)`)
6. log에 수집된 신호별 결정을 표 형태로 출력:

```
=== Match Trace: failing/Buttonsolid ===
Pair: 16215:37749 (Wrapper, FRAME) ↔ 16215:37612 (Interaction, FRAME)

Signal              | Decision           | Cost | Reason
--------------------|--------------------|------|----------------------------
TypeCompatibility   | match              | 0.00 | both FRAME
IdMatch             | neutral            | -    | different IDs
NormalizedPosition  | decisive-match-w/c | 0.07 | pos cost 0.067
(short-circuit)
--------------------|--------------------|------|----------------------------
TOTAL               | match              | 0.07 |
```

이 출력으로 어느 신호가 어떤 결정을 내렸는지 한눈에 확인 가능.

### 4. 워크플로우 가이드

**파일**: `docs/guide/8-workflow/regression-analysis.md`

**내용 요약**:

```
# Variant Merger 엔진 변경 워크플로우

## 1. 변경 전
- npm run audit (baseline 확인)
- npm run audit:anomaly (anomaly baseline 확인)

## 2. 엔진 변경 후
- npm run audit:diff
  → 회귀 변화 확인
- npm run audit:anomaly
  → 새 anomaly 발생 확인

## 3. 새 회귀 분석
새 회귀가 있으면:
- audit:diff 출력에서 fixture/pair 식별
- npm run audit:trace -- <fixture> <nodeA> <nodeB>
- 어느 신호 때문인지 확인 → 가중치/threshold 조정

## 4. 결정
- 회귀 0 + 의도된 anomaly 변화 → baseline 갱신
- 회귀 발생 → 분석 후 (a) 공식 조정 / (b) 일부 회귀 수용 / (c) 롤백
```

## Data Flow

```
[변경 전]
audit-baseline.json (회귀 19건)
anomaly-baseline.json (cross-name 119건)

[엔진 변경]
NormalizedPosition 수정 + ChildrenShape 신호 추가 (다음 spec)

[변경 후 분석]
npm run audit:diff
  → "+0 회귀, -10 회귀" (예시)
npm run audit:anomaly
  → "container cross-name 31 → 0"
npm run audit:trace -- failing/Buttonsolid 16215:37749 16215:37612
  → "ChildrenShape: cost 0.83 → totalCost 0.90 → veto"
```

## Testing

각 도구는 자체 vitest 테스트로 동작 자체가 검증됨. 추가 단위 테스트는 최소화:

- **auditDiff**: 가짜 baseline + 가짜 현재 결과로 diff 출력 검증
- **anomalyScan**: detector 1-2개로 known fixture 결과 검증
- **matchTrace**: 알려진 pair에 대해 trace 출력 형식 검증

## Out of Scope

다음은 이번 작업에 포함하지 않음:
- 자동 회귀 분류기 ("이건 진짜 버그", "이건 legitimate")
- 시각화/그래프
- CI 통합 (수동 실행)
- 신호별 가중치 자동 튜닝
- 다중 baseline 관리 (브랜치별 등)

## 다음 작업

이 spec이 끝나면:
- **Spec: ChildrenShape signal 추가** — 본 도구를 사용하여 안전하게 신호 도입
