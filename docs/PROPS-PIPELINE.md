# Props Pipeline

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

**조건 최적화**: 부모가 보장하는 조건을 자식에서 제거한다.
```
부모: eq(state, "loading")
자식: AND(eq(state, "loading"), eq(size, "M"))
→ 최적화 후: eq(size, "M")
```

---

## Stage 3: 의미 변환 (Heuristics)

점수 기반 매칭(threshold >= 10)으로 선택된 Heuristic이 컴포넌트 의미에 맞게 props를 재구성한다. 현재 15개 Heuristic이 등록되어 있다.

### 공통 메커니즘

모든 Heuristic의 apply()는 3가지 변환 유형의 조합이다:

| 유형 | 설명 | 예시 |
|------|------|------|
| **Prop 재구성** | Figma variant prop을 React 의미에 맞는 prop으로 교체 | State variant → 제거, checked/onChange 추가 |
| **트리 변환** | 노드에 semanticType, bindings, visibility 설정 | TEXT → `<input>`, INSTANCE → slot |
| **스타일 이동** | dynamic/pseudo 스타일 재배치 | state=hover → `:hover`, active → `open` 조건 |

공통 실행 패턴:
```
1. 기존 variant prop 제거 (ctx.props.splice)
2. 조건 맵 구축: variant 옵션 → 새 조건
3. 트리 전체 조건 재작성 (rewritePropConditions, rewriteStateDynamicStyles)
4. 새 prop 추가 (ctx.props.push)
```

---

### 상호작용 컴포넌트

#### ButtonHeuristic

**핵심: State variant → CSS pseudo-class 분리**

**apply() 실행 순서:**

```
1. applyChildSemanticTypes()  — 자식 노드에 semanticType 부여
2. detectAndAddTextSlots()    — variant 간 텍스트 차이 감지 → string slot
3. removeStateProp()          — state → pseudo 변환 + prop 제거
4. cleanupSlotInstances()     — 중복 slot INSTANCE 제거 + children 비우기
```

**Step 1 — semanticType 분류 기준:**

| 노드 조건 | semanticType |
|-----------|-------------|
| root | `button` |
| TEXT | `label` |
| INSTANCE/VECTOR, 이름이 icon/arrow/chevron/check/close 또는 ≤32px | `icon` |
| FRAME/GROUP, 모든 자식이 icon | `icon-wrapper` |
| RECTANGLE/LINE, 너비 또는 높이 ≤4px 또는 이름이 spacer/divider | `spacer` |

**Step 2 — TEXT slot 감지:**

```
모든 TEXT 노드 수집
  → shouldSkipTextSlots(): 모든 TEXT가 전체 variant에서 동일하면 스킵
  → variant 간 텍스트 차이 감지 → string prop 추가 + bindings.content 설정
  → 중복 slot prop 제거 (deduplicateTextSlotProps)
```

**Step 3 — State 제거 판정:**

```
State = ["Normal", "Hover", "Active", "Disabled"]
→ 모든 값 CSS_CONVERTIBLE → State prop 완전 제거
→ convertStateDynamicToPseudo(): Normal→base, Hover→:hover, Active→:active, Disabled→:disabled

State = ["Normal", "Hover", "Loading"]
→ Loading이 비변환 → State prop 유지 (options: ["Normal", "Loading"])
→ conditionMap: { "Loading": eq(state, "Loading") }
→ rewritePropConditions(): 트리 전체 조건 재작성
```

compound-varying CSS(같은 state에서 다른 prop 조합에 따라 CSS 값이 다른 경우)는 pseudo 변환에서 제외되어 dynamic에 보존된다.

**Step 4 — slot 정리:**

```
seenSlotProps 추적: 같은 slot prop에 바인딩된 중복 INSTANCE → 제거
slot INSTANCE의 children → 비움 (불필요한 CSS 변수 방지)
```

---

#### FabHeuristic

**핵심: Floating Action Button — State pseudo + ELLIPSE 좌표 보정**

**apply() 실행 순서:**

