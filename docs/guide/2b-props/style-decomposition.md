# 스타일 분해 — Variant에서 Prop별 소유권으로

> Props 파이프라인 Stage 4-5. 전체 흐름은 [Props 추출 가이드](extraction.md)를 참조하세요.

이 단계가 파이프라인의 핵심이다. 108개 variant의 스타일 조합에서 **각 CSS 속성이 어떤 prop에 의해 제어되는지** 역추론한다.

3개 모듈이 순차적으로 동작한다:

```
StyleProcessor      → variant CSS를 base/dynamic/pseudo로 분류 + prop 이름 정규화 (rename 없음)
rewritePropConditions → State 조건을 pseudo-class로 변환 + compound 감지
DynamicStyleDecomposer → AND 조건 dynamic에서 CSS 속성별 소유 prop 결정
```

---

### 4-1. StyleProcessor — Variant 스타일 분류

#### 전체 흐름

```
applyStyles(node)
│
├── applyVariantStyles(node)
│   ├── collectVariantStyles(mergedNodes)      → [{variantName, cssStyle}, ...]
│   │     └── normalizeCssNoise(cssStyle)      → near-zero rotation 제거
│   ├── normalizeAcrossVariants(variantStyles) → flex 자식 ≤1 variant의 gap 삭제 (렌더링에 무의미)
│   ├── applyLayoutOverrides(variantStyles)    → squash prune된 wrapper의 레이아웃 속성 복원
│   ├── separateStateVariants(variantStyles)   → baseVariants / pseudoVariants 분리
│   ├── extractCommonStyles(baseVariants)      → base (모든 variant 공통)
│   ├── extractDynamicStyles(baseVariants, base) → dynamic (variant별 차이)
│   └── extractPseudoStyles(pseudoVariants, base) → pseudo (CSS pseudo-class 직접 배치)
│
└── applyPositionStyles(node)
    └── 자식에 position:absolute + left/top 계산
```

#### CSS 노이즈 정규화

Figma의 `getCSSAsync()`가 렌더링에 무의미한 CSS 값을 반환하는 경우가 있다. StyleProcessor는 variant 간 비교 전에 이를 정규화한다:

1. **normalizeCssNoise** (per-variant): `|angle| < 0.01deg` rotation 제거 (TEXT 노드의 부동소수점 노이즈)
2. **normalizeAcrossVariants** (cross-variant): flex 자식 ≤1인 variant의 gap을 정리한다. 자식 ≥2인 variant가 있으면 그 대표값으로 통일하고, 모든 variant가 자식 ≤1이면 gap을 삭제한다. gap은 자식 간 간격이므로 자식 1개 이하면 어떤 값이든 렌더링 결과가 같다.
3. **applyLayoutOverrides** (cross-variant): cross-depth squash에서 prune된 wrapper의 레이아웃 속성(flex-direction, gap, padding, justify-content, align-items, flex-wrap)을 해당 variant의 CSS에 복원한다. `normalizeAcrossVariants` **이후에** 적용하는 것이 중요하다 — normalizeAcrossVariants는 원본 노드의 children 수를 기준으로 gap을 정리하는데, 원본 노드에 wrapper가 있어서 children 수가 1개였을 수 있다. 그 상태에서 gap이 제거된 후 wrapper의 gap을 복원해야 한다.

#### State 감지 및 분리

variant 이름에서 State 값을 추출하여 `baseVariants`와 `pseudoVariants`로 분리한다.
**pseudoVariants는 CSS pseudo-class로 직접 변환**되어 `styles.pseudo`에 배치된다 (dynamic을 거치지 않음).

```
extractStateFromVariantName("Size=Large, State=Hover")
  → 정규식: /State=([^,]+)/i 또는 /states=([^,]+)/i
  → "Hover"

separateStateVariants(variantStyles):
  각 variant:
    state 추출 → EAGER_PSEUDO[state] 존재?
    ├── 예 → pseudoVariants → styles.pseudo (직접 CSS pseudo-class)
    │         Hover → :hover, Focus → :focus, Disabled → :disabled, Visited → :visited
    │         ※ Active/Pressed는 EAGER_PSEUDO에 없음 → baseVariants로 처리 (heuristic이 판단)
    └── 아니오 → baseVariants (Normal, Active, Loading 등) → dynamic (조건부 스타일)
```

#### CSS 변환 가능한 State 값 (20개)

```
기본값 (base로 병합):
  default, normal, enabled, rest, idle

pseudo-class로 변환:
  hover, hovered, hovering        → :hover
  active, pressed, pressing, clicked → :active
  focus, focused, focus-visible   → :focus
  disabled, inactive              → :disabled
  selected, checked               → (동적 조건)
  visited                         → :visited
```

