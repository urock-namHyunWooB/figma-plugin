# ISSUE-035: Compound Prop 분해 + 아이콘 가시성 조건 수정

- **커밋**: `4d10da5` — `fix(codegen): compound prop 분해 + 아이콘 가시성 조건 수정`
- **영향 컴포넌트**: 다수의 prop을 가진 복합 버튼 컴포넌트 (예: Btnsbtn — style, tone, state, size 4개 prop)
- **수정 파일 (8개)**:
  - `StyleProcessor.ts`
  - `VisibilityProcessor.ts`
  - `rewritePropConditions.ts`
  - `DynamicStyleDecomposer.ts`
  - `JsxGenerator.ts`
  - `EmotionStrategy.ts`
  - `TailwindStrategy.ts`
  - `SlotProcessor.ts`
  - `ButtonHeuristic.ts`

---

## 문제 1: Compound Prop 스타일 분해 실패

### 현상

`style`, `tone`, `state` 3개 prop이 함께 CSS 속성(예: `background`)을 결정하는 버튼 컴포넌트에서, `background`가 어느 단일 prop에도 일관적으로 귀속되지 않아 잘못된 prop에 할당되거나 진단 불일치가 대량 발생했다.

예: `style=filled + tone=blue → background: blue`, `style=outlined + tone=blue → background: transparent`
→ `tone`만으로는 `background`를 결정할 수 없고, `style`만으로도 결정할 수 없음.

### 원인

`DynamicStyleDecomposer.findControllingProp()`이 **단일 prop**만 검색했기 때문에, 2개 이상의 prop 조합이 CSS 값을 결정하는 경우를 처리하지 못했다.

### 해결

#### (1) DynamicStyleDecomposer: compound owner 탐색 추가

`findControllingProp()`에 2차 탐색 단계를 추가:

```
기존:
  1차: 단일 prop 일관성 체크
  2차: best-fit (가장 일관적인 단일 prop)

변경:
  1차: 단일 prop 일관성 체크
  2차: compound prop 일관성 체크 (2-prop → 3-prop 순)
       단, 단일 prop 과반수 초과 시 compound보다 single+diagnostic 선호
  3차: best-fit
```

`isCompoundConsistent()` 메서드가 N개 prop 조합의 일관성을 검증한다:
- 조합 키 생성: `style=filled + tone=blue` → `"filled+blue"`
- 그룹별 CSS 값 일관성 확인
- 그룹 간 차이 존재 확인 (차이 없으면 "제어"하지 않음)
- 최소 1개 그룹에 2+ 엔트리가 있어야 함 (단순 열거 방지)

#### (2) DynamicStyleDecomposer: compound owner 결과 맵 구성 (Step 5b)

compound owner(`"style+tone"`)에 해당하는 CSS 속성들을 별도로 수집하여 결과 맵에 추가:
- 키: `"style+tone"`, 값: `Map<"filled+blue", { background: "blue" }>`

#### (3) StyleProcessor: 비공통 diff 보존

`extractStateDynamicEntries()`에서 state별 variant를 그룹핑할 때, **모든 variant에 공통이 아닌 diff**를 버리고 있었다.

```
기존: state=hover 그룹의 공통 diff만 추출 → 나머지 소실
변경: 공통 diff → 단일 state 조건 엔트리
      비공통 diff → per-variant 엔트리 (compound-varying CSS 보존)
```

이를 통해 `state=hover AND style=filled`처럼 compound 조건이 필요한 스타일이 dynamic 엔트리로 보존된다.

#### (4) rewritePropConditions: compound-varying CSS 감지 및 pseudo 변환 방지

State prop을 pseudo-class(`:hover`, `:active`)로 변환하는 과정에서, **compound-varying CSS 속성**을 감지하여 pseudo 변환에서 제외한다.

```
감지 기준: 같은 state 값이 여러 nonStateCondition 그룹에서 다른 CSS 값을 가짐
→ compound prop이 CSS를 제어하므로 pseudo로 축약 불가
→ keptEntries로 보존하여 DynamicStyleDecomposer가 compound 분해
```

또한 default 엔트리와 kept entries 간 대칭성을 보장:
- kept entries(loading 등)가 존재하면 default도 state 조건을 유지
- Decomposer의 compound 감지가 3-prop vs 4-prop 비대칭으로 실패하는 것을 방지

#### (5) JsxGenerator: compound prop 참조 코드 생성

`buildDynamicStyleRef()` 메서드를 추가하여 compound prop에 대한 올바른 lookup 코드를 생성:

```typescript
// single prop ("size")
btnCss_sizeStyles?.[String(size)]

// compound prop ("style+tone")
btnCss_styleToneStyles?.[`${style}+${tone}`]
```

Tailwind의 경우 compound prop은 CVA variants로 표현 불가하므로 건너뛴다.