```
1. State prop 찾기 → 제거
   → convertStateDynamicToPseudo(): state → :hover/:active pseudo
   → rewritePropConditions(): 비변환 state 조건 보존

2. fixEllipseRenderOffset()
   → ELLIPSE 자식 노드의 absoluteBoundingBox vs absoluteRenderBounds 비교
   → effect(shadow 등)로 인한 좌표 차이를 offset으로 보정
   → styles.base.left/top 조정

3. setIconHoverStroke()
   → icon INSTANCE의 mergedNodes에서 variant별 SVG 추출
   → stroke 색상 파싱: /stroke="(#[0-9A-Fa-f]{3,8})"/
   → default와 다른 색상 발견 시 variant의 state 추출
   → root styles.pseudo[":hover"/":active"]에 __raw CSS 추가:
     "& > div svg path { stroke: #color; }"
```

---

#### LinkHeuristic

**핵심: semanticType 설정만 수행 (가장 단순)**

**apply() 실행 순서:**

```
1. root.semanticType = "link"

2. applyChildSemanticTypes() (재귀)
   → TEXT → "link-text"
   → INSTANCE/VECTOR: 이름이 icon/arrow/external/chevron 또는 ≤24px → "icon"
```

Props 변경 없음.

---

### 토글/선택 컴포넌트

#### CheckboxHeuristic

**핵심: 여러 variant를 단일 `checked` 상태로 통합**

**apply() 실행 순서 (12단계):**

```
 1. removeAndDetectStateProp()
    → state/states prop 찾기 → 제거
    → 각 옵션을 패턴 매칭:
      checked/active/selected/on → "checked"
      indeterminate/partial      → "indeterminate"
      disabled/disable           → "disable"

 2. removeOnOffProp()
    → /^on\/?off$/i 패턴의 boolean prop 제거, 이름 반환

 3. addCheckedProp()
    → checked: boolean 추가
    → indeterminate 감지 시: checked: boolean | "indeterminate" (extraValues)

 4. addOnCheckedChangeProp()
    → onCheckedChange: (checked: boolean | "indeterminate") => void 추가

 5. addDisableProp()
    → disable: boolean 추가

 6. Root bindings 설정
    → attrs.onClick = () => onCheckedChange?.(!checked)
    → attrs.disabled = {prop: "disable"}

 7. convertIconSlots()
    → 재귀 순회: slot binding된 INSTANCE 탐색
    → 이름에 "check" 포함 (checkbox 제외)
      → bindings.content 삭제, visibleCondition = eq(checked, true)
    → 이름에 "lineHorizontal"/"indeterminate" 포함
      → bindings.content 삭제, visibleCondition = eq(checked, "indeterminate")
    → 이름에 "interaction" 포함 → bindings + slot prop 삭제

 8. renamePropInConditions() (onOffProp이 있을 때)
    → 트리 전체에서 onOff prop 참조를 "checked"로 rename

 9. convertStateDynamicToPseudo()
    → DISABLE_PSEUDO_MAP: { disable: ":disabled", disabled: ":disabled" }
    → disable 관련 dynamic → :disabled pseudo로 이동

10. rewritePropConditions() + rewriteStateDynamicStyles()
    → 제거된 state prop의 모든 참조를 checked/disable 조건으로 재작성

11. refineIconConditions()
    → check icon이 active+partial 모두에서 보여지는 문제 보정
    → "check" 이름 → 강제로 eq(checked, true)로 수정

12. convertSvgPropsToCss() + normalizeBorderRadiusForSvgVariants()
    → SVG fill → background, stroke → borderColor, strokeWidth → borderWidth+"px"
    → borderColor/borderWidth 있으면 border-style: "solid" 자동 추가
    → SVG 변환 엔트리에 누락된 border-radius 보충
```

---

#### RadioHeuristic

**핵심: Checkbox와 유사하나 dot 아이콘 중심**

**apply() 실행 순서:**

```
 1. removeStateProp()
    → state/states prop 제거
    → checked/active/selected/on 패턴 → checkedValues로 수집

 2. removeTightProp() → "tight" prop 제거

 3. addCheckedProp() → checked: boolean 추가

 4. addOnChangeProp() → onChange: (checked: boolean) => void 추가

 5. addDisableProp() → disable: boolean 추가

 6. Root bindings 설정
    → attrs.onClick = () => onChange?.(!checked)
    → attrs.disabled = {prop: "disable"}

 7. addDisabledOpacity()
    → styles.pseudo[":disabled"] = { opacity: 0.43 }

 8. fixStateCheckedSizeConflict()
    → AND(state=Checked, size=*) 조건의 dynamic에서 width/height 제거
    → Size variant가 크기를, State가 체크 표시를 제어할 때 충돌 방지

 9. convertIconSlots()
    → dot 이름 → bindings.content 삭제, visibleCondition = truthy(checked)
    → interaction 이름 → bindings + slot prop 삭제

10. rewritePropConditions() + rewriteStateDynamicStyles()
    → 제거된 state 참조를 checked 조건으로 재작성
```