#### STATE_TO_PSEUDO 매핑

대소문자 양쪽 지원, 의미 동등 값 통합:

| State 값 | CSS Pseudo-class |
|----------|-----------------|
| Hover, hover | `:hover` |
| Active, active, Pressed, pressed | `:active` |
| Focus, focus | `:focus` |
| Disabled, disabled, disable | `:disabled` |
| Visited, visited | `:visited` |

매핑되지 않은 state(Loading, Error 등)는 baseVariants로 처리된다.

#### extractPseudoStyles — 공통 diff → CSS pseudo-class

pseudo 변환 대상 variant(Hover, Active 등)의 스타일을 base 대비 diff로 분리하여 **공통 diff만** CSS pseudo-class에 직접 배치한다:

```
extractPseudoStyles(pseudoVariants, base):
│
├── [1] state 값별 그룹핑
│   "Hover" → [
│     { cssStyle: {...} },  // Size=Large, State=Hover
│     { cssStyle: {...} }   // Size=Small, State=Hover
│   ]
│
├── [2] 각 state 그룹에 대해:
│   │
│   ├── [2-1] 모든 variant의 base 대비 diff 계산
│   │   diffs = [
│   │     { backgroundColor: "#F00", color: "#FFF" },  // Size=Large
│   │     { backgroundColor: "#F00", color: "#000" }   // Size=Small
│   │   ]
│   │
│   ├── [2-2] 공통 diff 추출
│   │   commonDiff = { backgroundColor: "#F00" }  ← 모든 variant에 공통
│   │
│   └── [2-3] 공통 diff → pseudo-class에 직접 배치
│       styles.pseudo[":hover"] = { backgroundColor: "#F00" }
│
└── 결과 pseudo:
    { ":hover": { backgroundColor: "#F00" }, ":disabled": { ... } }

※ 비공통 diff(color: 위 예시에서 Size별로 다름)는 이 단계에서 버려짐.
  이 부분은 Heuristic의 convertStateDynamicToPseudo()가 compound-varying CSS로 처리.
```

**이전 방식과의 차이**: 이전에는 `extractStateDynamicEntries()`가 비공통 diff를 per-variant AND 조건 엔트리로 dynamic에 추가했으나, 현재는 `extractPseudoStyles()`가 공통 diff만 pseudo에 직접 배치하고, 비공통 diff 처리는 Heuristic 단계의 `convertStateDynamicToPseudo()`에 위임한다.

---

### 4-2. rewritePropConditions — State 조건 → Pseudo 변환

Heuristic이 State prop을 제거할 때, dynamic 스타일의 state 조건을 CSS pseudo-class로 변환한다.

#### 관련 함수 3개

| 함수 | 목적 | 변경 대상 |
|------|------|----------|
| `convertStateDynamicToPseudo()` | state → CSS pseudo-class | styles.dynamic → styles.pseudo |
| `rewritePropConditions()` | 제거된 prop 참조를 다른 조건으로 치환 | visibleCondition |
| `rewriteStateDynamicStyles()` | dynamic 스타일의 prop 참조를 boolean 조건으로 치환 | styles.dynamic |

#### convertStateDynamicToPseudo 전체 흐름

```
1. state 포함 dynamic 엔트리 분리 (extractStateEq)
2. nonStateCondition별 그룹핑
3. compound-varying CSS 감지
4. 그룹별 3-way 분류:
   ├── pseudoEntries  (hover 등)   → :hover/:active 스타일로 이동
   ├── defaultEntry   (normal 등)  → base에 병합 또는 조건 유지
   └── keptStateEntries (loading 등) → dynamic에 유지
5. compound-varying 시 전체 스타일을 keptEntries로 보존
```

#### extractStateEq — 조건에서 state 추출

AND 조건에서 `eq(removedProp, value)`를 분리하고 나머지를 반환한다:

```
extractStateEq(AND(eq(state, "Hover"), eq(size, "L")), "state")
→ { stateValue: "Hover", remaining: eq(size, "L") }

extractStateEq(eq(state, "Hover"), "state")
→ { stateValue: "Hover", remaining: null }

extractStateEq(eq(size, "L"), "state")
→ null  (state 참조 없음)
```

#### Compound-varying CSS 감지

같은 state 값이 다른 nonStateCondition 그룹에서 **다른 CSS 값**을 가지면 compound이다:

