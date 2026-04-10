# Hungarian Matrix Observer 설계

**작성일**: 2026-04-10
**상태**: Draft (사용자 검토 대기)
**대상**: `test/audits/` + `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/`
**선행 작업**: **Spec A — `2026-04-10-variant-merger-engine-consolidation-design.md` 완료 후 착수**. 본 spec의 파일 경로는 Spec A 이후 구조(`processors/variant-merger/`)를 기준으로 기술됨.
**선행 문서**:
- `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` (엔진 설계 원본)
- `docs/superpowers/specs/2026-04-09-cross-name-matching-spec2-handoff.md` (핸드오프 노트)
- `docs/superpowers/specs/2026-04-10-variant-merger-engine-consolidation-design.md` (Spec A, 선행)

---

## 1. 배경과 문제

Variant Merger 엔진은 `MatchDecisionEngine`의 신호 합산 모델로 설계됐지만, 실제 구현은 여러 지점에서 이 모델에서 벗어나 있다:

1. **NP 단락(short-circuit)** — `NormalizedPosition`이 `decisive-match-with-cost`를 반환하면 이후 신호는 전부 생략된다. 신호 합산 모델의 의도와 다름.
2. **숨은 신호 의존 관계** — PSI는 Spec 1에서 제거됐지만, NP를 강등하면 다시 필요해지는 "숨은 disambiguator"였다. 신호들이 독립이 아니라 암묵적 짝으로 묶여 있음.
3. **Hungarian 전역 관찰 불가능** — 현재 `matchTrace` 도구는 "임의의 두 노드 한 쌍"에 대한 신호 분해만 출력한다. Hungarian이 실제로 본 cost matrix 전체, 경쟁했던 다른 pair, 최종 assignment, threshold 거부 등은 블랙박스.
4. **시뮬레이션과 실측 괴리** — 2026-04-09 ChildrenShape 시도에서 "시뮬레이션 31건 감소 예상 → 실측 회귀 149건 증가"의 원인을 사후 분석할 수 없었다.

이 문서들에서 공통으로 드러난 결론: **엔진 내부 동작을 전역적으로 관찰할 수 있는 도구가 없으면, 신호 변경은 추측 수준을 벗어나지 못한다.**

---

## 2. 목표

**한 문장**: fixture 하나를 입력받아 VariantMerger가 수행한 모든 Hungarian 매칭의 cost matrix, 신호별 분해, 최종 assignment, threshold 거부를 계층적으로 덤프하는 순수 관찰 도구를 만든다.

### 비-목표

- 엔진 동작 수정 (가중치 조정, 신호 추가/제거, threshold 변경)
- 자동 버그 탐지 (어떤 짝이 버그인지 도구가 판정하지 않음)
- 기존 `matchTrace` 대체 (matchTrace는 임의 pair 단일 분석 용도로 유지)
- Audit/anomaly 카운트 변경 (observer는 production 경로에 영향 없음)

---

## 3. 디자인 원칙

1. **Pure observation** — 도구가 활성화되든 안 되든 엔진 결과가 달라지면 안 됨. 기존 1000+ 테스트 전원 통과.
2. **Zero overhead by default** — `OBSERVE_FIXTURE` 환경 변수가 없으면 hook이 등록되지 않아 production 경로에 0 비용.
3. **Full visibility** — 현재 엔진이 내부에 가지고 있는 모든 정보(`signalResults` 배열의 모든 필드)를 출력에 노출. 새 정보를 만들지 않고 기존 정보를 드러내기.
4. **Hierarchical** — root variant pair부터 그 merge 결과의 children merge까지 재귀적으로 덤프. 한 fixture의 전체 매칭 흐름이 한 명령으로 보여야 함.
5. **Reviewable diff** — 같은 fixture를 엔진 변경 전후로 각각 덤프해서 텍스트 diff로 변화를 볼 수 있어야 함. 이게 "신호 변경의 영향"을 추적하는 유일한 방법.

---

## 4. 입력

```bash
OBSERVE_FIXTURE=<fixture-path> npm run audit:observe
```

### 필수

- `OBSERVE_FIXTURE` — fixture 경로 (예: `any/Controlcheckbox`, `failing/Buttonsolid`)

### 선택