#### (6) EmotionStrategy: compound prop 변수명 변환

compound prop 이름을 camelCase 변수명으로 변환:
- `"style+tone"` → `"styleTone"` → `btnCss_styleToneStyles`

---

## 문제 2: 아이콘 가시성 조건 누락

### 현상

`icon_delete` 노드가 `State=loading`(공통)이면서 `Size=M,S`(비공통, L 미포함)인 경우,
가시성 조건이 `state === "loading"`만 생성되어 `Size=L`에서도 아이콘이 표시되었다.

### 원인

`VisibilityProcessor`가 공통 prop만 조건에 포함하고, 비공통 prop의 **부분 커버리지**를 무시했다.

### 해결

`findPartialCoverageConditions()` 메서드를 추가:

```
공통 prop 이외의 prop에서 부분 커버리지 조건 생성

1. 비공통 prop의 value 집합 수집 (child)
2. 루트 노드의 전체 value 집합과 비교
3. child가 root의 모든 value를 가지면 → 제약 불필요
4. 부분 커버리지 → OR 조건 추가

예: icon_delete
  - State=loading (공통) ✓
  - Size={M, S} (비공통) vs root Size={L, M, S}
  → AND(state=loading, OR(size=M, size=S))
```

이는 set 기반 비교(count 기반이 아님) — 공통 조건이 count 차이를 이미 설명하기 때문.

---

## 문제 3: 비연속 INSTANCE의 잘못된 배열 슬롯 감지

### 현상

버튼의 좌/우 아이콘처럼 같은 `componentId`이지만 TEXT 노드로 분리된 INSTANCE들이 배열 슬롯으로 감지되었다.

### 원인

`SlotProcessor`가 같은 `componentId`를 가진 INSTANCE를 그룹핑할 때, children 배열에서의 **연속성**을 확인하지 않았다.

### 해결

`areContiguous()` 메서드를 추가:

```typescript
// children: [leftIcon, label, rightIcon]
// leftIcon과 rightIcon은 같은 componentId지만 비연속 → 배열 슬롯 아님
private areContiguous(group, children): boolean {
  const indices = group.map((node) => children.indexOf(node));
  indices.sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  return true;
}
```

---

## 문제 4: TEXT 슬롯 스타일 제거

### 현상

ButtonHeuristic에서 TEXT 슬롯 노드의 styles를 제거하여 font-size, color 등이 소실되었다.

### 원인

TEXT 슬롯은 `{text}`로만 렌더링되므로 wrapper div가 불필요하다고 판단하여 styles를 완전히 제거했으나, 실제로는 TEXT 노드 자체에 font-size, color 등의 스타일이 필요하다.

### 해결

`ButtonHeuristic`에서 TEXT 슬롯의 `styles` 제거 로직을 삭제. children만 비우고 styles는 유지한다.

```typescript
// 변경 전
if (child.type === "TEXT") {
  child.styles = undefined;  // ← font-size, color 소실!
}
child.children = [];

// 변경 후
child.children = [];  // styles는 유지
```

---

## 데이터 흐름 (전체)

```
Figma Component (style, tone, state, size — 4개 prop)
    │
    ▼
StyleProcessor.extractStateDynamicEntries()
    ├── 공통 diff → state 단일 조건 (예: state=hover → { opacity: 0.9 })
    └── 비공통 diff → per-variant 조건 (예: state=hover AND style=filled → { background: blue })
    │
    ▼
rewritePropConditions (State → pseudo 변환)
    ├── compound-varying CSS 감지 → pseudo 변환에서 제외
    ├── 순수 state-varying CSS → :hover, :active 등으로 변환
    └── compound CSS → keptEntries로 보존 (default 포함, 대칭 유지)
    │
    ▼
DynamicStyleDecomposer.decompose()
    ├── 1차: 단일 prop 일관성 → size가 fontSize 제어
    ├── 2차: compound 일관성 → style+tone이 background 제어
    ├── 3차: best-fit → 나머지 속성
    └── Step 5b: compound owner 결과 맵 구성
    │
    ▼
EmotionStrategy / TailwindStrategy
    ├── Emotion: const btnCss_styleToneStyles = { "filled+blue": css`...` }
    └── Tailwind: compound prop 건너뜀 (CVA 미지원)
    │
    ▼
JsxGenerator
    ├── Emotion: css={[btnCss, btnCss_styleToneStyles?.[`${style}+${tone}`]]}
    └── Tailwind: className={btnCss({ size })}  (compound 제외)
```

---

## 테스트

- `test/compiler/test-btnsbtn-decompose.test.ts` — compound prop 분해 검증
- `test/fixtures/failing/Btnsbtn.json` — 실제 Figma 데이터 (style, tone, state, size 4개 prop 버튼)