```
감지 알고리즘:
  propStateValues: Map<cssKey, Map<stateValue, Set<cssValue>>>

  수집:
    group1 (size=Large): state=Hover → background: blue
    group2 (size=Small): state=Hover → background: transparent

  판정:
    propStateValues["background"]["Hover"] = {"blue", "transparent"}
    values.size > 1 → compound!

  결과:
    compoundProps = {"background"}
    → pseudo 변환에서 제외
    → keptEntries로 전체 스타일 보존
    → DynamicStyleDecomposer가 compound 분해 처리
```

#### 3-way 엔트리 분류

```
DEFAULT_STATE_NAMES = { "default", "normal", "enabled", "rest", "idle" }

각 그룹의 엔트리:
  pseudoMap에 있음?        → pseudoEntries    (hover → :hover)
  DEFAULT_STATE_NAMES에 있음? → defaultEntry  (normal → base 병합)
  둘 다 아님?              → keptStateEntries (loading → dynamic 유지)
```

#### 대칭성 보장

keptEntries(loading 등)가 존재하면, **default 엔트리도 state 조건을 유지**한다:

```
문제: default 조건 제거 + kept 조건 유지 → 비대칭
  dynamic = [
    // default는 base로 이동 (조건 제거됨)
    { condition: eq(state, "loading"), style: {...} }
  ]
  → DynamicStyleDecomposer가 2-prop vs 3-prop 비대칭으로 compound 감지 실패

해결: default도 조건 유지 → 대칭
  dynamic = [
    { condition: eq(state, "default"), style: {...} },  ← 유지
    { condition: eq(state, "loading"), style: {...} }
  ]
  → state 차원에서 동일한 CSS 값은 removeUniformProperties가 자동 제거
  → 대칭성이 보장되어 compound 감지 정상 작동
```

#### rewriteCondition — 조건 재작성 규칙

`rewritePropConditions()`이 트리를 DFS 순회하며 적용하는 조건 변환 규칙:

| 입력 조건 | conditionMap | 출력 | 설명 |
|----------|-------------|------|------|
| `eq(state, "Checked")` | `{Checked: eq(type, "checked")}` | `eq(type, "checked")` | 직접 매핑 |
| `eq(state, "Unknown")` | `{}` | `undefined` (삭제) | 매핑 없음 |
| `neq(state, "Checked")` | `{Checked: eq(...)}` | `not(eq(type, "checked"))` | neq → not(eq) 역전 |
| `AND(eq(state, "Hover"), eq(size, "L"))` | `{}` (Hover 없음) | `eq(size, "L")` | state 제거 후 단순화 |

단순화 규칙: AND/OR 내부 조건이 0개 → 삭제, 1개 → 풀기

---

### 4-3. DynamicStyleDecomposer — CSS 소유권 결정 알고리즘

**가장 복잡한 단계.** AND 조건(`size=M AND style=filled`)으로 묶인 CSS에서 각 속성의 "주인"을 찾는다.

#### 핵심 개념: 다변수 함수 역추론

Figma의 COMPONENT_SET은 본질적으로 **다변수 함수의 정의역**이다:

```
Figma variant = Style × Tone × Size × State 의 카르테시안 곱

순방향 (Figma가 이미 알고 있음):
  f(size, style, tone, state) = { fontSize, background, padding, ... }

역추론 문제 (우리가 풀어야 하는 것):
  각 CSS 출력마다 "어떤 변수의 최소 부분집합이 이 값을 결정하는가?"
```

각 CSS 속성은 아래 세 가지 중 하나에 해당한다:

```
fontSize:    f(size) = fontSize          → 단변수 함수  → "size"가 소유
background:  f(style, tone) = background → 2변수 함수   → "style+tone"이 소유
padding:     모든 variant에서 동일        → 상수 함수    → base로 이동
```

이 역추론이 "소유권(ownership) 결정"의 의미다. 수학적으로는 전체 다변수 함수에서 각 CSS 출력에 대해 **유효 변수(effective variable)의 최소 부분집합**을 찾는 문제다.

#### 핵심 개념: 함수 종속성(Functional Dependency)

FD는 역추론의 **검증 도구**다. 단변수 함수 `f(P) = C`가 성립하는지 집합론으로 표현하면:

> **FD 정의**: prop P → CSS C
> "P의 값이 결정되면 C의 값도 유일하게 결정된다"

```
size → fontSize   ✓  (size=M이면 fontSize는 항상 14px)
size → background ✗  (size=M이어도 background는 style에 따라 다름)
```

단일 변수로 결정되지 않으면 **2변수 함수(Compound FD)**를 시도한다:

```
f(style, tone) = background  ✓
  (filled, blue)    → "blue"
  (outlined, blue)  → "transparent"
  (filled, red)     → "red"
  → dom(style) × dom(tone) 카르테시안 곱이 background를 유일하게 결정
```