- `OBSERVE_NODE=<nodeId>` — 해당 노드가 root/child/merged로 등장하는 매트릭스만 출력 (큰 fixture용 필터)
- `OBSERVE_DEPTH=<n>` — 특정 깊이까지만 드릴다운 (기본: 전체)
- `OBSERVE_FORMAT=text|json` — 출력 포맷 (기본: text)
- `OBSERVE_OUT=<path>` — 표준 출력 대신 파일로 저장 (diff 비교용)

---

## 5. 출력 형식

### 5.1 Text 모드 (기본)

```
=== Hungarian Observer: any/Controlcheckbox ===
Fixture: any/Controlcheckbox.json
Variant count: 24
Merge order (from VariantGraphBuilder BFS):
  [1] Size=Normal,State=Unchecked,Tight=False,Disable=False  ↔  Size=Normal,State=Checked,Tight=False,Disable=False
  [2] (merged) ↔ Size=Normal,State=Indeterminate,Tight=False,Disable=False
  [3] ...

═══════════════════════════════════════════════════════════════
Merge [2]: ROOT Controlcheckbox
Path: (root)
A children: 3  |  B children: 3
═══════════════════════════════════════════════════════════════

Pass 1 (definite ID/name match):
  ✓ Container (16215:34466) ↔ Container (16215:34471)  [same id]
  ✓ Background (16215:34467) ↔ Background (16215:34472)  [same id]

Pass 2 Hungarian cost matrix:

                    B0: Icon/Normal/Line Horizontal  B1: <unmatched B>
                    (INSTANCE, 16215:34471)
  ───────────────────────────────────────────────────────────────────
  A0: Icon/Normal/Check    0.087 ✓ (selected)          ―
  (INSTANCE, 16215:34466)

  Signal breakdown for A0↔B0:
    TypeCompatibility       match          -         both INSTANCE
    IdMatch                 neutral        -         different ids
    NormalizedPosition      match-w-cost   0.087     pos cx=0.5, cy=0.5 | rel 0.02
    RelativeSize            score s=0.98  -         relW=0.98 relH=0.99
    ParentShapeIdentity     neutral        -         no parent match available
    VariantPropPosition     neutral        -         state prop is non-boolean
    WrapperRoleDistinction  neutral        -         parent size comparable
    InstanceSpecialMatch    neutral        -         different main components

Assignment: A0→B0 (cost 0.087, threshold 0.1) ✓ ACCEPTED
Result: Icon/Normal/Check + Icon/Normal/Line Horizontal merged as one slot

  ↓ recurse into (A0+B0) children

─────────────────────────────────────────────────────────────
Merge [2.1]: INSIDE merged Icon slot
Path: Controlcheckbox > (merged icon)
A children: 2  |  B children: 2
─────────────────────────────────────────────────────────────

Pass 1: (none)

Pass 2 Hungarian cost matrix:

                    B0: Line (VECTOR)    B1: Normal (VECTOR)
  ───────────────────────────────────────────────────────────
  A0: Union              Inf ✗              0.04 ✓
  (BOOL_OP)
    Signal breakdown for A0↔B0:
      TypeCompatibility    VETO     Inf    BOOLEAN_OPERATION vs VECTOR
    Signal breakdown for A0↔B1:
      TypeCompatibility    neutral  -      mixed but allowed
      NormalizedPosition   match-w-cost 0.04  pos near-identical
      ...

  A1: Normal             0.23 ✗             0.09 ✓
  (VECTOR)
    ...

Assignment: A0→B1 (0.04 ✓), A1→B0 (0.23 ✗ REJECTED above threshold 0.1)
Result: Union↔Normal merged, A1 Normal and B0 Line left as separate siblings

═══════════════════════════════════════════════════════════════
Merge [3]: ...
═══════════════════════════════════════════════════════════════

...

=== Summary ===
Total merges: 46
  - Pass 1 definite matches: 89
  - Pass 2 Hungarian accepted: 127
  - Pass 2 Hungarian rejected (threshold): 14
  - Veto cells (Type/Wrapper): 203
Signals that contributed at least once: NP (127), RelSize (88), Type veto (203)
Signals that never fired: VariantPropPosition (0), ParentShapeIdentity (0)
```

### 5.2 JSON 모드

기계가 읽을 수 있는 구조화된 출력. 형태는 대략:

```json
{
  "fixture": "any/Controlcheckbox",
  "mergeOrder": [...],
  "merges": [
    {
      "index": "2",
      "path": "(root)",
      "variantA": "Size=Normal,State=Unchecked,...",
      "variantB": "Size=Normal,State=Indeterminate,...",
      "pass1": [
        { "a": { "id": "16215:34466", "name": "Container" }, "b": {...}, "reason": "same id" }
      ],
      "pass2": {
        "matrix": [
          [{ "cost": 0.087, "selected": true, "accepted": true, "signals": [...] }]
        ],
        "assignment": [[0, 0]],
        "rejectedCells": []
      }
    }
  ],
  "summary": {
    "signalStats": { "NormalizedPosition": 127, "VariantPropPosition": 0, ... }
  }
}
```

용도: 여러 fixture 집계, 정규 표현 검색, 스크립트 기반 통계.

---

## 6. 통합 지점

### 6.1 캡처 위치 (Spec A 완료 후 경로 기준)

- **`processors/variant-merger/VariantMerger.ts`의 `mergeChildren()`** — Pass 1/2 로직이 이 함수에 있음. observer hook을 이 함수의 진입/종료 및 각 pass 직후에 배치.
- **`processors/variant-merger/match-engine/MatchDecisionEngine.ts`의 `decide()`** — 이미 `signalResults`를 포함하는 `MatchDecision`을 반환. observer는 이 반환값을 그대로 수집하면 됨. **엔진 코드 변경 불필요**.

### 6.2 활성화 메커니즘

기존 `matchTrace`가 사용하는 `globalThis.__MATCH_REASON_LOG__` 패턴을 확장:

- 신규 전역: `globalThis.__HUNGARIAN_OBSERVER__`
- `undefined`이면 hook 비활성 (prod 경로 무영향)
- 객체가 세팅돼 있으면 `VariantMerger.mergeChildren()`가 각 단계에서 해당 객체에 데이터를 누적
- 테스트 종료 시 수집된 데이터를 포맷해 출력

이 패턴은 현재 `NodeMatcher`에서 이미 사용 중이므로 검증된 방식.

### 6.3 신규 파일

- `test/audits/hungarianObserver.test.ts` — vitest entry point (기존 `matchTrace.test.ts`와 병렬)
- `test/audits/hungarianObserver/formatter.ts` — text/JSON 출력 포맷터
- `test/audits/hungarianObserver/types.ts` — 수집 데이터 타입 정의

### 6.4 수정 파일 (최소)

- `processors/variant-merger/VariantMerger.ts` — `mergeChildren` 시작/Pass 1 직후/Pass 2 cost matrix 구성 후/각 Hungarian 결정 후에 `__HUNGARIAN_OBSERVER__`가 있으면 push. 기존 동작 무변화.
- `package.json` — `audit:observe` npm script 추가

---

## 7. 디버깅 패턴 (도구 사용 예)

관찰 도구는 도구일 뿐이고, 실제 디버깅은 사람이 한다. 다음 5가지 패턴을 문서화해 다음 세션부터 사용 가능하게 한다.

### 패턴 1 — 개별 이상 짝 분해

"이 짝이 왜 합쳐졌지?" → 해당 merge의 signal breakdown을 봐서 **어떤 신호가 점수를 줬는지** 특정. 대안 검토.

### 패턴 2 — 엔진 변경 전후 diff

엔진 고치기 전 `before.txt` 덤프 → 고친 후 `after.txt` → `diff` → 어떤 짝의 점수/결정이 바뀌었는지 전부 확인. 시뮬레이션과 실측 괴리 방지.

### 패턴 3 — 죽은 신호 탐지

여러 fixture에 observer 실행 → summary 섹션에서 "never fired" 신호 확인. 예: PSI가 어느 fixture에서도 neutral 외의 결과를 안 냈다면 죽은 신호 (Spec 1의 PSI가 정확히 이 경우였음).

### 패턴 4 — 단락 영향 측정

NP가 `decisive-match-with-cost`로 단락한 횟수 vs 다른 신호가 기여했다면 결정이 바뀌었을 횟수를 카운트. "만약 NP 단락을 강등하면 몇 개 짝이 영향받는지" 사전 추정.

### 패턴 5 — Threshold 거부 경계 분석