---

#### SwitchHeuristic

**핵심: 토글 prop 자동 감지 + 이벤트 바인딩**

**apply() 실행 순서:**

```
1. addOnChangeProp()
   → onChange: (active: boolean) => void 추가

2. Toggle prop 탐색
   → ctx.props에서 active/on/toggled 패턴 검색
   → 없으면 active: boolean 자동 생성 (sourceKey: "")

3. Disable prop 탐색
   → ctx.props에서 disable/disabled 패턴 검색

4. Root bindings 설정
   → attrs.onClick = () => onChange?.(!active)
   → attrs.disabled = {prop: disableProp.name} (있을 때만)

5. addDisableDynamicStyles() (disable prop이 있을 때)
   → styles.dynamic 추가: eq(disable, "true") → { opacity: 0.5, cursor: "not-allowed" }
```

---

### 입력 컴포넌트

#### InputHeuristic

**핵심: Boolean 가시성 제어를 String prop으로 승격**

**apply() 실행 순서:**

```
1. root.semanticType = "input"

2. applyChildSemanticTypes() (재귀)
   TEXT 분류 기준:
     characters === "|"              → "caret"
     이름이 /placeholder|hint|guide/ → "placeholder"
     이름이 /label/                  → "label"
     이름이 /helper|error|message/   → "helper-text"
     색상이 회색 (0.4 < r=g=b < 0.7) → "placeholder"
     그 외                           → "label"

   INSTANCE: 이름이 /icon|search|clear|eye/ 또는 ≤32px → "icon"
   RECTANGLE/LINE: 너비 ≤3 && 높이 ≥ 너비×5          → "caret"
   FRAME/GROUP: 자식에 placeholder/caret 있으면       → "input-area"

3. detectLabelAndHelperText() (직계 자식 순회)
   각 자식 노드:
     visibleCondition에서 prop 이름 추출
     → 매칭되는 boolean prop 찾기
     → sourceKey가 /label/i         → stringPropName = "label"
     → sourceKey가 /guide|helper/i  → stringPropName = "helperText"
     → TEXT 내용 추출 (defaultValue로 사용)

   변환:
     boolean "showLabel" 제거
     → string "label" 추가 (defaultValue: TEXT 내용)
     → TEXT.bindings.content = {prop: "label"}
     → 부모 노드의 visibleCondition 제거
```

---

#### SearchFieldHeuristic

**핵심: Input 확장 — TEXT를 `<input>` 요소로 변환**

**apply() 실행 순서:**

```
1. addOnChangeProp()
   → onChange: (value: string) => void 추가
   → 기존 onChange가 있으면 signature 교체

2. markPlaceholderInput() (재귀)
   → componentPropertyReferences.characters 있는 TEXT 탐색
   → semanticType = "search-input" (→ <input> 렌더링)
   → bindings.attrs.onChange = (e) => onChange?.(e.target.value)

3. markClearButton() (재귀, insideActive 플래그 추적)
   → visibleCondition이 active 조건인 노드 내부 진입
   → INSTANCE 발견 시:
     bindings.attrs.onClick = () => onChange?.("")  (값 초기화)
```

---

#### DropdownHeuristic

**핵심: variant 상태를 내부 state 변수로 전환 (가장 복잡, 26 methods)**

**apply() 실행 순서 (12단계):**