DynamicStyleDecomposer는 각 CSS 속성에 대해 어떤 prop (또는 prop 조합)이 FD를 성립시키는지 역추론한다.

#### 핵심 개념: 일관성(Consistency)

일관성은 **FD가 성립하는지 검증하는 수단**이다.

> prop P가 CSS 속성 C를 "제어"한다 = P의 같은 값 그룹 내에서 C의 값이 항상 동일하다.

```
size=M인 모든 variant에서 fontSize가 항상 "14px"
size=L인 모든 variant에서 fontSize가 항상 "16px"
→ "size"가 fontSize를 제어 ✓  (size → fontSize FD 성립)

size=M인 variant에서 background가 "blue" 또는 "transparent" (style에 따라 다름)
→ "size"는 background를 제어하지 않음 ✗  (size → background FD 불성립)
```

일관성이 깨지면 → FD가 성립하지 않음 → 해당 prop은 소유자가 아님.

#### 논리 구조 — 소유권 판정 예시

```
질문: "border-color는 어떤 prop이 제어하는가?"

size=L 그룹: [#0066FF, #0066FF] → 내부 일관 ✓
size=M 그룹: [#FF0000, #FF0000] → 내부 일관 ✓
그룹 간 차이: {#0066FF, #FF0000} → 다름 ✓
→ size → border-color FD 성립 → size가 소유한다

active=T 그룹: [#0066FF, #FF0000] → 내부 불일치 ✗
→ active → border-color FD 불성립 → active는 소유자가 아님
```

두 조건이 **동시에** 충족되어야 FD가 성립한다:
1. 같은 prop 값끼리 묶은 그룹의 내부 CSS 값이 모두 동일 (그룹 내 일관성)
2. 서로 다른 그룹 간에 CSS 값이 다름 (그룹 간 차이)

> **FD가 성립하지 않는 경우**: 1차(단일 prop) → 2차(compound prop) → 3차(best-fit 강제 할당) 순서로 탐색한다. Best-fit은 완전한 FD가 없을 때의 근사치이며, 진단(diagnostics)으로 기록된다.

#### 3단계 소유권 탐색 우선순위

| 단계 | 방법 | 조건 |
|------|------|------|
| 1차 | 단일 prop 일관성 검증 | 위 두 조건 모두 충족 시 즉시 채택 |
| 2차 | Compound prop (2–3개 조합) | 1차 실패 + bestSingleRatio ≤ 50% 일 때만 |
| 3차 | Best-fit 강제 할당 | 그래도 결정 안 되면 일관 그룹 **비율**이 가장 높은 prop 선택 |

#### 거짓 양성 방지책

| 규칙 | 이유 |
|------|------|
| Compound는 "모든 그룹이 엔트리 1개씩"이면 스킵 | 단순 열거(모든 조합이 유일)와 공동 소유권을 구분 |
| Single 일관성 > 50%면 compound 시도 안 함 | 단일 prop으로 충분히 설명되면 compound는 과적합 |
| CSS 변수는 fallback 값으로 정규화 후 비교 | `var(--Color, #F9F9F9)` → `#F9F9F9` (변수명 차이로 오판 방지) |
| absent는 무관으로 처리 (present 값끼리만 비교) | gap 등 렌더링에 무의미한 variant의 absent를 불일치로 오판하지 않음 |

#### decompose() 전체 흐름

```
decompose(dynamic, base)
│
├── Step 1: 단일 prop / 다중 prop(AND) 분리
│   singlePropEntries: eq(size, "M") → { padding: "16px" }
│   multiPropEntries:  AND(size=M, active=T) → { padding: "16px", opacity: 0.5 }
│
├── Step 2: 단일 prop 처리
│   result["size"]["M"] = { padding: "16px" }
│   ※ first-write per property: 동일 key는 먼저 쓴 값 우선 (덮어쓰기 방지)
│
├── Step 3: 다중 prop 처리 → decomposeMultiProp()
│   ├── Matrix 구성: [{propValues: {size:"M", active:"T"}, style: {...}}, ...]
│   ├── 모든 prop/CSS 키 수집
│   ├── 각 CSS 키의 소유 prop 결정: findControllingProp()
│   ├── Step 5: 단일 prop owner별 결과 배치
│   └── Step 5b: compound owner별 결과 배치 ("style+tone" 키)
│
├── Step 4: removeUniformProperties(result, base)
│
└── return result: Map<propName, Map<propValue, cssStyles>>
```

#### findControllingProp — 3단계 소유권 탐색

