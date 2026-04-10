# 신호 독립성 복원 설계

**작성일**: 2026-04-10
**상태**: Draft (사용자 검토 대기)
**대상**: `src/.../processors/variant-merger/match-engine/MatchDecisionEngine.ts`
**선행 작업**: Spec A (엔진 통합), Spec B (Hungarian observer)

---

## 1. 배경

### 1.1 현재 문제

`MatchDecisionEngine.decide()`가 `decisive-match-with-cost`를 반환하는 신호를 만나면 **즉시 return**하고 나머지 신호를 평가하지 않는다.

```ts
// 현재 코드 (MatchDecisionEngine.ts:59-65)
if (result.kind === "decisive-match-with-cost") {
  return {
    decision: "match",
    totalCost: result.cost,
    signalResults,  // ← 이후 신호의 결과가 빠져있음
  };
}
```

이로 인해:
- NormalizedPosition이 match하면 후속 4개 신호(VPP, TextSpecial, InstanceSpecial + 미래 신호)가 **절대 실행되지 않음**
- Controlcheckbox observer 실측: NP가 282회 단독 결정, 다른 신호는 TypeCompatibility veto 30건만 기여
- **미래에 "이름이 다르면 감점" 같은 cross-name 대응 신호를 추가해도** NP가 먼저 단락하면 새 신호는 발언 불가

### 1.2 핵심 관찰

`decisive-match-with-cost`를 사용하는 신호 4개(NP, TextSpecial, InstanceSpecial, VPP)는 **상호 배타적**으로 동작한다:
- NP 성공 → 나머지 3개는 NP의 fallback으로 설계됨 (NP neutral일 때만 의미)
- NP 실패(neutral) → TextSpecial 또는 InstanceSpecial 또는 VPP 중 하나가 대신 결정

따라서 단락을 제거해도 **cost가 이중 적산되는 일이 없다** — 동시에 두 개가 match를 반환하지 않으므로.

### 1.3 유일한 veto 가능 신호

현재 veto를 반환할 수 있는 신호:
- **TypeCompatibility**: type 비호환 시 veto (NP보다 먼저 실행)
- **NormalizedPosition**: shape size mismatch 또는 container cross size mismatch 시 veto (decisive-match-with-cost 반환 전에 자체 veto → 단락 제거와 무관)

TypeCompatibility는 NP보다 **먼저** 실행되고, NP의 자체 veto는 decisive-match-with-cost 반환 **이전**에 발생하므로, **현재 신호 조합에서 "NP가 match한 뒤 다른 신호가 veto"하는 케이스는 존재하지 않는다**.

→ **현재 신호 조합에서 behavior 변화 = 0**. 미래 신호 추가 시에만 실질 효과.

---

## 2. 목표

**한 문장**: `MatchDecisionEngine.decide()`에서 `decisive-match-with-cost`의 즉시 return을 제거하고, 모든 신호가 평가된 후 resolution 단계에서 결정하도록 변경한다.

### 2.1 범위 안

1. `MatchDecisionEngine.decide()` 루프 수정 (~15줄)
2. Observer before/after diff로 behavior 무변화 증명

### 2.2 범위 밖

- 신호 파일 변경 (NP, TextSpecial, InstanceSpecial, VPP, TypeCompatibility 등 전부 현재 코드 그대로)
- `decisive-match-with-cost` SignalResult 타입 제거 (타입은 유지, 엔진 해석만 변경)
- `decisive-match` (IdMatch 전용) 동작 변경 (IdMatch는 Pass 1에서 처리되므로 엔진 Pass 2에서 실질적으로 미사용이지만 타입/코드 유지)
- MatchingPolicy 값 변경
- 새 신호 추가 (Spec D/E 범위)

---

## 3. 설계

### 3.1 변경된 `decide()` 루프

**Before** (현재): 신호를 순서대로 평가하다 `decisive-match-with-cost`를 만나면 즉시 return.

**After**: 모든 신호를 평가하고 결과를 수집한 후 resolution 단계에서 결정.

```
Phase 1 — 수집:
  for each signal:
    result = signal.evaluate(a, b, ctx)
    수집: signalResults에 push
    기록: veto 여부, decisive-match 여부, 첫 decisive-match-with-cost cost

Phase 2 — Resolution (우선순위 순):
  1. decisive-match (IdMatch) → match, cost=0
  2. veto → veto, cost=Infinity
  3. decisive-match-with-cost → match, cost=첫 번째 해당 신호의 cost
  4. match-with-cost / score 합산 → threshold 비교
  5. 아무 match 표시 없음 → veto
```

### 3.2 Resolution 우선순위 설명