```
 1. removeVariantProp("states")
    → states variant prop 제거

 2. convertStateDynamicToPseudo()
    → state dynamic → :hover/:active pseudo 변환

 3. removeListBooleanProps()
    → /^list\s*\d+$/i 패턴 boolean props 제거 (list1, list2, ...)

 4. removePropByPattern(/show\s*label/i) + clearConditionByProp()
    → Show Label prop 제거 + 관련 visibleCondition 정리

 5. setupTextProps()
    → "label" TEXT 탐색 → string prop + bindings.content 설정
    → "placeholder" TEXT 탐색 → string prop 설정
       bindings.content = {expr: "selectedValue || placeholder"}
       bindings.style.color = {expr: 'selectedValue ? "var(--Color-text-03-high)" : undefined'}

 6. setListVisibility()
    → list 컨테이너 탐색 (이름 "list")
    → visibleCondition = truthy(open)
    → styles: position:absolute, top:calc(100%+4px), left:0, width:100%, z-index:10
    → root: position:relative

 7. 스타일 정리 (6개 하위 단계):
    (a) convertActivePseudoToOpenCondition()
        → 각 노드의 :active pseudo → dynamic {condition: truthy(open)} 으로 이동

    (b) cleanTriggerOpenDynamic()
        → trigger의 open dynamic에서 __raw만 보존, 레이아웃 속성 제거

    (c) consolidateTriggerBorder()
        → trigger 자식의 border를 추출 → 부모 trigger로 통합
        → 자식에서 border/background 제거, 부모에 border+background+border-radius 설정

    (d) cleanHoverPseudo() (재귀)
        → :hover에서 레이아웃 속성 제거 (width, height, padding, gap, flex, font 등)
        → border shorthand → border-color만 추출
        → 빈 :hover → 삭제

    (e) moveTriggerChildHoverToParent()
        → 자식의 :hover border-color → 부모 trigger의 :hover로 이동
        → 자식 :hover에서 border/background 제거

    (f) setIconHoverFill()
        → icon INSTANCE의 mergedNodes에서 SVG fill 색상 추출
        → 2개 이상 다른 fill 발견 시:
          trigger :hover pseudo에 __raw 추가: "svg path { fill: #color; }"
          open dynamic에도 동일한 __raw 추가/병합

 8. 조건 재작성
    → pruneUnmappedVariantNodes(): conditionMap에 없는 variant 노드 제거
    → rewritePropConditions(): 제거된 states 참조 재작성
    → rewriteStateDynamicStyles(): dynamic 스타일의 states 조건 재작성

 9. setClickBinding()
    → trigger 탐색 (list, label이 아닌 첫 자식)
    → trigger.bindings.attrs.onClick = () => setOpen(!open)

10. ensureOnChangeProp() + ensureDefaultValueProp()
    → onChange: (value: string) => void 추가
    → defaultValue: string 추가

11. createArraySlot()
    → list 컨테이너의 INSTANCE 자식 수집 (≥2개)
    → 각 INSTANCE: bindings.content 삭제, visibleCondition 삭제
    → mergeTextStylesIntoInstances():
      TEXT 자식의 color/font 스타일 → INSTANCE wrapper로 합치기
      hover background → :hover pseudo로 이동
      cursor:pointer 추가, children 비우기
    → ArraySlotInfo 반환:
      slotName: "items"
      itemProps: [{name: "id", type: "string"}, {name: "content", type: "string"}]
      onItemClick: "setSelectedValue(item.content); setOpen(false); onChange?.(item.content)"

12. 정리
    → pruneNodesByConditionProp(/^list\d+$/i): orphan list 노드 제거
    → pruneOrphanRootChildren(): label/list/trigger/조건부 노드만 보존
    → removeRootOpenGap(): open dynamic에서 gap 제거 (레이아웃 흔들림 방지)
```

**stateVars 출력:**
```
[
  { name: "open", setter: "setOpen", initialValue: "false" },
  { name: "selectedValue", setter: "setSelectedValue", initialValue: 'defaultValue ?? ""' }
]
```

---

#### SegmentedControlHeuristic

**핵심: Tab boolean props → options 배열 + loop template**

**apply() 실행 순서:**

```
1. 컨테이너 탐색
   → 이름에 "container" 포함된 자식, 없으면 root 사용

2. Loop 설정
   → loopTarget.loop = { dataProp: "options", keyField: "value" }

3. transformTabPropsToOptions()
   → tab*/item*/icon 패턴의 slot/boolean props 수집 → 제거
   → options prop 추가:
     type: "function" (Array<{label, value, icon?}> 시그니처)

4. addOnChangeProp()
   → onChange: (value: string) => void 추가

5. buildTemplateStructure()
   → 첫 Tab의 스타일 보존
   → template 구조 생성:
     Template (FRAME)
       ├─ ContentWrapper (FRAME)
       │  ├─ IconWrapper → bindings.content = {ref: "item.icon"}
       │  │               → visibleCondition = truthy(item.icon)
       │  └─ Label (TEXT) → bindings.content = {ref: "item.label"}
       └─ bindings.attrs.onClick = () => onChange?.(item.value)
   → containerNode.children을 template 배열로 교체

6. addSelectedValueProp()
   → selectedValue: string 추가
```

