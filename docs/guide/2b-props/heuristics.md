# Props Heuristics (Stage 3)

> Stage 1-2는 [Props 추출 가이드](extraction.md), Stage 4-5는 [스타일 분해 가이드](style-decomposition.md)를 참조하세요.

## Heuristic이 풀어야 하는 문제

Stage 1-2까지 완료되면, 컴포넌트의 **구조**(어떤 노드들이 있고 variant별로 어떻게 다른지)는 확정된다. 하지만 이 시점의 트리는 아직 "Figma의 시각적 구조"일 뿐이다.

**문제**: Figma에서 Button, Checkbox, Dropdown은 모두 "FRAME 안에 INSTANCE와 TEXT가 있는 것"이다. 하지만 React에서 이 셋은 완전히 다르다:

```
Figma (동일한 구조):             React (완전히 다른 의미):
┌─ FRAME ──────────┐
│ [INSTANCE] [TEXT] │  → Button?    → <button onClick={...}> + :hover/:active pseudo
│                   │  → Checkbox?  → checked boolean + onCheckedChange + SVG fill 변환
│                   │  → Dropdown?  → useState(open) + 배열 슬롯 + position:absolute
└───────────────────┘
```

Heuristic은 이 **의미의 갭**을 메운다. 컴포넌트 이름, prop 구조, 자식 패턴을 분석해서 가장 적합한 UX 패턴을 선택하고, 그에 맞게 트리를 변환한다.

## 점수 기반 매칭

14개 Heuristic이 등록되어 있고 (+ GenericHeuristic 폴백, ModuleHeuristic 별도 호출), 각 Heuristic이 `score()`로 점수를 매긴다. **최고 점수 ≥ 10**이면 해당 Heuristic이 선택되어 `apply()`를 실행한다.

왜 점수 기반인가? — 컴포넌트 이름만으로는 판별이 모호한 경우가 있다. "ActionButton"이 Button인지 FAB인지, "SelectField"가 Dropdown인지 Input인지. 여러 신호(이름 패턴, State prop 유무, 자식 구조)를 합산해서 가장 적합한 패턴을 선택한다.

## 공통 변환 패턴

모든 Heuristic의 apply()는 세 가지 변환 유형의 조합이다:

| 유형 | 하는 일 | 왜 필요한가 |
|------|--------|------------|
| **Prop 재구성** | Figma variant prop을 React 의미에 맞는 prop으로 교체 | Figma의 `State = ["Normal", "Hover"]`는 React에서 prop이 아니라 CSS pseudo-class여야 함 |
| **트리 변환** | 노드에 semanticType, bindings, visibility 설정 | FRAME이 `<button>`이 되려면 semanticType을 부여해야 함 |
| **스타일 이동** | dynamic/pseudo 스타일 재배치 | State=Hover의 스타일을 `:hover` pseudo-class로 옮겨야 CSS가 자연스러움 |

공통 실행 패턴:
```
1. 기존 variant prop 제거 (ctx.props.splice)
   — State prop은 React prop이 아니라 CSS pseudo로 처리되므로 제거
2. 조건 맵 구축: variant 옵션 → 새 조건
   — "Hover" → :hover, "Disabled" → :disabled 등 매핑 테이블 생성
3. 트리 전체 조건 재작성 (rewritePropConditions, rewriteStateDynamicStyles)
   — 제거한 prop을 참조하던 모든 조건을 새 조건으로 치환
4. 새 prop 추가 (ctx.props.push)
   — checked, onChange 등 React 의미에 맞는 prop 추가
```

---

### 상호작용 컴포넌트

이 그룹의 공통 문제: Figma에서 State variant(Normal/Hover/Active/Disabled)로 표현된 시각적 상태를 React에서는 CSS pseudo-class(`:hover`, `:active`, `:disabled`)로 처리해야 한다. 사용자가 State를 prop으로 전달하는 게 아니라, 브라우저가 자동으로 적용한다.

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

이 그룹의 공통 문제: Figma에서 체크/선택 상태는 variant(State=Checked/Unchecked)로 표현되지만, React에서는 `checked` boolean prop + `onChange` 이벤트 핸들러로 제어해야 한다. 또한 체크 표시 아이콘(dot, checkmark)은 `checked` 조건에 따라 가시성이 바뀌어야 한다.

