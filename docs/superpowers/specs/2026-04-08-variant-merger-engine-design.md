# Variant Merger 엔진화 디자인

**작성일**: 2026-04-08
**최근 수정**: 2026-04-08 (Phase 0 추가, 견고성 전략 반영)
**대상**: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/` 의 매칭/병합/squash 모듈군
**상태**: Draft (사용자 검토 대기)

---

## 1. 문제 정의

Figma `COMPONENT_SET`을 단일 컴포넌트로 병합할 때 매칭 엔진이 **"이 노드와 저 노드가 같은 노드인가"** 를 판단한다. 이 판단의 결함이 시각적 회귀로 나타난다.

86개 fixture에 대한 자동 감사 결과 (**주의**: 실제 리포에는 현재 84개 JSON fixture가 존재. 86이라는 숫자는 원본 audit 기준이며 Phase 0에서 재검증 필요):

| 지표 | 값 |
|---|---|
| 회귀 후보 (variant 집합 disjoint한 같은 부모 안 형제) | **74건** (main 57 + dependency 17) |
| isSimilarSize 검증 비활성화 시 해결률 | **87.8%** (74→9) |
| 남은 9건의 패턴 | **단일 패턴** — variant prop이 자식 위치를 결정 |
| isSimilarSize 비활성화로 새로 발생하는 회귀 | **1 fixture** (Tagreview Small wrapper) |
| 별도 회귀 (매칭과 무관) | Buttonbutton iconOnly (props 추출 단계) |

### 1.1 데이터로 입증된 회귀 패턴 6가지

추적으로 확인한 매칭 실패의 진짜 원인:

1. **Size variant 자식의 절대 크기 비율 거부 (회귀의 80%+)** — `isSimilarSize`가 width/height 비율 1.3 임계값을 사용. Size=Small과 Size=Large 사이의 같은 노드(예: Mono Color, icon_arrow 내부 vector, Chip star)가 비율 1.5로 거부됨. 정규화 위치는 완벽히 일치 (`compare = 0.0000`).
2. **Variant prop이 위치를 결정하는 노드 (남은 9건)** — Switch Knob, Toggle content, Plus(Left/Right Icon) 등 boolean variant에 따라 좌↔우로 이동. 정규화 위치 cx 0.16↔0.84 또는 0.31↔0.69. 위치 비교만으로는 풀 수 없음.
3. **Padding 차이로 부모와 자식 비율이 어긋남** — Mono shape 부모는 1.33배 확장, 자식 Color는 1.5배. padding 때문에 부모는 덜 늘어남. 같은 노드인데 단순 부모 비율 매칭은 실패.
4. **Wrapper 분리 보존 의존** (Tagreview Small) — Frame 2 wrapper는 Small variant에만 존재. baseline에서는 isSimilarSize가 매칭을 거부 → wrapper가 분리 → squash가 prune → `flex-direction: row + gap: 4px`가 layoutOverrides로 부모에 전달. **isSimilarSize의 매칭 거부가 squash 흐름의 입력을 결정한다.**
5. **Dependency component 내부 매칭 누락** — 이전 audit이 main만 봤는데 dependency 그룹의 syntheticComponentSet 매칭에서 17건 회귀 추가 발견.
6. **Buttonbutton iconOnly cva 누락** — 매칭이 아닌 sub-component props 추출 단계의 일관성 문제. 이 디자인 범위 밖.

### 1.2 핵심 인사이트

> **`isSimilarSize`는 단순한 검증 함수가 아니다.**
> 그 결정 하나가 다음 4단계의 흐름을 형성한다:
> 1. **매칭** — 같은가 다른가 판정
> 2. **분리/합침** — 다르면 같은 부모 아래 별개 자식으로 보존
> 3. **Squash** — 분리된 자식들 중 일부가 cross-depth squash에서 다른 처리를 받음
> 4. **Layout overrides** — squash가 wrapper를 prune하면서 그 wrapper의 레이아웃을 부모로 전달
>
> **그래서 매칭 단계만 고치면 후속 단계가 깨진다.** Tagreview가 정확히 그 사례.

---

## 2. 디자인 목표

(견고함의 4가지 정의: 사용자 합의)

1. **테스트 견고함** — 74건 회귀 후보 ≥ 90% 해결, 새 fixture 추가 시 회복력
2. **결정론적 견고함** — 같은 입력 → 같은 출력. 순서 의존성 제거. 매칭 결정 근거가 추적 가능
3. **확장 가능한 견고함** — 새 엣지 케이스가 if-else가 아니라 신호 모듈 추가로 처리
4. **알고리즘적 견고함** — 매칭과 squash가 같은 결정 모델을 사용 (현재는 분리)

---

## 3. 새 아키텍처: Match Decision Engine

### 3.1 핵심 모델

매칭 결정을 **신호(signal) 합산**으로 표현한다. 각 신호는 두 노드 사이의 한 측면을 점수로 평가한다.

```
matchScore(A, B) = Σ signal_i(A, B, context) × weight_i
matchDecision(A, B) = matchScore(A, B) ≥ threshold
                    AND no signal returns "veto"