cost가 threshold 0.1 근처(0.08~0.12)에서 거부/수용된 짝 목록 → threshold 조정 시 영향 예측. 현재는 threshold가 blind 상수인데 이 데이터 없이는 튜닝 불가능.

---

## 8. 성공 기준

1. **엔진 동작 무변화**: observer 없이 실행한 기존 테스트(단위 + 브라우저) 100% 통과. observer 활성 상태에서 실행한 결과도 같음.
2. **Controlcheckbox 관찰**: 한 번 실행으로 icon swap merge(Check↔Line Horizontal)의 신호 분해가 출력됨. "왜 이 legit merge가 성립하는지" 한눈에 파악 가능.
3. **Buttonsolid 관찰**: 23건의 cross-name 중 Interaction↔Wrapper 짝이 Hungarian 어느 assignment에서 나왔는지 바로 찾을 수 있음.
4. **Diff 재현**: 2026-04-09 ChildrenShape 시도를 재현해서 before/after 덤프 후 diff로 Controlcheckbox 0→17 회귀의 원인을 **짝 단위로** 추적 가능.
5. **Summary 유용성**: 5~10개 fixture의 summary를 비교해서 "자주 결정적이던 신호", "거의 안 쓰이는 신호"가 드러나 § 패턴 3, 4의 분석 가능.

---

## 9. 알려진 한계 / 미결 사항

1. **큰 fixture 출력 크기** — Buttonsolid(24 variants × 수십 children)는 text 모드가 수천 줄일 수 있음. `OBSERVE_NODE` 필터의 실효성을 실측 후 결정.
2. **Merge 순서 표현** — `VariantGraphBuilder`가 결정한 BFS 순서를 merge index로 표시. 이 순서 자체가 결과에 영향을 주는지는 본 엔진 작업의 다음 단계 (§4 신호 독립성 복원)에서 다룸.
3. **재귀 merge 표현** — merge 결과의 children이 다시 merge되는 중첩 흐름을 text 표현에서 얼마나 들여쓸지. 초기에는 구분선 + path 표시로 충분할 것으로 예상.
4. **TypeCompatibility의 Shape group** — Shape vs Container 그룹 처리가 `TypeCompatibility` 안에 있어서 "왜 veto됐는지" reason만으로 완전 설명이 되는지 검증 필요. 안 되면 reason 문자열 강화.
5. **Post-merge ID 수렴 문제** — 기존 `matchTrace` 주석에서 경고하는 문제(병합 후 같은 InternalNode로 수렴 → IdMatch 즉시 accept). observer는 production merge 경로를 그대로 타므로 이 문제는 재현되지 않음 — 매 `mergeChildren` 호출 시점의 **현재 childrenA/childrenB**를 캡처하기 때문.

---

## 10. 범위 밖 (후속 작업)

이 설계는 **관찰 도구만** 만든다. 다음 작업은 별도 spec/plan에서 다룬다:

- **신호 독립성 복원** — NP 단락 제거, 각 신호가 설계대로 합산되도록 (본 spec이 만든 도구 기반으로 안전하게 수행)
- **페어 단언 인프라** — "이 노드와 이 노드는 match/non-match여야 한다" 정답 라벨 데이터베이스 (§5.5 엔진 디자인 원본 참조)
- **범용성 원칙 정의** — 신호가 ad-hoc이 아니라 원칙에서 도출되어야 한다는 메타 규칙 문서

위 3개는 모두 본 도구가 먼저 있어야 안전/측정 가능해진다.

---

## 11. 영향 받는 파일 (Spec A 완료 후 경로 기준)

- **신규**:
  - `test/audits/hungarianObserver.test.ts`
  - `test/audits/hungarianObserver/formatter.ts`
  - `test/audits/hungarianObserver/types.ts`
- **수정 (최소)**:
  - `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger.ts` — observer hook 4~5개 지점 추가 (`__HUNGARIAN_OBSERVER__` 존재 시만 동작)
  - `package.json` — `audit:observe` npm script

- **변경 없음**:
  - `MatchDecisionEngine`, `MatchSignal`, 모든 signal 파일
  - `NodeMatcher`, `LayoutNormalizer`, `VariantSquasher`, `VariantGraphBuilder`
  - 기존 `matchTrace.test.ts`
