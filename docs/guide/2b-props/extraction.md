# Props Pipeline

> 이 문서는 Props 파이프라인의 Stage 1-2를 다룹니다. Stage 3은 [Heuristics 가이드](heuristics.md), Stage 4는 [스타일 분해 가이드](style-decomposition.md)를 참조하세요.

> Figma의 variant 조합폭발을 어떻게 개별 React prop으로 정확히 분해하는가.

## 핵심 문제

Figma COMPONENT_SET은 variant 축의 **직적(Cartesian product)**으로 구성된다.

```
Button 컴포넌트:
  Style  = [filled, outlined, ghost]     → 3가지
  Tone   = [blue, red, gray]             → 3가지
  State  = [normal, hover, active, disabled] → 4가지
  Size   = [S, M, L]                     → 3가지

총 variant 수 = 3 × 3 × 4 × 3 = 108개
```

각 variant는 고유한 시각적 결과를 가지지만, React 코드에서는 **각 CSS 속성이 어떤 prop에 의해 제어되는지** 분리해야 한다:

```
fontSize    → size가 제어 (S=12px, M=14px, L=16px)
background  → style+tone이 공동 제어 (filled+blue=blue, outlined+blue=transparent)
opacity     → state가 제어 (hover=0.8, disabled=0.5) → CSS pseudo로 변환
padding     → 모든 variant에서 동일 → base 스타일
```

이 문서는 108개 variant 조합에서 위와 같은 분해가 어떻게 이루어지는지를 설명한다.

---

## 파이프라인 개요

```
Stage 1: 추출          — Figma 속성에서 variant 축 인식
Stage 2: 구조 분석      — 슬롯/가시성 패턴 감지
Stage 3: 의미 변환      — Heuristic이 컴포넌트 의미에 맞게 prop 재구성
Stage 4: 스타일 분해    — variant 스타일을 prop별 소유권으로 분해 ← 핵심
Stage 5: 코드 생성      — TypeScript interface + JSX
```

---

## Stage 1: Variant 축 인식 (PropsExtractor)

### Figma가 제공하는 원본 데이터

#### Figma Plugin API 주요 속성

| 속성 | 노드 | 설명 |
|------|------|------|
| `componentPropertyDefinitions` | COMPONENT_SET | 이 COMPONENT_SET에 존재하는 prop 정의. 어떤 prop이 있고 각 옵션이 뭔지 정의함. 예: Style=["filled","outlined"], Size=["S","M","L"] |
| `componentProperties` | COMPONENT (개별 variant) | 해당 variant의 prop 현재 값 |
| `componentPropertyReferences` | 노드(서브레이어) | 이 노드의 어떤 속성이 어떤 prop에 바인딩되었는지. 값은 `componentPropertyDefinitions`의 prop 이름 참조 |

`componentPropertyReferences` 타입: `{ visible?: string, characters?: string, mainComponent?: string }`

```
{ visible: "Left Icon#89:6", characters: "Label#89:7" }
→ 이 노드의 visible이 "Left Icon" prop에, 텍스트가 "Label" prop에 바인딩됨
```

> 참조: [Figma Plugin API — ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)

```typescript
componentPropertyDefinitions: {
  "Style":     { type: "VARIANT", variantOptions: ["filled", "outlined", "ghost"] },
  "Tone":      { type: "VARIANT", variantOptions: ["blue", "red", "gray"] },
  "State":     { type: "VARIANT", variantOptions: ["Normal", "Hover", "Active", "Disabled"] },
  "Size":      { type: "VARIANT", variantOptions: ["S", "M", "L"] },
  "Left Icon": { type: "VARIANT", variantOptions: ["True", "False"] },
  "Label":     { type: "TEXT",    defaultValue: "Button" },
}
```

### 5-레벨 Fallback

Figma 데이터 형식이 일관적이지 않아 5단계 폴백으로 추출한다:

```
Level 1: componentPropertyDefinitions (COMPONENT_SET 레벨)
    ↓ (없으면)
Level 2: componentProperties (COMPONENT variant 레벨)
    ↓ (없으면)
Level 3: variant 이름 파싱 ("State=Normal, Size=Large")
    ↓ (없으면)
Level 4: mergedNodes variant 이름 (VariantMerger 출력)
    ↓ (없으면)
Level 5: componentPropertyReferences만 (visible/characters/mainComponent)
```

### 타입 분류

각 Figma 속성을 React prop 타입으로 변환한다:

| Figma 타입 | 조건 | 결과 타입 | 예시 |
|-----------|------|----------|------|
| `VARIANT` | 다중 옵션 | `variant` | `size: "S" \| "M" \| "L"` |
| `VARIANT` | 정확히 True/False 2개 | `boolean` | `disabled: boolean` |
| `VARIANT` | True/False + 슬롯 패턴 이름 | `slot` | `icon: React.ReactNode` |
| `BOOLEAN` | — | `boolean` | `isActive: boolean` |
| `TEXT` | — | `string` | `label: string` |
| `INSTANCE_SWAP` | — | `slot` | `icon: React.ReactNode` |

**슬롯 패턴**: 이름에 `icon`, `image`, `avatar`, `thumbnail`, `prefix`, `suffix` 포함 시