#### CheckboxHeuristic

**핵심: 여러 variant를 단일 `checked` 상태로 통합**

**apply() 실행 순서 (10단계):**

```
 1. removeAndDetectStateProp()
    → state/states prop 찾기 → 제거
    → 각 옵션을 패턴 매칭:
      checked/active/selected/on → "checked"
      indeterminate/partial      → "indeterminate"
      disabled/disable           → "disable"

 2. removeOnOffProp()
    → /^on\/?off$/i 패턴의 boolean prop 제거, 이름 반환

 3. addCheckedProp() + addOnCheckedChangeProp() + addDisableProp()
    → checked: boolean 추가 (indeterminate 감지 시 extraValues)
    → onCheckedChange: (checked: boolean | "indeterminate") => void 추가
    → disable: boolean 추가

 4. Root bindings 설정
    → attrs.onClick = () => onCheckedChange?.(!checked)
    → attrs.disabled = {prop: "disable"}

 5. convertIconSlots()
    → 재귀 순회: slot binding된 INSTANCE 탐색
    → 이름에 "check" 포함 (checkbox 제외)
      → bindings.content 삭제, visibleCondition = eq(checked, true)
    → 이름에 "lineHorizontal"/"indeterminate" 포함
      → bindings.content 삭제, visibleCondition = eq(checked, "indeterminate")
    → 이름에 "interaction" 포함 → bindings + slot prop 삭제

 6. renamePropInConditions() (onOffProp이 있을 때)
    → 트리 전체에서 onOff prop 참조를 "checked"로 rename

 7. convertStateDynamicToPseudo()
    → DISABLE_PSEUDO_MAP: { disable: ":disabled", disabled: ":disabled" }
    → disable 관련 dynamic → :disabled pseudo로 이동

 8. rewritePropConditions() + rewriteStateDynamicStyles()
    → 제거된 state prop의 모든 참조를 checked/disable 조건으로 재작성

 9. refineIconConditions()
    → check icon이 active+partial 모두에서 보여지는 문제 보정
    → "check" 이름 → 강제로 eq(checked, true)로 수정

10. convertSvgPropsToCss() + normalizeBorderRadiusForSvgVariants()
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

 5.5. undoCheckedPseudoStyles()
      → StyleProcessor가 Active/Selected를 :active/:visited pseudo로 변환한 것 되돌리기
      → visibleCondition이 있는 노드: pseudo → base로 이동 (checked-only 렌더링)
      → visibleCondition이 없는 노드: pseudo → dynamic(truthy(checked))으로 이동

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

10. addTextProp()
    → TEXT 노드가 있으면 text prop에 bindings.content 연결
    → TEXT 노드가 없어도 text?: string prop 추가 (라디오는 관례적으로 라벨 필요)

11. rewritePropConditions() + rewriteStateDynamicStyles()
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

5. addActiveDynamicStyles()
   → active prop 기반 동적 스타일 생성

6. addDisableDynamicStyles() (disable prop이 있을 때)
   → styles.dynamic 추가: eq(disable, "true") → { opacity: 0.5, cursor: "not-allowed" }
```

---

### 입력 컴포넌트

이 그룹의 공통 문제: Figma에서 입력 필드의 label이나 helperText는 boolean prop(`ShowLabel=True/False`)으로 가시성을 제어한다. 하지만 React에서는 `label="이메일"`처럼 **string prop**으로 전달하는 게 자연스럽다 — 문자열이 있으면 보이고, 없으면 안 보이는 것이다.

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
     → sourceKey가 /guide|helper|error|message/i  → stringPropName = "helperText"
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

이 그룹은 상태 변환이 거의 없다. 대신 **슬롯 감지**(어떤 부분이 외부에서 주입 가능한 콘텐츠인지)와 **override 정규화**(Figma의 INSTANCE override를 React prop으로 변환)가 주 관심사다.

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

어떤 Heuristic도 threshold(10)을 넘지 못하면 GenericHeuristic이 사용된다. 이 폴백이 있기 때문에 등록되지 않은 컴포넌트 패턴이라도 **최소한의 슬롯 감지와 props 노출**은 보장된다. 기존 props를 제거하지 않고 슬롯만 추가한다.

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
