# Variant Merger 엔진화 디자인

**작성일**: 2026-04-08
**대상**: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/` 의 매칭/병합/squash 모듈군
**상태**: Draft (사용자 검토 대기)

---

## 1. 문제 정의

Figma `COMPONENT_SET`을 단일 컴포넌트로 병합할 때 매칭 엔진이 **"이 노드와 저 노드가 같은 노드인가"** 를 판단한다. 이 판단의 결함이 시각적 회귀로 나타난다.

86개 fixture에 대한 자동 감사 결과:

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

`disjoint variant set` 검출 audit을 회귀 테스트로 영구화한다. 매 PR마다:
- main + dependency 양쪽에서 매칭 → disjoint 검출 → 카운트 측정
- 74 → 0 또는 ≤5 (위치 prop 패턴 잔존이면 OK)

### 5.2 단위 + 브라우저 테스트

- 기존 1006개 단위 테스트 + 44개 브라우저 테스트 통과 (Tagreview Small variant 포함)
- Tagreview wrapper 보존을 명시적 회귀 케이스로 추가

### 5.3 신호 단위 테스트

각 신호는 독립 테스트 가능. 입력 두 노드 + context → 점수/veto/reason 검증.

---

## 6. 알려진 한계 / 미검증

1. **순서 의존성 잔존 가능성** — 누적 매칭의 BFS 순서가 시그널 엔진으로도 영향이 남을 수 있음. Phase 1 후 측정.
2. **시그널 가중치 튜닝** — 새로운 마법 숫자 위험. 단 모든 가중치는 한 곳(`MatchingPolicy`)에 모음.
3. **Tagreview wrapper 검출 메커니즘** — `WrapperRoleDistinction` 신호의 정확한 임계값은 Tagreview 케이스 + 다른 wrapper 케이스로 데이터 튜닝 필요.
4. **VariantPropPosition 신호** — variant prop ↔ position correlation 학습 방식이 결정적이지 않을 수 있음. 단순 휴리스틱(boolean prop + cx만 다름)으로 시작 후 보강.

---

## 7. 영향 받는 파일

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