**이름 정규화**: `"Left Icon#89:6"` → 제어문자 제거 → 노드ID 제거 → 특수문자→공백 → camelCase → `"leftIcon"`
- 네이티브 HTML prop 충돌(`type`, `name`, `value`, `checked` 등 10개) → `"custom"` 접두사
- JS 예약어 → `"is"` 접두사

### 보충 추출: componentPropertyReferences

노드 트리를 순회하며 바인딩된 속성을 추가 감지한다:

| 참조 타입 | 결과 타입 | 설명 |
|----------|----------|------|
| `refs.visible` | `boolean` | 가시성 제어 |
| `refs.characters` | `string` | 텍스트 바인딩 |
| `refs.mainComponent` | `slot` | INSTANCE_SWAP |

중복은 `sourceKey` + `name` 2단계로 방지한다.

---

## Stage 2: 구조 분석

### SlotProcessor — Boolean → Slot 변환

Boolean variant(`Left Icon = True/False`)이 실제로는 INSTANCE 노드의 가시성을 제어하는 패턴을 감지한다.

**개별 슬롯 감지 (3가지 방법)**:

| 방법 | 감지 기준 | 예시 |
|------|----------|------|
| 명시적 바인딩 | `componentPropertyReferences.visible`이 boolean prop 참조 | `visible = "iconLeft#373:58"` |
| Variant 패턴 | 슬롯 패턴 이름의 boolean variant + mergedNodes에서 True에만 INSTANCE 존재 | `Left Icon=True → INSTANCE, False → 없음` |
| INSTANCE 확인 | variant에 따라 INSTANCE가 나타나거나 사라짐 | variant별 children 차이 |

**배열 슬롯 감지**: 같은 `componentId`를 가진 2+ INSTANCE가 연속 배치(contiguous)되면 배열 슬롯으로 판정한다.

```
감지 필터:
  SECTION 노드 → 제외
  2+ 비슬롯 자식 필요
  같은 componentId:variantCount로 그룹핑 → 2+ 인스턴스 그룹 필요
  hasDistinctOverrides() → 각 인스턴스가 다른 내용이면 스킵
  areContiguous() → 비연속(leftIcon, TEXT, rightIcon)이면 개별 슬롯
```

### VisibilityProcessor — 가시성 조건 생성

노드가 일부 variant에서만 존재하면 조건부 렌더링 조건을 생성한다.

**PropMap 3-키 인덱싱** (유연한 매칭):
- 원본: `"┗ Required#17042:5"`, ID 제거: `"┗ Required"`, ASCII 정규화: `"Required"`

**조건 생성 — 3레벨 폴백**:

```
노드가 모든 variant에 존재 → 조건 없음
노드가 일부 variant에만 존재:
│
├── 1. componentPropertyReferences.visible 확인
│     → 직접 바인딩 조건 생성
│
└── 2. mergedNodes의 variant 이름에서 조건 추론
      │
      ├── (a) 공통 prop 찾기 (모든 출현에서 같은 value)
      │     → eq(state, "loading")
      │
      ├── (b) 부분 커버리지 (공통 prop이 있을 때, 비공통 prop의 value 부분집합)
      │     → AND(eq(state, "loading"), OR(eq(size, "M"), eq(size, "S")))
      │
      └── (c) subset 폴백 (공통 prop이 없을 때)
            → OR(eq(type, "text"), eq(type, "number"))
```

(a)→(b)는 종속 단계: 공통 prop이 있어야 부분 커버리지를 검사한다.
(c)는 (a)가 없을 때의 폴백이다.

**조건 최적화**: 부모가 보장하는 조건(guaranteed conditions)을 자식에서 제거한다.
```
부모: eq(state, "loading")
자식: AND(eq(state, "loading"), eq(size, "M"))
→ 최적화 후: eq(size, "M")
```

**Dead Code Elimination**: 조상 조건과 모순되는 자식 노드를 트리에서 제거한다.
```
조상이 보장: eq(customType, "date")
자식이 요구: eq(customType, "search")
→ 모순 → 자식 노드 제거 (dead code)
```

판정 로직 (`isContradictedByGuaranteed`):
- `eq`: 같은 prop에 다른 value → 모순
- `and`: 하위 조건 중 하나라도 모순 → 전체 모순
- `or`: 모든 분기가 모순 → 전체 모순

**OR Branch Simplification**: OR 조건의 일부 분기만 불가능한 경우, 해당 분기를 제거하고 유효한 분기만 남긴다. TypeScript의 TS2367 (불가능한 타입 비교) 에러를 방지한다.
```
조상이 보장: OR(eq(customType, "text"), eq(customType, "number"), eq(customType, "password"))
→ 허용 값 집합: customType ∈ {text, number, password}

자식 조건: OR(eq(customType, "search"), eq(customType, "text"))
→ "search"는 허용 집합에 없음 → 제거
→ 단순화 결과: eq(customType, "text")
```

`buildAllowedValues`가 guaranteed 조건에서 prop별 허용 값 집합을 추출하고, `simplifyRecursive`가 OR/AND/eq를 재귀적으로 단순화한다.

---

## 관련 타입

타입 정의(PropDefinition, ConditionNode, StyleObject 등)는 [파이프라인 개요](../0-architecture/pipeline-overview.md#타입-시스템)를 참조하세요.