---

### 표시 컴포넌트

#### ChipHeuristic

**핵심: 경량 슬롯 감지**

**apply() 실행 순서:**

```
1. root.semanticType = "button"

2. traverseAndDetectTextSlots() (재귀)
   TEXT 슬롯 감지 3단계 우선순위:
     (1) componentPropertyReferences.characters → 기존 prop에 bindings.content 설정
     (2) extractTextSlotInfo(): variant 간 텍스트 차이 → 새 string prop + binding
     (3) placeholder 감지: 레이어 이름 === TEXT 내용 → 새 string prop + binding

3. traverseAndDetectInstanceSlots() (재귀)
   → shouldBeInstanceSlot(): variant 간 존재 차이 감지
   → slot prop 추가 + bindings.content 설정
   → slot의 children은 탐색하지 않음 (shouldSkipChildren = true)
```

---

#### BadgeHeuristic

**핵심: INSTANCE override 정규화 — UINodeConverter 실행 전에 처리**

**apply() 실행 순서:**

```
1. normalizeInstanceOverrides() (재귀)
   INSTANCE 노드의 metadata.instanceOverrides 순회:
     /^_\d+Text$/ → "count"로 rename
       → count prop 추가: { type: "string", name: "count", defaultValue: override.value }
     /Bg$/ → 제거 (background override 불필요)
     기타 → 유지

   * UINodeConverter 실행 전이므로, 정규화된 override가 자연스럽게 prop으로 변환됨
```

---

#### ProfileHeuristic

**핵심: 이미지 + hover overlay 이중 렌더링**

**apply() 실행 순서 (9단계):**

```
 1. addImageSrcProp()
    → imageSrc: string 추가
    → root.bindings.style.backgroundImage = {expr: "imageSrc ? `url(${imageSrc})` : undefined"}

 2. convertTextToStringProp()
    → text: boolean prop 찾기
    → TEXT 내용 추출 (폴백: "홍")
    → boolean → string으로 교체 (defaultValue: 추출된 텍스트)
    → 모든 TEXT 자식: bindings.textContent = {prop: "text"}

 3. fixTextVisibleCondition()
    → 모든 TEXT: visibleCondition = truthy(text) (state 의존 제거)

 4. injectTextStyles()
    → Figma에서 font 속성 추출: fontSize, fontWeight, fontFamily, letterSpacing, lineHeight, color
    → styles.base에 주입:
      display:flex, align-items:center, justify-content:center
      position:absolute, inset:0
      opacity:0, transition:opacity 0.15s, z-index:2
    → Size variant별 font-size dynamic 추가:
      eq(size, "M") → { font-size: "14px" }, eq(size, "L") → { font-size: "16px" }

 5. removeStatesProp()
    → states/state prop 제거
    → removeStatesDynamic() (재귀):
      eq(states, X) 단독 → 엔트리 제거
      AND(states=default, size=X) → size 조건만 유지
      AND(states≠default, size=X) → 엔트리 제거
      states 무관 → 유지

 6. stripImageFromBackground()
    → base/dynamic의 background에서 url(...) 제거
    → background-size:cover, background-position:50%, background-repeat:no-repeat 설정

 7. addHoverEffect()
    → root.styles.base["__raw"] 추가:
      ::after { content:'', position:absolute, inset:0, background:rgba(0,0,0,0.25), opacity:0, transition, z-index:1 }
      &:hover::after { opacity:1 }
      &:hover > span { opacity:1 }

 8. fixPlaceholderCondition()
    → FRAME 자식: eq(states, "none") → not(truthy(imageSrc)) 변환

 9. fixPlaceholderPosition()
    → placeholder FRAME: position/left/top 제거, width/height:100% 설정
    → background에서 lightgray 제거
    → dynamic에서 width/height 제거
```

---

### 컨테이너 컴포넌트

#### FrameHeuristic

**핵심: children slot 설정 (가장 단순)**

**apply() 실행 순서:**

```
1. children prop 추가 (없으면)
   → { type: "slot", name: "children", sourceKey: "children" }

2. root.childrenSlot = "children"
   → JsxGenerator가 {children} 렌더링
```

대상 패턴: frame, card, container, wrapper, panel, box 이름 매칭