각 CSS 속성에 대해 가장 일관적으로 제어하는 prop을 찾는다:

```
findControllingProp("background", matrix, allProps):

1차: 엄격한 단일 prop 일관성
    각 prop마다 isPropConsistentForCssKey() 호출:
      ├── buildPropGroups(propName, cssKey, matrix) → 값별 그룹 구성
      ├── groups.size > 1 필수 (1개 그룹 = 제어 X)
      ├── 모든 그룹이 isGroupConsistent() 통과 필수
      └── 그룹 간 값 차이 필수 (모두 같으면 제어 X)
    → 첫 번째 일관적 prop 발견 시 즉시 반환

2차: Compound prop 일관성
    → 2-prop 조합 먼저, 3-prop 조합 순서
    → 같은 prop 수에서 여러 compound가 consistent하면
      min-groups 선택: 그룹 수가 가장 적은 compound를 반환
      (불필요한 prop이 포함된 compound는 그룹이 더 많아짐)
    → 최적 compound 반환

3차: Best-fit (폴백)
    일관적 그룹 비율이 가장 높은 prop 선택 (절대 수 아닌 비율)
    → 불일치 그룹은 collectDiagnostics()로 기록
```

#### isGroupConsistent — 그룹 내부 일관성

prop의 특정 value에 해당하는 모든 entry의 CSS 값이 동일한지 검증:

```
isGroupConsistent(group):
  1. present 1개 이하 → true (자동 일관)
  2. 모든 present 값 동일 (normalizeCssValue 적용) → true
  3. 다른 값 존재 → false
  ※ absent는 "무관"으로 처리 — present 값끼리만 비교
```

`normalizeCssValue`: CSS `var()` fallback 추출 등 정규화

#### isCompoundConsistent — Compound 일관성 검증

2개 이상의 prop 조합이 CSS 속성을 공동 제어하는지 **4가지 조건** 검증:

```
isCompoundConsistent(["style", "tone"], "background", matrix):

1. 조합 키 생성 및 그룹 구성
   "filled+blue", "outlined+blue", "filled+red", ...
   각 그룹에 해당하는 entry의 CSS 값 수집

2. groups.size > 1 (최소 2개 조합)
   → 1개 조합만 존재하면 compound 불필요

3. 모든 그룹 내부 일관적 + 최소 1개 그룹에 2+ 엔트리
   → 단일 엔트리만 있으면 단순 열거 (compound로 인정 불가)

4. 그룹 간 CSS 값 차이 존재
   → 모든 그룹이 같은 값이면 compound가 제어하지 않음

4가지 모두 충족 → "style+tone"이 background의 compound owner
```

예시:

```
groups = {
  "filled+blue":    { presentValues: ["blue", "blue"] }     ← 일관 ✓, 2개 엔트리 ✓
  "outlined+blue":  { presentValues: ["transparent"] }       ← 일관 ✓
  "filled+red":     { presentValues: ["red"] }               ← 일관 ✓
}
그룹 간 값: {"blue", "transparent", "red"} → 차이 존재 ✓
→ compound 일관적
```

#### Min-Groups 선택 — 동일 prop 수 compound 간 우선순위

같은 prop 수(예: 3-prop)에서 여러 compound가 `isCompoundConsistent`를 통과할 때,
**생성하는 그룹 수가 가장 적은 compound를 선택**한다.

```
CSS 속성 "color"에 대해 3-prop compound 후보:
  state+size+tone   → 13 groups (6 multi, 7 single)  ← 불필요한 size가 그룹을 쪼갬
  state+style+tone  →  9 groups (5 multi, 4 single)  ← 실제 제어 구조 반영

→ min-groups: state+style+tone 선택 ✓
```

**왜 그룹이 적은 게 정답인가**: 불필요한 prop이 compound에 포함되면 해당 prop의 값 수만큼 그룹이 추가로 분할된다.
예를 들어 color가 `style+tone`에 의해 결정되고 `size`와 무관할 때, `size`를 포함하면 size=L/M/S로 3배 분할이 일어나지만 CSS 값은 동일 — 의미 없는 분할이다.

**부작용이 없는 이유**: 불필요한 prop이 빠져도 isCompoundConsistent의 4가지 조건은 여전히 충족된다. 필요한 prop이 빠지면 그룹 내부 일관성이 깨져서 isCompoundConsistent가 실패한다. 따라서 min-groups가 선택하는 compound는 항상 유효하다.

#### 결과 맵 구성