```

- **score**: 0~1 (1=완전 일치, 0=완전 불일치, Infinity=veto)
- **veto**: 결정적 거부 (예: type 호환성 실패는 veto)
- **reason**: 각 신호는 결정 근거 문자열 반환 → 디버깅/진단에 사용

### 3.2 신호 카탈로그 (7개)

데이터 검증으로 결정된 필요 신호 목록.

| 신호 | 역할 | 처리하는 패턴 |
|---|---|---|
| **TypeCompatibility** | Shape/Container 그룹, type 일치 검사. 실패 시 veto | 기본 |
| **IdMatch** | 같은 ID → 결정적 매칭 (확정 매칭) | Pass 1 (현재와 동일) |
| **NormalizedPosition** | LayoutNormalizer.compare ≤ 0.1 → score 1, 그 외 비례 감점 | 기본 위치 매칭 |
| **RelativeSize** | LayoutNormalizer의 relWidth/relHeight 차이로 평가. 동심원 false positive 잡음 | 패턴 1 (Size variant 정상화) |
| **ParentShapeIdentity** | 두 노드의 직접 부모가 같은 dependency component, 같은 이름, 같은 type → 점수 상향 | 패턴 1, 5 (Mono Color, icon_arrow 내부) |
| **VariantPropPosition** | 두 노드의 variant 집합이 disjoint이고 차이나는 prop이 boolean이며, 자식 cx만 다르면 → 점수 상향 ("위치가 prop으로 결정됨") | 패턴 2 (Switch Knob, Toggle, Plus) |
| **WrapperRoleDistinction** | 두 노드의 부모 variant root 크기가 거의 같은데 자식 크기/구조가 다름 → veto ("같은 부모 안 다른 역할") | 패턴 4 (Tagreview wrapper 보존) |

### 3.3 무엇을 폐기하는가

- `isSimilarSize` 절대 비율 1.3 임계값 → 폐기. 대신 `RelativeSize` + `WrapperRoleDistinction` 두 신호로 분리
- `getPositionCost` 안의 hard-coded shift, overflow penalty 등 → 신호 모듈로 추출
- `isSameNode` / `getPositionCost` / `isDefiniteMatch` 3 함수 분리 → 단일 `matchDecision`으로 통합

### 3.4 무엇을 폐기하지 않는가

- LayoutNormalizer (검증 통과)
- Hungarian algorithm (children 매칭의 글로벌 최적화는 그대로)
- VariantGraphBuilder (1-prop 차이 그래프 + BFS 순서 결정 — 결정론을 위해 유지하되, 시그널 엔진 도입 후 순서 의존성이 거의 사라지므로 후속 검증)
- UpdateSquashByIou의 cross-depth squash 흐름 (input은 같은 신호로 통일)

### 3.5 매칭 ↔ Squash 통합

현재: 매칭은 NodeMatcher, squash는 UpdateSquashByIou에 isSimilarSizeForSquash라는 별도 검증.

새 디자인: 두 단계가 같은 `MatchDecisionEngine` 인스턴스를 공유. squash의 cross-depth 결정도 같은 신호 합산을 사용. 결과적으로 "왜 이 노드는 매칭에서 분리되었는데 squash에서 합쳐졌나" 같은 모순이 사라짐.

---

## 4. 단계별 구현 계획

### Phase 0 — 회귀 측정 + 스냅샷 하네스 (엔진 작업 선행 조건)

엔진을 고치기 전에 **회귀를 객관적으로 측정할 수 있는 도구**가 먼저 필요하다. 현재 audit 결과는 문서에만 존재하고 스크립트가 리포에 없어서 재현 불가능하고, 스냅샷이 없어서 "의도하지 않은 부작용"을 감지할 수 없다. Phase 0가 없으면 이후 모든 Phase의 성과 주장을 검증할 근거가 없다.

1. **Audit 스크립트 복원/작성** — `scripts/audit-variant-matching.ts` (또는 동급 위치)
   - 84개 fixture 순회, VariantMerger로 병합 실행
   - 검출 기준: "같은 부모 아래 disjoint variant set을 가진 형제 쌍"
   - 출력: fixture별 회귀 후보 count, 패턴 분류 (§1.1의 6가지), 전체 요약
   - 커밋되어야 함 (일회성 금지)

2. **스냅샷 하네스 구축** — vitest 내장 snapshot 기능 활용
   - 스냅샷 대상: **InternalTree (VariantMerger 직후) + UITree (후처리 후)** 두 층
   - 매칭 변경이 InternalTree에만 나타나면 "매칭 국소 변경", UITree까지 번지면 "후처리 영향"을 즉시 구별
   - 위치: `test/fixtures/**/__snapshots__/*.snap`
   - `expect(tree).toMatchSnapshot()` 패턴

3. **초기 스냅샷 고정 (부트스트랩)**
   - **정답 라벨 부재 문제**: 현재 출력이 "정답"이 아님 (회귀 후보가 이미 박혀 있음)
   - 해결 전략: audit 결과를 활용해 **"회귀 없음" fixture만 먼저 고정**, 나머지는 "회귀 있음" 마킹
   - 엔진 작업 중 "회귀 있음" fixture가 고쳐지면 해당 fixture의 스냅샷을 수동 승인으로 업데이트
   - 목표: Phase 3 종료 시점에 전체 84개 fixture 스냅샷이 **검토 완료된 정답** 상태

4. **Diff 리뷰 도구**
   - `git diff`로 JSON 스냅샷 비교는 읽기 어려움
   - 최소 요구: 변경 노드 ID + 변경 유형 (add/remove/match change) 요약
   - `npm run snapshot:review` 또는 동급 명령으로 접근 가능해야 함

5. **정답 라벨링: 혼합 전략 (스냅샷 + 페어 단언)**
   - **기본**: 스냅샷으로 전체 회귀 감지 (양적 안전망)
   - **핵심 패턴**: Switch Knob, Toggle, Plus, Tagreview wrapper 등 §1.1의 6개 패턴 대표 케이스에 대해 **명시적 페어 단언** 추가
     - 형식 예: `{ fixture: "switch.json", pairs: [{ variantA: "704:56", variantB: "704:29", shouldMatch: true }] }`
     - 신호 단위로 "어느 신호가 이 단언을 만족시키는 데 기여했는가"를 추적 가능하게
   - 페어 단언은 새 신호 추가 시 **TDD**로 활용: 단언 작성 → 신호 구현 → 단언 통과 확인

6. **검증**: audit 스크립트 실행 결과가 디자인 문서 §1의 74건(main 57 + dependency 17)과 일치하는지 확인. 불일치 시 §1 숫자를 갱신하고 패턴 재분류.

### Phase 1 — 신호 엔진 골격 + 핵심 신호 4개 (회귀 80%+ 해결)

1. `MatchSignal` 인터페이스 정의 (score / veto / reason)
2. `MatchDecisionEngine` 클래스 — 신호 등록, 합산, 결정
3. 신호 구현: `TypeCompatibility`, `IdMatch`, `NormalizedPosition`, `RelativeSize`
4. NodeMatcher의 `isSameNode` / `getPositionCost`를 엔진 호출로 위임 (기존 동작과 호환)
5. **검증**: 회귀 74건 중 isSimilarSize OFF가 풀어주는 65건이 같이 풀리는지 확인. Tagreview는 아직 깨지는 게 정상 (Phase 2에서 처리).

### Phase 2 — 패턴 처리 신호 (회귀 마무리 + Tagreview 보존)

1. 신호 추가: `ParentShapeIdentity`, `WrapperRoleDistinction`, `VariantPropPosition`
2. **검증**: 74건 회귀 ≥ 90% 해결 + Tagreview Small wrapper 보존 (단위 + 브라우저 테스트)
3. UpdateSquashByIou의 isSimilarSizeForSquash를 같은 엔진 호출로 위임

### Phase 3 — 정리 / 회귀 안전망

1. 기존 NodeMatcher의 hard-coded threshold/penalty 제거
2. 디버그 출력: 매칭 결정 근거 로그 (`reason` 누적)
3. 회귀 fixture 전체 재실행 + browser test

### 범위 밖 (별도 작업)

- **Buttonbutton iconOnly** — props 추출/연결 단계 회귀. 별도 추적 필요.
- **N-way Hungarian** — 검증으로 불필요 확인 (Buttonbutton N>2는 isSimilarSize 누적이었음).
- **VariantGraphBuilder 순서 의존성** — Phase 1~3 후 회귀 측정 후 결정.

---

## 5. 검증 전략

### 5.1 데이터 기반 회귀 측정

Phase 0에서 작성한 audit 스크립트를 **CI 회귀 테스트로 영구화**한다. 매 PR마다:
- main + dependency 양쪽에서 매칭 → disjoint 검출 → 카운트 측정
- 74 → 0 또는 ≤5 (위치 prop 패턴 잔존이면 OK)
- **증가가 감지되면 CI 실패**

### 5.2 단위 + 브라우저 테스트

- 기존 1006개 단위 테스트 + 44개 브라우저 테스트 통과 (Tagreview Small variant 포함)
- Tagreview wrapper 보존을 명시적 회귀 케이스로 추가

### 5.3 신호 단위 테스트

각 신호는 독립 테스트 가능. 입력 두 노드 + context → 점수/veto/reason 검증. 모든 신호는 Phase 0에서 정의한 **페어 단언**을 TDD 형태로 먼저 작성한 뒤 구현한다.

### 5.4 스냅샷 하네스

Phase 0에서 구축한 InternalTree + UITree 스냅샷으로 **의도하지 않은 부작용**을 감지한다. audit 카운트만으로는 "회귀가 줄었는지"는 알 수 있어도 "다른 곳이 깨졌는지"는 못 잡는다. 두 층의 역할:

- **InternalTree 스냅샷**: 매칭 결정 결과를 직접 반영. 엔진 변경의 국소 영향 검증
- **UITree 스냅샷**: 후처리까지 거친 결과. 매칭 변경이 UI 최종 구조에 미치는 파급 검증

### 5.5 정답 라벨링 루프

새 회귀 케이스가 발견되면 다음 루프를 돈다:

1. fixture 추가 + 기대 페어 단언 작성 (사용자가 "어느 노드가 같은 노드여야 하는지" 명시)
2. 하네스 실행 → 현재 엔진이 단언을 만족하는지 측정
3. 실패 시 trace 로그(`reason` 누적)로 어느 신호가 잘못 판단했는지 특정
4. 해당 신호 수정 또는 새 신호 추가
5. 단언 통과 + 전체 스냅샷 회귀 없음 확인 → 병합

이 루프가 엔진 견고성의 **유일한** 메커니즘이다. 루프가 돌아가지 않으면 신호를 몇 개 추가하든 엔진은 계속 새는 배가 된다.

---

## 6. 알려진 한계 / 미검증

1. **순서 의존성 잔존 가능성** — 누적 매칭의 BFS 순서가 시그널 엔진으로도 영향이 남을 수 있음. Phase 1 후 측정.
2. **시그널 가중치 튜닝** — 새로운 마법 숫자 위험. 단 모든 가중치는 한 곳(`MatchingPolicy`)에 모음.
3. **Tagreview wrapper 검출 메커니즘** — `WrapperRoleDistinction` 신호의 정확한 임계값은 Tagreview 케이스 + 다른 wrapper 케이스로 데이터 튜닝 필요.
4. **VariantPropPosition 신호** — variant prop ↔ position correlation 학습 방식이 결정적이지 않을 수 있음. 단순 휴리스틱(boolean prop + cx만 다름)으로 시작 후 보강.
5. **부트스트랩 스냅샷의 숨은 회귀** — Phase 0에서 "회귀 없음"으로 분류되어 스냅샷이 고정된 fixture에도 audit이 잡지 못한 매칭 회귀가 숨어 있을 수 있음. 엔진 작업 중 해당 스냅샷이 변경되면 "의도된 개선"인지 "부작용"인지 사용자 건별 판단 필요.
6. **Audit 숫자 불일치** — 디자인 §1의 74건(86 fixture 기준)과 실제 리포의 84 fixture 재측정 결과가 다를 수 있음. Phase 0 검증 단계에서 §1 숫자를 재확정.

---

## 7. 영향 받는 파일

**Phase 0 (선행):**
- 신규: `scripts/audit-variant-matching.ts` — disjoint variant set 회귀 audit
- 신규: `scripts/snapshot-review.ts` 또는 동급 — JSON 스냅샷 diff 리뷰 도구
- 신규: `test/fixtures/**/__snapshots__/*.snap` — InternalTree + UITree 스냅샷
- 신규: `test/fixtures/match-pair-assertions.ts` (또는 fixture별 sidecar) — 핵심 패턴 페어 단언
- 변경: `package.json` — `audit`, `snapshot:review` 등 npm script 추가

**Phase 1~3 (엔진 본체):**
- `processors/NodeMatcher.ts` — 핵심 변경. 엔진 호출로 위임
- `processors/UpdateSquashByIou.ts` — `isSimilarSizeForSquash` 제거, 엔진 호출
- `processors/VariantMerger.ts` — 매칭 호출부 일관화
- `processors/LayoutNormalizer.ts` — 변경 없음 (그대로 사용)
- 신규: `processors/match-engine/MatchDecisionEngine.ts`
- 신규: `processors/match-engine/signals/*.ts` (7개 신호)
- 신규: `processors/match-engine/MatchingPolicy.ts` (가중치/임계값)

---

## 8. 미결 사항

- 신호별 가중치/임계값의 초깃값
- `MatchSignal` 인터페이스의 score 정의 정확성 (0~1 vs cost 형태)
- 디버그 로그 출력 형식