| 우선순위 | 신호 결과 | 결정 | 근거 |
|---|---|---|---|
| 1 | `decisive-match` | match (cost=0) | ID 일치 = 절대 확실. 현실에서 Pass 2에서 발생 안 함 (Pass 1이 선점). 방어적 유지. |
| 2 | `veto` | veto (cost=∞) | 하나라도 명시적 거부 → 거부. **이것이 핵심 변경** — 기존에는 NP의 decisive-match-with-cost가 후속 veto를 차단했음. |
| 3 | `decisive-match-with-cost` | match (첫 cost) | NP/TextSpecial/InstanceSpecial/VPP 중 첫 번째 match. 상호 배타적이므로 실질적으로 하나만 존재. |
| 4 | `match-with-cost` / `score` 합산 | threshold 비교 | 현재 사용하는 신호 없음. 미래 "약한 신호" 추가 시 활성화. |
| 5 | 전부 `neutral` | veto | 아무 신호도 매치를 주장하지 않음 → 거부. |

### 3.3 `decisive-match` vs `decisive-match-with-cost` 구분 유지

두 타입은 의미가 다르다:
- `decisive-match`: **절대 확실** (ID 일치). veto보다 높은 우선순위. 현실에서 Pass 2에서 미발생.
- `decisive-match-with-cost`: **높은 확신** (위치 일치, 텍스트 일치 등). veto보다 **낮은** 우선순위. 미래 신호가 veto로 override 가능.

이 구분이 Spec C의 핵심 변경: **기존에는 둘 다 "즉시 return"이었는데, 이제 `decisive-match-with-cost`는 즉시 return하지 않고 후속 신호 평가를 허용**.

---

## 4. 검증

### 4.1 Observer before/after diff

```bash
# Before (변경 전 상태)
OBSERVE_FIXTURE=any/Controlcheckbox OBSERVE_OUT=/tmp/obs-before.txt npm run audit:observe
OBSERVE_FIXTURE=failing/Buttonsolid OBSERVE_OUT=/tmp/obs-before-btn.txt npm run audit:observe

# After (변경 적용 후)
OBSERVE_FIXTURE=any/Controlcheckbox OBSERVE_OUT=/tmp/obs-after.txt npm run audit:observe
OBSERVE_FIXTURE=failing/Buttonsolid OBSERVE_OUT=/tmp/obs-after-btn.txt npm run audit:observe

# Diff
diff /tmp/obs-before.txt /tmp/obs-after.txt
diff /tmp/obs-before-btn.txt /tmp/obs-after-btn.txt
```

**기대**: assignment 변화 0건. 유일한 차이는 observer 출력에 **더 많은 signal result가 표시**되는 것 (이전에 short-circuit으로 생략되던 신호들이 이제 neutral로 나타남).

### 4.2 기존 테스트

- `npm run test` — baseline 동일 (121 passed, 5 failed)
- `npx tsc --noEmit` — 에러 0
- `npm run audit` — baseline 동일

### 4.3 신호별 unit test

- `test/tree-builder/match-engine/MatchDecisionEngine.test.ts` — 기존 테스트 통과
- 추가: `decisive-match-with-cost` 뒤에 veto가 오는 케이스 → veto가 승리하는지 확인 (새 테스트)

---

## 5. 성공 기준

1. **Behavior 무변화**: 모든 기존 테스트/audit baseline 동일
2. **Observer diff**: assignment 변화 0건 (before/after 동일 assignment)
3. **Observer 가시성 증가**: 이전에 `(신호 N개 중 3개만 표시)`이던 것이 `(전부 표시)`로 변경
4. **새 단위 테스트**: "decisive-match-with-cost 후 veto → veto 승리" 케이스 통과
5. **미래 확장성**: 이 변경 후 새 신호를 추가하면 NP 결정을 override할 수 있는 구조가 됨 (Spec D/E에서 검증)

---

## 6. 영향 받는 파일

**수정**:
- `src/.../variant-merger/match-engine/MatchDecisionEngine.ts` — `decide()` 메서드 (~15줄 수정)

**신규**:
- (없음)

**테스트 추가**:
- `test/tree-builder/match-engine/MatchDecisionEngine.test.ts` — "veto after decisive-match-with-cost" 케이스 1개 추가

**변경 없음**:
- 모든 signal 파일, MatchSignal.ts, MatchingPolicy.ts, NodeMatcher.ts, VariantMerger.ts

---

## 7. 후속 작업

- **Spec D**: 페어 단언 인프라 — "이 노드 쌍은 match/non-match여야 한다" 정답 라벨
- **Spec E**: 범용성 원칙 + cross-name 대응 신호 설계 — Spec C가 열어준 "후속 신호가 NP를 override" 구조를 실제로 활용
