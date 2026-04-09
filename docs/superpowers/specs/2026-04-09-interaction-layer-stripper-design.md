# Interaction Layer Stripper 디자인

**작성일**: 2026-04-09
**대상**: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/`
**상태**: Draft (사용자 검토 대기)

---

## 1. 문제 정의

Figma 디자인 시스템에서 자주 쓰이는 **State Layer 패턴**(Material Design 영향)이 코드 생성 결과에 그대로 흘러나와 출력 코드를 불필요하게 어지럽힌다.

### 1.1 패턴

디자이너는 컴포넌트 상단에 별도의 `Interaction` frame을 두고 그 안에 공유 인터랙션 컴포넌트(예: `Interaction/Normal`, `Interaction/Strong`, `Decorate/Interactive`)의 INSTANCE를 1개 배치한다. 이 frame은 컴포넌트 전체 영역을 덮는 invisible overlay이며, 디자이너의 의도는:

- "여기는 인터랙티브한 영역이다"라는 메타데이터 표현
- hover/press/focus 상태에서 색이 바뀌는 효과의 정의 위치
- 디자인 시스템 전반에서 일관된 상태 효과를 공유 컴포넌트로 참조

피그마 데이터 조사 결과 (85 fixtures, 124 Interaction frames):
- 모두 `name === "Interaction"`, `type === "FRAME"`
- 모두 부모의 ≥95% 영역 커버
- children 수: 0개(23) 또는 1개(101). 2개 이상 없음
- 자식이 있을 때 99건은 INSTANCE, 2건은 FRAME(중첩 Interaction 케이스)
- 자주 쓰이는 컴포넌트 7개 set: `Interaction/Normal`, `Interaction/Strong`, `Interaction/Light`, `Decorate/Interactive` 등 — 모두 description에 "인터랙션을 나타낼 때 사용" 명시

### 1.2 현재 동작이 만드는 결과

`failing/Buttonsolid` fixture에서 관찰:

- `Interaction` frame이 일반 노드처럼 트리에 존재
- VariantMerger가 다른 variant의 노드들과 잘못 매칭하여 Interaction subtree에 `Loading`/`Mask`/`Content` 자식이 잘못 들어감 (원본 Figma에는 INSTANCE 1개만 있음)
- 결과 코드:
  - `Interaction` 자체가 일반 `<div>`로 렌더링됨 (불필요)
  - `Loading`/`Mask`/`Content`가 Interaction 안에 또 한 번 렌더링되어 Wrapper 안의 정상 렌더링과 중복
  - `iconOnly` 슬롯이 4곳, `Mask` 3곳, loading-related 요소가 4곳에 흩어짐

이 메타데이터 노드를 제거하면 코드의 70~80% 중복이 제거되고, 동시에 merger가 이 노드 안에 잘못 합쳐놓은 자식들도 자연스럽게 사라진다.

---

## 2. 디자인 목표

1. **정확한 분리** — Interaction 패턴(메타데이터)을 일반 컨텐츠 노드에서 식별해서 트리에서 제거
2. **디자이너 의도 반영** — Interaction 안에 정의된 색·효과 정보를 부모 노드의 hover/active/focus 스타일로 흡수
3. **분리 원칙 유지** — 코드 에미터는 새 패턴을 모르고 기존 pseudo-class 처리 로직을 그대로 사용
4. **YAGNI** — 현재 데이터에 존재하는 패턴만 처리. 추측 기반 일반화 금지
5. **부수 효과로 merger 버그 해소** — Interaction subtree 제거가 잘못 합쳐진 자식들도 함께 제거

---

## 3. 아키텍처

### 3.1 새 모듈 위치

`src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`

기존 processor 디렉토리 안. 다른 processor와 동일한 인터페이스(생성자에 DataManager 받음, `process(tree)` 메서드).

### 3.2 파이프라인 위치

`TreeBuilder.build()` 안 Phase 1 (구조 확정 단계)에서, **VariantMerger 직후, PropsExtractor 이전**에 실행.

근거:
- VariantMerger 결과의 InternalTree에서 작업 → 모든 variant의 Interaction이 통합된 상태
- PropsExtractor 이전에 실행 → Interaction 노드가 prop 추출에 영향 안 줌
- StyleProcessor 이전이지만 styles 구조에 직접 작성 가능 (기존 dynamic styles 슬롯 사용)

### 3.3 데이터 흐름

```
[VariantMerger 직후]
  COMPONENT "Button"
    Interaction (FRAME, 1 child INSTANCE → componentSetId X)   ← strip 대상
    Wrapper (FRAME, 자식 정상)

[InteractionLayerStripper 실행 후]
  COMPONENT "Button"
    + .styles에 :hover/:active 추가됨 (Interaction에서 추출)
    Wrapper (FRAME, 그대로)