---

### GenericHeuristic (폴백)

다른 Heuristic에 매칭되지 않을 때 사용. **기존 props를 제거하지 않고** 슬롯만 추가한다.

**apply() 실행 순서:**

```
1. detectAndAddBooleanVariantSlots()
   → True/False variant props → slot props 생성
   → (TODO: INSTANCE visibility 조건 미구현)

2. detectAndAddTextSlots() (재귀)
   우선순위:
     (1) componentPropertyReferences.characters → 기존 prop 바인딩
     (2) extractTextSlotInfo(): variant 간 텍스트 차이 → 새 string prop + binding

3. detectAndAddInstanceSlots() (재귀)
   → isExposedInstance 플래그 또는 variant 간 존재 차이 감지
   → slot prop 추가 + bindings.content 설정
   → slot 노드의 children은 탐색하지 않음 (중첩 slot 방지)
```

---

### Heuristic 전체 비교

| Heuristic | Props 제거 | Props 추가 | 복잡도 |
|-----------|-----------|-----------|--------|
| **Button** | state | TEXT slots | 중간 |
| **Fab** | states | — | 중간 |
| **Link** | — | — | 최소 |
| **Checkbox** | state, on/off | checked, onCheckedChange, disable | 높음 |
| **Radio** | state, tight | checked, onChange, disable | 중간 |
| **Switch** | — | onChange, active, disable | 낮음 |
| **Input** | showLabel, showGuide | label, helperText | 중간 |
| **SearchField** | — | onChange | 낮음 |
| **Dropdown** | states, list\*, showLabel | label, placeholder, items, onChange, defaultValue | 높음 |
| **SegmentedControl** | tab\*, icon | options, onChange, selectedValue | 높음 |
| **Chip** | — | TEXT/INSTANCE slots | 낮음 |
| **Badge** | — | count | 낮음 |
| **Profile** | states, text(bool→str) | imageSrc, text | 높음 |
| **Frame** | — | children | 최소 |
| **Generic** | — | slot props | 낮음 |

---

## Stage 4: 스타일 분해 — Variant에서 Prop별 소유권으로

이 단계가 파이프라인의 핵심이다. 108개 variant의 스타일 조합에서 **각 CSS 속성이 어떤 prop에 의해 제어되는지** 역추론한다.

3개 모듈이 순차적으로 동작한다:

```
StyleProcessor      → variant CSS를 base/dynamic/pseudo로 분류
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
│   ├── separateStateVariants(variantStyles)   → baseVariants / pseudoVariants 분리
│   ├── extractCommonStyles(baseVariants)      → base (모든 variant 공통)
│   ├── extractDynamicStyles(baseVariants, base) → dynamic (variant별 차이)
│   └── extractStateDynamicEntries(pseudoVariants, base) → state 조건 엔트리
│
└── applyPositionStyles(node)
    └── 자식에 position:absolute + left/top 계산
```

#### State 감지 및 분리

variant 이름에서 State 값을 추출하여 `baseVariants`와 `pseudoVariants`로 분리한다:

```
extractStateFromVariantName("Size=Large, State=Hover")
  → 정규식: /State=([^,]+)/i 또는 /states=([^,]+)/i
  → "Hover"

separateStateVariants(variantStyles):
  각 variant:
    state 추출 → STATE_TO_PSEUDO[state] 존재?
    ├── 예 → pseudoVariants (Hover, Active 등)
    └── 아니오 → baseVariants (Normal, Loading 등)
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

#### extractStateDynamicEntries — 공통 diff vs 비공통 diff

pseudo 변환 대상 variant(Hover, Active 등)의 스타일을 base 대비 diff로 분리한다:

```
extractStateDynamicEntries(pseudoVariants, base):
│
├── [1] state 값별 그룹핑
│   "Hover" → [
│     { variantName: "Size=Large, State=Hover", cssStyle: {...} },
│     { variantName: "Size=Small, State=Hover", cssStyle: {...} }
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
│   ├── [2-3] 공통 diff → 단일 state 조건 엔트리
│   │   { condition: eq(states, "Hover"), style: { backgroundColor: "#F00" } }
│   │
│   └── [2-4] 비공통 diff → per-variant 엔트리
│       variant "Size=Large, State=Hover":
│         nonCommonDiff = { color: "#FFF" }  (commonDiff 키 제거)
│         condition = AND(eq(size, "Large"), eq(states, "Hover"))
│                                            ↑ state 조건 포함 강제
│
└── 결과 dynamic:
    [
      { condition: eq(states, "Hover"), style: { backgroundColor: "#F00" } },
      { condition: AND(eq(size, "Large"), eq(states, "Hover")), style: { color: "#FFF" } },
      { condition: AND(eq(size, "Small"), eq(states, "Hover")), style: { color: "#000" } }
    ]
```

**비공통 diff 보존이 핵심**: 이를 버리면 `size+state`가 공동 제어하는 CSS(`color`)가 소실된다.

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

#### 핵심 개념: 일관성(Consistency)

> prop P가 CSS 속성 C를 "제어"한다 = P의 같은 값 그룹 내에서 C의 값이 항상 동일하다.

```
size=M인 모든 variant에서 fontSize가 항상 "14px"
size=L인 모든 variant에서 fontSize가 항상 "16px"
→ "size"가 fontSize를 제어 ✓

size=M인 variant에서 background가 "blue" 또는 "transparent" (style에 따라 다름)
→ "size"는 background를 제어하지 않음 ✗
```

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

2차: Compound prop 일관성 (bestSingleRatio ≤ 50% 일 때만)
    bestSingleRatio = max(각 prop의 일관적 그룹 수 / 전체 그룹 수)
    → 과반수 이하 시 compound 시도
    → 2-prop 조합 먼저, 3-prop 조합 순서
    → isCompoundConsistent() 통과 시 "propA+propB" 반환

3차: Best-fit (폴백)
    일관적 그룹 수가 가장 많은 prop 선택
    → 불일치 그룹은 collectDiagnostics()로 기록
```

#### isGroupConsistent — 그룹 내부 일관성

prop의 특정 value에 해당하는 모든 entry의 CSS 값이 동일한지 검증:

```
isGroupConsistent(group):
  1. present + absent 혼합 → false (CSS가 있거나 없거나 불통일)
  2. present 1개 이하 → true (자동 일관)
  3. 모든 present 값 동일 (normalizeCssValue 적용) → true
  4. 다른 값 존재 → false
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

### PropDefinition (내부)

```typescript
type PropDefinition =
  | VariantPropDefinition     // options: string[]
  | BooleanPropDefinition     // extraValues?: string[]
  | SlotPropDefinition        // componentName?, hasDependency?, componentId?, nodeId?
  | StringPropDefinition
  | FunctionPropDefinition    // functionSignature?: string

interface PropBase {
  name: string;        // React prop 이름 (camelCase)
  type: PropType;      // 판별자
  defaultValue?: string | boolean | number;
  required: boolean;   // 항상 false
  sourceKey: string;   // Figma 원본 키 (""이면 합성 prop)
}
```

### ConditionNode (조건 표현)

```typescript
type ConditionNode =
  | { type: "eq"; prop: string; value: string }      // prop === value
  | { type: "neq"; prop: string; value: string }     // prop !== value
  | { type: "truthy"; prop: string }                  // !!prop
  | { type: "and"; conditions: ConditionNode[] }      // A && B
  | { type: "or"; conditions: ConditionNode[] }       // A || B
  | { type: "not"; condition: ConditionNode }          // !A
```

### Bindings (노드-prop 연결)

```typescript
type BindingSource = { prop: string } | { ref: string } | { expr: string };

interface Bindings {
  attrs?: Record<string, BindingSource>;    // 속성 + 이벤트
  content?: BindingSource;                   // 텍스트/슬롯 콘텐츠
  style?: Record<string, BindingSource>;    // CSS 속성
}
```

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
| `processors/StyleProcessor.ts` | 4 | variant 스타일 → base/dynamic/pseudo 분류 |
| `processors/utils/rewritePropConditions.ts` | 3-4 | State → pseudo-class 변환 + compound 감지 |
| `style-strategy/DynamicStyleDecomposer.ts` | 4 | prop별 CSS 소유권 분석 + 균일 속성 제거 |
| `generators/PropsGenerator.ts` | 5 | TypeScript interface 생성 |
| `generators/JsxGenerator.ts` | 5 | JSX 렌더링 + props 사용 |
| `post-processors/ComponentPropsLinker.ts` | Post | INSTANCE override → 의존성 props 연결 |
| `adapters/PropsAdapter.ts` | Post | 내부 → 공개 API 변환 |