```
Step 5 (단일 prop owner):
  matrix 각 entry에서, owner가 자신인 CSS만 필터링하여 배치
  cssKeyOwner["padding"] === "size"
  → result["size"]["M"] = { padding: "16px" }

Step 5b (compound owner):
  "+" 포함된 owner만 별도 처리
  parts = ["style", "tone"]
  compound value = "filled+blue" (parts의 값 결합)
  → result["style+tone"]["filled+blue"] = { background: "blue" }

최종 구조:
  Map<propName, Map<propValue, cssStyles>>

  "size"       → { "M": { fontSize: "14px" }, "L": { fontSize: "16px" } }
  "style+tone" → {
    "filled+blue":    { background: "blue" },
    "outlined+blue":  { background: "transparent" },
    "filled+red":     { background: "red" },
  }
```

#### removeUniformProperties — 균일 속성 제거

prop의 모든 value에서 동일한 CSS 속성은 해당 prop이 제어하지 않으므로 제거한다:

```
removeUniformProperties(result, base):
  각 prop의 valueMap에 대해:
    valueMap.size <= 1 → skip
    각 CSS 키에 대해:
      모든 value에서 present?
      모든 값이 동일?
      둘 다 yes → uniform 속성:
        ├── base에 해당 키 없음 → 유지 (유일한 source)
        └── base에 해당 키 있음 → 제거 (base가 이미 제공)
    빈 prop 그룹 → 전체 삭제

예시:
  sizeStyles = { M: { color: "black", fontSize: "14px" }, L: { color: "black", fontSize: "16px" } }
  → color는 모든 size에서 동일 + base["color"] 있음 → 제거
  → 결과: { M: { fontSize: "14px" }, L: { fontSize: "16px" } }
```

#### 진단 (Diagnostics)

Best-fit 할당 시 불일치 그룹에 대해 진단을 기록한다:

```
collectDiagnostics("background", "size", matrix):
  일관적 그룹 → skip
  불일치 그룹:
    → present 값 수집
    → 다수결 투표: 가장 많은 표 = expectedValue (동점 시 null)

VariantInconsistency {
  cssProperty: "background",
  propName: "size",
  propValue: "M",
  variants: [
    { props: { size: "M", state: "hover" }, value: "blue" },
    { props: { size: "M", state: "active" }, value: "red" },  ← 불일치
  ],
  expectedValue: "blue" (2:1 다수결)
}
```

---

### 4-4. 전체 분해 흐름 예시

```
입력: 4-prop 버튼 (style × tone × state × size)

① StyleProcessor — createStyleObject:
  separateStateVariants:
    baseVariants:  State=Normal인 variant들
    pseudoVariants: State=Hover, Active, Disabled인 variant들

  extractCommonStyles(baseVariants):
    base: { display: "flex", padding: "8px" }  ← 모든 variant 공통

  extractDynamicStyles(baseVariants, base):
    dynamic: [
      { condition: eq(size, "M"), style: { fontSize: "14px" } },
      { condition: AND(size=M, style=filled, tone=blue), style: { background: "blue" } },
      ...
    ]

  extractStateDynamicEntries(pseudoVariants, base):
    Hover 그룹 공통 diff:
      { condition: eq(states, "Hover"), style: { opacity: 0.8 } }
    Hover 그룹 비공통 diff (compound):
      { condition: AND(states=Hover, style=filled), style: { background: "darkblue" } }
      { condition: AND(states=Hover, style=outlined), style: { background: "transparent" } }

② convertStateDynamicToPseudo (State 제거):
  compound-varying 감지:
    background → Hover에서 "darkblue", "transparent" → compound!
  분류:
    pseudoEntries (Hover, Active):
      → :hover pseudo: { opacity: 0.8 }  (공통 diff만)
      → :active pseudo: { ... }
    defaultEntry (Normal): base에 병합
    compound-varying CSS: keptEntries로 보존

  결과:
    pseudo: { ":hover": { opacity: 0.8 }, ":disabled": { opacity: 0.5 } }
    dynamic: [
      { condition: AND(size=M, style=filled, tone=blue), style: { fontSize: "14px", background: "blue" } },
      { condition: AND(states=Hover, style=filled), style: { background: "darkblue" } },
      ...                                               ← keptEntries (compound 보존)
    ]

③ DynamicStyleDecomposer — decompose:
  Step 1: AND 조건 분리 → multiPropEntries
  Step 3: decomposeMultiProp:
    findControllingProp("fontSize"):
      1차: size 일관적 ✓ → owner = "size"
    findControllingProp("background"):
      1차: size ✗, style ✗, tone ✗ (모두 불일관)
      2차: bestSingleRatio ≤ 50% → compound 시도
           isCompoundConsistent(["style","tone"]) ✓ → owner = "style+tone"
    Step 5:  result["size"]["M"] = { fontSize: "14px" }
    Step 5b: result["style+tone"]["filled+blue"] = { background: "blue" }
  Step 4: removeUniformProperties → 균일 속성 제거

  최종:
    "size"       → { "M": { fontSize: "14px" }, "L": { fontSize: "16px" } }
    "style+tone" → { "filled+blue": { background: "blue" }, "outlined+blue": { background: "transparent" }, ... }
```

