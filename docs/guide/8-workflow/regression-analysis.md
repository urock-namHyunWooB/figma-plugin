# Variant Merger 엔진 회귀 분석 워크플로우

> 엔진 변경 시 회귀를 추적하고 원인을 분석하는 표준 절차.

**대상**: VariantMerger / NodeMatcher / match-engine 신호 변경 작업.

## 도구 개요

| 도구 | 명령 | 역할 |
|------|------|------|
| audit | `npm run audit` | 회귀 게이트 (회귀 증가 시 fail) |
| auditDiff | `npm run audit:diff` | 변경 전후 회귀 변화 상세 출력 |
| anomalyScan | `npm run audit:anomaly` | 회귀로는 안 잡히는 의심 매칭 탐지 |
| matchTrace | `TRACE_FIXTURE=... TRACE_A=... TRACE_B=... npm run audit:trace` | 특정 pair 신호별 결정 출력 |

baseline 갱신:
- `npm run audit:write` — audit baseline
- `npm run audit:anomaly:write` — anomaly baseline
- `UPDATE_BASELINE=1 npm run audit:diff` — auditDiff 경유 갱신

## 표준 워크플로우

### 1. 변경 전 — baseline 확인

```bash
npm run audit         # 현재 1856건 (예시)
npm run audit:anomaly # 현재 119건 (예시)
```

두 baseline이 모두 존재하고 PASS인지 확인.

### 2. 엔진 변경 후 — 변화 측정

```bash
npm run audit:diff
```

출력 예시:
```
=== Audit Diff ===
Total: 1856 → 1834 (-22)
Patterns:
  same-name-same-type: -2
  variant-prop-position: -15

New regressions (0):

Resolved regressions (22):
  - failing/Switch  parent=74:150  74:157 ↔ 74:153  [variant-prop-position]
  ...
```

```bash
npm run audit:anomaly
```

출력 예시:
```
=== Anomaly Scan ===
Total: 95
Compile errors: 0
  cross-name: 95

=== Anomaly Diff ===
Total: 119 → 95 (-24)
New (0):
Resolved (24):
  - failing/Buttonsolid  Wrapper (FRAME) 16215:37749
  ...
```

### 3. 새 회귀가 있을 경우 — 원인 추적

새 회귀의 fixture/노드 ID를 audit:diff 출력에서 확인 후:

```bash
TRACE_FIXTURE=<fixture> TRACE_A=<nodeIdA> TRACE_B=<nodeIdB> npm run audit:trace
```

출력 예시:
```
=== Match Trace: failing/Buttonsolid ===
Pair: 16215:37749 (Wrapper, FRAME) ↔ 16215:37612 (Interaction, FRAME)

Signal              | Decision           | Cost  | Reason
--------------------|--------------------|-------|----------------------------
TypeCompatibility   | match              | 0.00  | both FRAME
IdMatch             | neutral            | -     | different IDs
NormalizedPosition  | match-with-cost    | 0.07  | pos cost 0.067
ChildrenShape       | match-with-cost    | 0.83  | child count 3 vs 1
--------------------|--------------------|-------|----------------------------
TOTAL               | veto               | Inf   | (totalCost > threshold)
```

이 출력으로 어느 신호가 어떤 결정을 내렸는지 확인 → 가중치/threshold 조정.

**주의**: 이미 병합된 두 노드를 trace하면 같은 InternalNode로 수렴해서 IdMatch가 즉시 accept한다. 이 경우 **post-merge 상태**를 보고 있는 것으로, 매칭 결정 자체를 보려면 매칭이 되지 않은 pair에 대해 trace해야 한다.

### 4. 결정

| 상황 | 조치 |
|------|------|
| 회귀 0 + 의도된 anomaly 변화 | baseline 갱신 후 머지 |
| 새 회귀 발생 | trace로 분석 → (a) 공식 조정 / (b) 회귀 수용 / (c) 롤백 |
| anomaly 새로 등장 | 새 detector 추가 또는 기존 detector 정확도 개선 |

## Detector 추가하기

새 anomaly 패턴을 발견하면 `test/audits/detectors/`에 클래스 추가:

```typescript
// test/audits/detectors/MyDetector.ts
import type { AnomalyDetector, Anomaly, AnomalyContext } from "./types";
import type { InternalNode } from "@code-generator2/types/types";

export class MyDetector implements AnomalyDetector {
  readonly name = "my-anomaly";

  detect(node: InternalNode, depth: number, ctx: AnomalyContext) {
    // null 반환 = 이상 없음
    // Anomaly 객체 반환 = 이상 발견
    return null;
  }
}
```

그리고 `test/audits/anomalyScan.ts`의 `defaultDetectors()`에 등록.

## 자주 묻는 것

**Q. baseline은 언제 갱신해야 하나?**
A. 회귀가 의도적으로 줄거나 의도된 변화일 때만. 새 회귀를 baseline에 흡수하는 갱신은 금지.

**Q. anomaly는 모두 버그인가?**
A. 아니다. anomaly는 "회귀로는 안 잡히지만 의심스러운 매칭". legitimate rename / component swap도 잡힘. 새 anomaly가 등장했을 때만 분석하면 됨.

**Q. matchTrace가 가짜 nodeToVariantRoot 매핑을 쓰는데 정확한가?**
A. 정확하다. trace는 NodeMatcher의 단일 호출을 시뮬레이션하므로 fixture document에서 variant root를 한 번만 매핑하면 충분.