```

`Interaction` 노드는 트리에서 사라지고, 그 부모 (`COMPONENT "Button"`)의 기존 styles 구조에 pseudo-class entry가 추가됨.

---

## 4. 감지 규칙

다음 두 조건을 **모두** 만족해야 stripping 대상:

```
node.name === "Interaction"   (case-sensitive, exact match)
node.type === "FRAME"
```

추가 검증 (안전장치 — 모두 데이터 조사로 확인됨):

- `node.children.length <= 1` — 1개 초과 케이스 fixture에 0건. 만약 발견되면 strip 안 하고 경고 로그
- 자식이 있으면 `INSTANCE` 또는 `FRAME` (중첩 Interaction 케이스)
- 부모 영역 ≥95% 커버 (선택적 검증)

### 4.1 재귀 strip

중첩 Interaction (`Avatar` 케이스 — `Interaction(FRAME) → Interaction(FRAME) → Interaction(INSTANCE)`)도 한 번에 처리.

방식: 트리를 post-order 순회하며 매칭되는 노드를 부모의 children에서 제거. 자식이 먼저 제거되므로 외곽 Interaction의 자식 INSTANCE는 항상 leaf 상태에서 만남.

### 4.2 confidence 시그널 (참고용, strip 결정에는 미사용)

조사한 모든 케이스가 단순 name 매칭으로 잡히지만, 향후 다른 디자인 시스템 지원을 위해 다음 정보를 reason 로그에 기록:

- 자식 INSTANCE의 componentSet name이 `Interaction/*` 또는 `Decorate/Interactive*`로 시작하는가
- 부모 영역 커버율
- 중첩 깊이

이 정보는 디버그 출력에만 쓰이고 strip 결정에는 영향 없음.

---

## 5. 스타일 추출 및 부모 병합

### 5.1 추출 대상

Interaction frame의 자식 INSTANCE가 참조하는 컴포넌트(또는 컴포넌트 set)의 variants를 읽는다.

DataManager 경유로 다음을 가져옴:
- `componentSetId` 의 모든 variants (예: `State=Normal`, `State=Pressed`, `State=Hover` 등)
- 각 variant의 fills, opacity, blendMode 등 시각 속성

### 5.2 State 매핑

기존 코드베이스가 이미 가지고 있는 State→pseudo-class 매핑 로직(`State` prop을 `:hover` 등으로 변환하는 로직)을 재사용한다.

| Figma State value | CSS pseudo-class |
|---|---|
| `Normal` | (default, no pseudo) |
| `Hover` | `:hover` |
| `Pressed` | `:active` |
| `Focused` | `:focus` |
| `Disabled` | `:disabled` |

매핑은 case-insensitive. 알 수 없는 State 값은 무시(reason 로그에 기록).

### 5.3 부모 병합

추출된 스타일은 **부모 InternalNode의 기존 styles 구조에 직접 작성**한다. 별도 metadata 필드를 만들지 않는다.

병합 규칙:
- 부모에 이미 같은 pseudo-class entry가 있으면 **덮어쓰지 않고 병합** (예: 기존 `:hover { background: red }` + Interaction `:hover { opacity: 0.08 }` → `:hover { background: red; opacity: 0.08 }`)
- 동일 속성이 충돌하면 기존 값 우선 (디자이너가 부모에 직접 작성한 게 더 명시적)
- 추출 결과가 비어있으면 (예: `State=Normal` 외 variant가 없음) 그냥 노드만 제거하고 스타일 작성 없음

### 5.4 출력 형태

부모 노드의 styles 구조에 들어가는 결과의 의미는 다음 CSS와 동등:

```css
button {
  position: relative;
}
button::after {
  content: '';
  position: absolute;
  inset: 0;
  background: <Interaction Normal color>;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}
button:hover::after { opacity: <hover opacity from State=Hover variant or 0> }
button:active::after { opacity: <pressed opacity from State=Pressed variant or 0> }
```

단, 위 코드는 실제 출력 형태 예시일 뿐. 실제 emission은 코드 에미터의 기존 dynamic styles + pseudo-class 처리 로직에 위임. **stripper는 데이터를 적절한 위치에 작성하기만 한다.**

---

## 6. Strip 동작

### 6.1 노드 제거

매칭된 Interaction 노드는 부모 InternalNode의 `children` 배열에서 제거. 이때:

- 노드의 모든 후손도 함께 제거 (subtree 통째)
- VariantMerger가 잘못 연결한 자식 노드들(`Loading`/`Mask`/`Content` 등이 Interaction에 잘못 들어간 경우)도 함께 사라짐 — **이것이 의도된 부수 효과**
- 부모 노드의 `mergedNodes` 등 다른 메타데이터는 변경 안 함

### 6.2 빈 Interaction frame 처리

children이 0개인 23건의 Interaction frame은 색 정보 없이 그냥 제거. styles 작성 없음. (Figma의 prototyping `interactions` 필드는 코드 생성에 의미 없음.)

---

## 7. 검증 전략

### 7.1 단위 테스트

`test/tree-builder/InteractionLayerStripper.test.ts`:

- 합성 트리 입력: Interaction frame 1개 → strip + 부모 styles 검증
- 합성 트리 입력: Interaction frame 0 children → strip만 검증
- 합성 트리 입력: 중첩 Interaction → 둘 다 사라짐
- 합성 트리 입력: Interaction과 비슷하지만 이름 다른 frame → strip 안 됨
- 합성 트리 입력: 부모에 기존 hover styles 있음 → 병합 검증
- 합성 트리 입력: State=Hover/Pressed variants → 정확한 pseudo-class 매핑

### 7.2 Fixture 통합 테스트

`failing/Buttonsolid` fixture에 대해:
- strip 후 트리에 `Interaction` 이름 노드가 0개 (전부 제거됨)
- 생성 코드에 `Interaction` 관련 CSS 변수 0개
- 생성 코드 길이 비교 (이전 vs 이후) — 감소해야 함
- iconOnly/Mask/loading 슬롯의 중복 횟수 감소 검증

### 7.3 회귀 안전망

- audit 회귀 추적: total disjoint pairs가 감소하거나 같아야 함
- 전체 fixture suite (snapshot 비교): 의도된 변경(Interaction 관련 fixture)만 diff. 무관한 fixture에 변경 발생하면 stripper의 false positive
- 기존 NodeMatcher/match-engine 테스트는 그대로 통과해야 함

### 7.4 Reason 로그

엔진에 이미 있는 reason log 인프라에 stripper도 기록:
- 어느 fixture, 어느 노드 ID가 strip되었는지
- 어느 컴포넌트 set의 어느 variants가 추출되었는지
- 부모 styles 병합 충돌이 있었는지

디버깅 시 환경변수로 활성화.

---

## 8. 영향 받는 파일

**신규**:
- `src/.../processors/InteractionLayerStripper.ts` — 핵심 모듈
- `test/tree-builder/InteractionLayerStripper.test.ts` — 단위 테스트
- `test/fixtures/failing/Buttonsolid.json` — 이미 추가됨 (fixture)

**수정**:
- `src/.../tree-builder/TreeBuilder.ts` — Phase 1 파이프라인에 stripper 단계 추가
- `test/audits/audit-baseline.json` — strip 후 baseline 재생성
- `test/snapshots/__snapshots__/*.snap` — 영향 받은 fixture의 snapshot 재생성

**미수정**:
- 모든 match-engine 신호들 — Interaction 처리는 stripper에서 끝남
- 기존 StyleProcessor — pseudo-class 처리 로직 재사용만 함
- 코드 에미터 — Interaction 패턴을 알 필요 없음

---

## 9. 알려진 한계

1. **이름 컨벤션 의존** — 다른 디자인 시스템이 `"State Layer"`, `"Hover State"` 등 다른 이름을 쓰면 감지 못 함. 향후 config 파일로 alias 추가 가능 (현재 spec 범위 밖).
2. **State variant 부족** — 대부분 fixture가 `State=Normal`만 있어서 추출할 hover/active 색이 없음. 디자이너가 추가 variant를 만들기 전에는 출력에 변화 없음. 디자이너 의도 반영의 한계.
3. **부모 영역 커버율 ≥95% 가정** — Interaction이 부모 영역의 일부만 덮는 경우(예: 작은 hit area)는 잘못된 위치에 hover 적용 가능. 현재 데이터에서는 124건 모두 ≥95% 만족.
4. **NodeMatcher의 잘못된 매칭은 근본 원인 미해결** — VariantMerger가 Loading/Mask/Content를 Interaction에 잘못 합치는 버그는 stripping으로 가려질 뿐 실제로 고치진 않음. 다른 같은-이름 자식 관련 회귀는 별도로 대응 필요.

---

## 10. 미결 사항

- 기존 State→pseudo-class 매핑 로직의 정확한 위치와 호출 인터페이스 — 구현 단계에서 코드 탐색 필요
- StyleProcessor가 기대하는 styles 구조의 정확한 형태 — 구현 단계에서 확인
- 빈 Interaction frame에 색이 있는 케이스가 있는지 — 조사에서 fills=[] 확인했지만 다른 fill source(boundVariables 등) 가능성. 구현 시 재확인.