---

## Stage 5: 코드 생성

> 코드 생성의 전체 내용은 [CodeEmitter 가이드](../3-code-generation/emitter.md)를 참조하세요.

### PropsGenerator — TypeScript Interface

PropDefinition[] → TypeScript interface 생성:

| PropDefinition 타입 | TypeScript 출력 |
|-------------------|----------------|
| `variant` | `"optionA" \| "optionB"` |
| `boolean` | `boolean` |
| `boolean` + extraValues | `boolean \| "extraValue1" \| "extraValue2"` |
| `string` | `string` |
| `slot` | `React.ReactNode` |
| `slot` (array) | `Array<{...itemProps}>` 또는 `Array<React.ReactNode>` |
| `function` | `functionSignature` 또는 `(...args: any[]) => void` |

### JsxGenerator — Props 사용

#### Props 구조 분해

```typescript
function Button(props: ButtonProps) {
  const { size = "Large", style, tone, leftIcon, label = "Button", ...restProps } = props;
}
```

- 모든 컴포넌트에 `...restProps` 포함
- Array Slot: 기본값 `[]`
- Variant: 첫 번째 옵션을 기본값으로

#### Dynamic Style 참조

```typescript
// 단일 prop
css={[btnCss, btnCss_sizeStyles?.[String(size)]]}

// compound prop ("style+tone")
css={[btnCss, btnCss_styleToneStyles?.[`${style}+${tone}`]]}

// Tailwind 단일 prop (CVA)
className={btnClasses({ size, disabled })}

// Tailwind compound → CVA 미지원, 건너뜀
```

#### 가시성 조건 렌더링

```typescript
// eq 조건
{size === "large" && (<div css={largeLabelCss}>{largeLabel}</div>)}

// truthy 조건
{showDetails && (<div>{/* content */}</div>)}

// 복합 조건 (부분 커버리지)
{(state === "loading" && (size === "M" || size === "S")) && (<div>{/* loading icon */}</div>)}
```

#### 슬롯 / 바인딩 렌더링

```typescript
// 개별 슬롯
{icon && (<div css={iconWrapperCss}>{icon}</div>)}

// 배열 슬롯
{Array.isArray(items) && items.map((item, index) => (
  <ListItem key={index} label={item.label} icon={item.icon} />
))}

// 텍스트 바인딩
<span>{label}</span>

// 이벤트 바인딩
<button onClick={() => onCheckedChange?.(!checked)} disabled={disable}>
```

---

## Post-Processing: ComponentPropsLinker

INSTANCE override 메타데이터를 의존성 컴포넌트의 props와 연결한다:

```
메인 컴포넌트의 INSTANCE override: { label: "Submit", iconBg: "#FF0000" }
→ 의존성 컴포넌트 props에 override props 추가
→ 바인딩 연결: TEXT 노드 → bindings.content = { prop: "label" }
```

---

## 타입 시스템

