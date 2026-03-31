# @urock-inc/design-system-tailwind v0.21.0 컴포넌트 검토 리포트

> 검토일: 2026-03-31
> 검토 대상: v0.21.0 전체 컴포넌트 (14개)

---

## 🔴 Critical (기능 깨짐)

### 1. Switch — `active` 기본값이 문자열 `"false"`

```js
const { active = "false" } = props;  // string, boolean이어야 함
onChange?.(!active);  // !"false" = false → 첫 클릭에 꺼진 상태 유지
```

첫 클릭 시 `!"false"` = `false`가 되어 꺼진 상태가 유지됨. 두 번째 클릭부터 정상 동작. 기본값이 `false`(boolean)여야 함.

### 2. Checkbox — indeterminate에서 true로 전환 불가

```js
onCheckedChange?.(!checked)  // !"indeterminate" = false
```

indeterminate 상태에서 클릭 시 `!"indeterminate"` = `false`로만 전환됨. indeterminate → true 전환 경로가 없음.

### 3. Toast — 텍스트 하드코딩

```js
"라이센스가 확인되었습니다"  // 한국어 고정
```

`text` prop 없음. 토스트 메시지를 변경할 수 없어 상용 사용 불가.

### 4. Tooltip — 텍스트 하드코딩 + 오타

```js
"tootip!"  // "tooltip"이 아님
```

`text`/`children` prop 없음. 툴팁 내용을 커스터마이즈할 수 없음.

---

## 🟡 High (기능 제한/미구현)

### 5. Btnsicon — `style`, `tone` prop 무시

```js
const { style = "filled", tone = "blue", ... } = props;
// style, tone을 CVA에 전달하지 않음 → 모든 조합이 같은 모양
```

### 6. Btnsbtn — `leftIcon`이 loading 상태에서만 렌더링

```js
state === "loading" && (size === "M" || size === "S") && leftIcon && (...)
```

`state="default"`에서 leftIcon이 무시됨. 아이콘+텍스트 버튼 조합 불가.

### 7. Btnsbtn — `filled` + `basic` compoundVariant 누락

compoundVariants에 `{ style: "filled", tone: "basic" }` 조합 없음. 배경색/텍스트색 미적용.

### 8. Dropdowngeneric — 외부 클릭 시 닫히지 않음

```js
onClick: () => setOpen(!open)  // dropdown 내부 클릭만 토글
```

`useEffect`로 외부 클릭을 감지하는 로직 없음. 열린 상태에서 다른 곳을 클릭해도 닫히지 않음.

### 9. Dropdowngeneric — CSS 클래스 6개 복붙 (데드코드)

```js
dropdowngenericlistWrapperClasses    // 사용됨
dropdowngenericlistWrapperClasses_2  // 미사용 (동일 복사)
dropdowngenericlistWrapperClasses_3  // 미사용 (동일 복사)
dropdowngenericlistWrapperClasses_4  // 미사용 (동일 복사)
dropdowngenericlistWrapperClasses_5  // 미사용 (동일 복사)
dropdowngenericlistWrapperClasses_6  // 미사용 (동일 복사)
```

### 10. Dropdowngeneric — hover 시 SVG 색상 변경 동작 안 함

```js
hover:[__raw:svg_path_{_fill:_#628CF5;_}]
```

Tailwind에서 지원하지 않는 문법. hover 시 아이콘 색상 변경이 실제로 동작하지 않음.

### 11. Badges — count "12" 하드코딩

```js
_jsx("span", { children: "12" })  // prop 없음
```

독립 `Badges` 컴포넌트는 count를 변경할 수 없음. (`Badgesicon` 내부의 `Badges`는 count prop 있음)

### 12. Frame — `stroke`, `customType` prop 대부분 무시

```js
(color === "blue" && stroke === "outlined" && customType === "type2")
```

위 조합에서만 배경 blur 효과 추가됨. 나머지 모든 조합에서는 `stroke`, `customType`이 아무런 시각적 영향 없음.

---

## 🟠 Medium (접근성/품질)

### 13. Checkbox, Radio, Switch — ARIA 속성 없음

| 컴포넌트 | 필요한 속성 | 현재 |
|---------|-----------|------|
| Checkbox | `role="checkbox"`, `aria-checked` | 없음 |
| Radio | `role="radio"`, `aria-checked` | 없음 |
| Switch | `role="switch"`, `aria-checked` | 없음 |

스크린 리더에서 전부 일반 `<button>`으로 인식됨.

### 14. Tooltip — SVG fill 하드코딩

```js
fill: "#628CF5"  // 4개 position 모두 인라인으로 하드코딩
```

className에서는 `var(--Color-primary-01)`을 사용하지만, SVG path의 fill은 하드코딩. 테마 변경 시 불일치 발생.

### 15. Statesenabled / Stateshover — 디자인 프리뷰 전용

prop 없이 고정 렌더링되는 정적 컴포넌트. 상용 UI 컴포넌트가 아니라 Figma 자동 생성된 상태 프리뷰로 보임. export에서 제외하거나 문서에 명시 필요.

### 16. Switch — hover 시 width 충돌

```js
// 부모 컨테이너, 배경1, 배경2 모두 동시에 hover:w-[54px] 적용
switchClasses:               "hover:w-[54px]"
switchRectangle6574Classes:  "hover:w-[54px]"
switchRectangle6576Classes:  "hover:w-[54px]"
```

부모와 자식이 동시에 크기 변경되면서 레이아웃 깨질 수 있음.

### 17. Frame — 고정 크기 240x240

```js
"w-[240px] h-[240px]"  // CVA 기본값
```

children으로 내용을 넣어도 크기 고정. 레이아웃 컨테이너로 활용 불가.

---

## 요약

| 심각도 | 건수 | 주요 컴포넌트 |
|--------|------|-------------|
| 🔴 Critical | 4 | Switch, Checkbox, Toast, Tooltip |
| 🟡 High | 8 | Btnsicon, Btnsbtn, Dropdowngeneric, Badges, Frame |
| 🟠 Medium | 5 | Checkbox/Radio/Switch (ARIA), Tooltip (SVG), Frame (크기) |
| **합계** | **17** | |

## 상용 투입 가능 판정

| 컴포넌트 | 판정 | 비고 |
|---------|------|------|
| Chips | ✅ 사용 가능 | 경미한 토큰 네이밍 불일치 |
| Btnsbtn | ⚠️ 조건부 | filled+blue/red 정상, basic 조합 누락, leftIcon 제한 |
| Badgesicon | ✅ 사용 가능 | count prop 정상 동작 |
| Checkbox | ❌ 수정 필요 | indeterminate 전환 버그 |
| Radio | ⚠️ 조건부 | 기능 정상, ARIA 없음 |
| Switch | ❌ 수정 필요 | 첫 클릭 버그, ARIA 없음 |
| Dropdowngeneric | ❌ 수정 필요 | 외부 클릭 미지원 |
| Toast | ❌ 수정 필요 | 텍스트 커스터마이즈 불가 |
| Tooltip | ❌ 수정 필요 | 텍스트 커스터마이즈 불가, 오타 |
| Btnsicon | ❌ 수정 필요 | style/tone 미반영 |
| Frame | ⚠️ 조건부 | 고정 크기, prop 대부분 무시 |
| Badges | ❌ 수정 필요 | count 하드코딩 |
| Statesenabled | ➖ 해당없음 | 프리뷰 전용 |
| Stateshover | ➖ 해당없음 | 프리뷰 전용 |