타입 정의는 [파이프라인 개요](../0-architecture/pipeline-overview.md#타입-시스템)를 참조하세요.

---

## 전체 예시: 4-Prop Button

```
Figma componentPropertyDefinitions:
  Style:     VARIANT ["filled", "outlined"]
  Tone:      VARIANT ["blue", "red"]
  State:     VARIANT ["Normal", "Hover", "Active", "Disabled"]
  Size:      VARIANT ["S", "M", "L"]
  Left Icon: VARIANT ["True", "False"]
  Label:     TEXT "Button"

총 variant: 2 × 2 × 4 × 3 = 48개

    ↓ Stage 1: PropsExtractor

PropDefinition[]:
  { name: "style",    type: "variant", options: ["filled", "outlined"] }
  { name: "tone",     type: "variant", options: ["blue", "red"] }
  { name: "state",    type: "variant", options: ["Normal", "Hover", "Active", "Disabled"] }
  { name: "size",     type: "variant", options: ["S", "M", "L"] }
  { name: "leftIcon", type: "slot" }            ← True/False + "icon" 패턴 → slot
  { name: "label",    type: "string" }

    ↓ Stage 2: SlotProcessor + VisibilityProcessor

  leftIcon 노드: visibleCondition = truthy(leftIcon)

    ↓ Stage 3: ButtonHeuristic

  State 완전 제거 (Normal→base, Hover→:hover, Active→:active, Disabled→:disabled)
  compound-varying CSS(background)는 dynamic에 보존

  Props: style, tone, size, leftIcon, label    (State 제거됨)

    ↓ Stage 4: StyleProcessor + DynamicStyleDecomposer

  base:    { display: "flex", padding: "8px" }
  pseudo:  { ":hover": { opacity: 0.8 }, ":disabled": { opacity: 0.5 } }
  decomposed:
    "size"       → { S: { fontSize: "12px" }, M: { fontSize: "14px" }, L: { fontSize: "16px" } }
    "style+tone" → { "filled+blue": { background: "blue" }, "outlined+blue": { background: "transparent" }, ... }

    ↓ Stage 5: PropsGenerator + JsxGenerator

export interface ButtonProps {
  style?: "filled" | "outlined";
  tone?: "blue" | "red";
  size?: "S" | "M" | "L";
  leftIcon?: React.ReactNode;
  label?: string;
}

function Button(props: ButtonProps) {
  const { style = "filled", tone = "blue", size = "S", leftIcon, label = "Button", ...restProps } = props;
  return (
    <button
      css={[btnCss, btnCss_sizeStyles?.[String(size)], btnCss_styleToneStyles?.[`${style}+${tone}`]]}
      {...restProps}
    >
      {leftIcon && <div css={iconCss}>{leftIcon}</div>}
      <span>{label}</span>
    </button>
  );
}
```

---

## 관련 파일

| 파일 | Stage | 역할 |
|------|-------|------|
| `processors/PropsExtractor.ts` | 1 | Figma 데이터에서 props 추출 |
| `processors/SlotProcessor.ts` | 2 | Boolean → Slot 변환, 배열 슬롯 감지 |
| `processors/VisibilityProcessor.ts` | 2 | variant 기반 가시성 조건 생성 |
| `heuristics/IHeuristic.ts` | 3 | Heuristic 인터페이스 (score + apply) |
| `heuristics/HeuristicsRunner.ts` | 3 | 점수 기반 Heuristic 선택 및 실행 |
| `heuristics/ButtonHeuristic.ts` | 3 | State 제거 + pseudo 변환 |
| `heuristics/FabHeuristic.ts` | 3 | State pseudo + ELLIPSE 좌표 보정 |
| `heuristics/LinkHeuristic.ts` | 3 | semanticType 설정 (link, link-text) |
| `heuristics/CheckboxHeuristic.ts` | 3 | checked/onCheckedChange/disable 추가 |
| `heuristics/RadioHeuristic.ts` | 3 | checked/onChange/disable + dot 아이콘 |
| `heuristics/SwitchHeuristic.ts` | 3 | onChange + 토글 prop 자동 감지 |
| `heuristics/InputHeuristic.ts` | 3 | label/helperText 텍스트 prop 변환 |
| `heuristics/SearchFieldHeuristic.ts` | 3 | TEXT → `<input>` + clear 버튼 |
| `heuristics/DropdownHeuristic.ts` | 3 | 상태 변수 + 배열 슬롯 + 스타일 정리 |
| `heuristics/SegmentedControlHeuristic.ts` | 3 | Tab → options 배열 + loop template |
| `heuristics/ChipHeuristic.ts` | 3 | 경량 TEXT/INSTANCE 슬롯 감지 |
| `heuristics/BadgeHeuristic.ts` | 3 | INSTANCE override 정규화 (count) |
| `heuristics/ProfileHeuristic.ts` | 3 | imageSrc + hover overlay 이중 렌더링 |
| `heuristics/FrameHeuristic.ts` | 3 | children slot 설정 |
| `heuristics/GenericHeuristic.ts` | 3 | 범용 슬롯 감지 (폴백) |
| `processors/StyleProcessor.ts` | 4 | variant 스타일 → base/dynamic/pseudo 분류 + prop 이름 정규화 (native HTML rename 없음 — Layer 3 담당) |
| `processors/utils/rewritePropConditions.ts` | 3-4 | State → pseudo-class 변환 + compound 감지 |
| `post-processors/DynamicStyleDecomposer.ts` | 4 | prop별 CSS 소유권 분석 + 균일 속성 제거 |
| `generators/PropsGenerator.ts` | 5 | TypeScript interface 생성 |
| `generators/JsxGenerator.ts` | 5 | JSX 렌더링 + props 사용 |
| `post-processors/ComponentPropsLinker.ts` | Post | INSTANCE override → 의존성 props 연결 |
| `adapters/PropsAdapter.ts` | Post | 내부 → 공개 API 변환 |
