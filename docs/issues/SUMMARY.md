# Issue Summary

> 이슈 문서(35건) + git 히스토리 미문서화 수정(82건)을 통합한 전체 요약본.
>
> **참고**: ISSUE-001~033은 레거시 파이프라인 기준으로 작성됨. 문제의 본질과 해결 원리는 유효하지만, 파일 경로와 클래스명은 현재 코드와 다를 수 있음. 번호 없는 항목(`—`)은 git 커밋에서 추출한 미문서화 수정.

---

## Variant 병합 & 노드 매칭

**핵심 문제**: 여러 variant의 독립된 트리를 하나로 합칠 때, "같은 노드"를 정확히 식별해야 한다. 위치, 크기, 타입이 모두 variant마다 다를 수 있어 단순 비교가 불가능하다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **019** | variant 노드가 캔버스 절대좌표로 배치되어 위치 비교 실패 | COMPONENT_SET 자식은 캔버스 좌표를 가짐 | variant root 감지 → position 0,0으로 보정 |
| **026** | 자식 수가 다른 variant 간 구조 매칭 실패 (3 vs 2) | 구조 비교가 정확 일치 요구 | prefix 매칭 허용 |
| **016** | ArraySlot parentId가 병합 후 root ID와 불일치 | 원본 variant ID 저장 → 병합 시 대표 ID로 변경 | children ID로 폴백 매칭 |
| **033** | 병합 후 자식 순서가 Figma와 다름 | 자식을 단순 concat하여 순서 뒤섞임 | 평균 x좌표 기준 정렬 |
| **033** | 병합 시 FRAME의 layoutMode(HORIZONTAL) 소실 | 자식 평탄화 시 부모 속성 유실 | `inheritedLayoutMode` 필드 추가 |
| — | 동심원(22x22 vs 16x16)이 위치 동일해 같은 노드로 오매칭 | 3-way comparison이 크기 무시 | Shape 타입에 크기 비율 1.3x 초과 시 매칭 거부 |
| — | GROUP↔FRAME 타입 차이로 variant 병합 실패 | NodeMatcher가 컨테이너 타입 호환 미지원 | CONTAINER_TYPES(GROUP, FRAME) 추가 |
| — | hidden/overflow 노드가 정규화 기준이 되어 위치 왜곡 | mergedNodes[0]이 root 밖이면 정규화 값 오류 | 다른 mergedNode로 재시도 + 임계값 10px 완화 |
| — | visibility toggle 시 root 높이 2배 차이로 정규화 왜곡 | 높이 비율 극단 시 정규화 무의미 | root 기준 상대좌표(±5px) fallback 추가 |
| — | variant별 TEXT 이름이 달라 불필요한 prop 생성 | TEXT를 이름으로만 매칭 | 부모 아래 TEXT 1개면 이름 무관 매칭 |
| — | INSTANCE componentId 달라도 같은 COMPONENT_SET이면 병합 불가 | componentId만 비교 | componentSetId 기반 매칭 + variant 이름 파싱 |

---

## Props 추출 & 조건 처리

**핵심 문제**: Figma의 variant prop을 React prop으로 변환할 때, State 같은 시각적 상태는 CSS pseudo-class로 분리하고, 비시각적 상태(Loading 등)는 prop으로 유지해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **002** | State variant(Error, Insert 등)의 조건부 렌더링 미적용 | State 조건을 전부 건너뜀 | CSS 변환 가능/불가능 state 분리 + conditions 필드 추가 |
| **031** | CSS 변환 불가 state(Loading)가 삭제되어 조건 렌더링 실패 | pseudo 변환 시 비변환 값도 함께 삭제 | 변환 불가 값 있으면 State prop 유지 |
| **021** | prop 이름(type, name)이 HTML 속성과 충돌 | 컴파일러와 TestPage 간 rename 불일치 | HTML 충돌 속성 감지 + rename 통일 |
| **034** | 의존성에서 variant별 TEXT가 같은 prop으로 병합 | 대표 variant 1개만 컴파일 | PropDefinition에 nodeId/variantValue 추가 |
| **030** | 숫자로 시작하는 노드 이름이 JS SyntaxError 유발 | JS 식별자 규칙 위반 | `_` prefix 추가 |
| — | Radio Status variant가 pseudo-class 미변환 + text prop 미추출 | isStateProp에 "status" 미등록 | Status= 매칭 + TEXT→text prop 바인딩 |
| — | Radio check variant가 checked와 별도 생성, onClick 미연결 | check→checked rename 누락 | rename + 트리 전체 조건 참조 치환 |
| — | state pseudo 변환 시 visibility 조건 전부 삭제 | rewritePropConditions가 OR 조건 전부 삭제 | neq(state,"loading") 변환 + not 괄호 수정 |
| — | :disabled pseudo가 HTML disabled 속성 없이 작동 불가 | State prop 전체 제거 후 disabled binding 미생성 | disabled prop 유지 + binding 생성 |
| — | Platform prop이 breakpoint로 오인 제거 | BP_NAME_RE에 "platform" 포함 | platform 패턴 제거 |
| — | State prop이 잘못 제외됨 | PropsExtractor isStateProp 체크 | State prop 제외 로직 제거 |
| — | prop 이름이 Figma 원본과 다르게 생성 | show prefix 추가 로직 | 원본 기반 camelCase + 충돌 시 suffix |
| — | 제어 문자로 코드 파싱 오류 | 제어 문자 미제거 | normalizePropName에서 제어 문자 제거 |
| — | box-drawing 특수문자 visible ref에서 rename 누락 | propMap 조회 미일치 | #ID 제거 + ASCII 정규화 등록 |
| — | TEXT componentPropertyReferences.characters JSX 미바인딩 | GenericHeuristic에만 로직 있음 | TreeBuilder Step 6.5에 일괄 적용 |

---

## 슬롯 감지

**핵심 문제**: INSTANCE의 가시성/존재 여부를 React의 slot prop(`React.ReactNode`)으로 변환하되, 위치가 분리된 동일 컴포넌트를 잘못 합치지 않아야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **005** | FRAME 내 동일 컴포넌트 자식을 ArraySlot으로 잘못 감지 | 모든 노드 타입에 ArraySlot 감지 적용 | COMPONENT_SET/COMPONENT에만 제한 |
| **015** | 다른 variant(Left Neutral, Right Primary)가 하나의 ArraySlot으로 병합 | componentSetId로 그룹핑 | componentId(정확한 variant)로 그룹핑 |
| **025** | COMPONENT_SET 내 TEXT 노드가 slot으로 변환되지 않음 | TEXT slot 변환 로직 없음 | TEXT → slot 변환 + 중복 이름 처리 |
| **027** | slot prop의 조건부 스타일이 통째로 삭제됨 | slot 변환 시 dynamic 스타일 전부 제거 | 조건 변환 (`=== "True"` → `!= null`) + CSS 변수 생성 |
| **035** | 분리된 동일 컴포넌트(leftIcon, rightIcon)를 ArraySlot으로 잘못 감지 | componentId만 보고 연속성 미확인 | `areContiguous()` 체크 추가 |
| — | slot wrapper 하드코딩 inline style + TEXT 정렬 불량 | display:flex 등 하드코딩 | inline style 제거 + TEXT wrapper→span |
| — | slot 변환된 INSTANCE dependency가 번들에 잔존 | slot 변환 여부 미체크 | slot dependency 번들 제외 |
| — | slot prop이 compound key에서 "[object Object]" | ReactNode를 string index로 사용 | truthy/falsy→"true"/"false" 변환 |
| — | True/False 패턴 INSTANCE가 slot 미변환 | 패턴 감지 로직 없음 | variantName "PropName=True" 확인 |
| — | ButtonHeuristic TEXT slot 중복 생성 | layout 차이로 다른 위치 TEXT 각각 추가 | 이름+내용+variant 커버리지 체크 |
| — | slot wrapper SVG baseline 정렬 불일치 | flex centering 없음 | display:flex 센터링 추가 |
| — | GenericHeuristic이 기존 INSTANCE 바인딩 덮어씀 | 기존 binding 미체크 | content 존재 여부 확인 |

---

## 스타일 분류 & 분해

**핵심 문제**: 48개 variant의 CSS에서 각 속성이 어떤 prop에 의해 제어되는지 역추론해야 한다. 복합 prop(style+tone) 소유권, 균일 속성 제거, pseudo-class 변환이 핵심.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **001** | 3D variant(size×type×state)에서 prop 값 덮어쓰기 | prop별 CSS 소유권 분석 없음 | → ISSUE-035 DynamicStyleDecomposer로 해결 |
| **035** | 복합 prop(style+tone) CSS 소유권 미분해 | `findControllingProp()`이 단일 prop만 탐색 | 2/3-prop compound 감지 + compound owner 맵 |
| **022** | Color variant별 disabled 텍스트 색상이 모두 동일 | Color 인덱싱 없음 | Color+Disabled 조합 indexed conditional |
| **033** | State 스타일이 pseudo 대신 JS 조건으로 생성 | pseudo 분류 로직 없음 | `groupByState()` + `isStateSpecific()` |
| **003** | `flex: 1 0 0`과 padding 충돌 → 불균등 레이아웃 | flex-basis:0은 padding 무시 안 함 | flex-basis를 실제 Figma width로 교체 |
| — | pseudo variant가 dynamic entry로 생성 + opacity에 px 추가 | 분류 오류 + unitless 미처리 | pseudo에 직접 삽입 + unitless 속성 목록 |
| — | state pseudo 변환 후 compound variant 색상/크기 리그레션 | default state CSS 분리로 FD 역추론 소실 | compound+keptState 공존 시 미분리 |
| — | HUG 노드에 고정 width/height 보충 → 간격 확대 | layoutSizing HUG 미체크 | HUG 노드 bbox 크기 보충 제외 |
| — | flex cross-axis HUG 치수 누락 → width 0px 붕괴 | getCSSAsync 치수 생략 | bbox 보충 (main axis 제외) |
| — | Checkbox 항상 파란색 렌더링 | Unchecked 조건 누락 | state eq 조건 + rewriteStateDynamicStyles |
| — | CSS 변수명에 node ID 포함 | node ID 접미사 사용 | 이름 기반 네이밍 |
| — | CSS 속성 absent 시 prop 제어 미감지 | absent 엔트리 skip | absent 별도 시그니처 추적 |
| — | 모든 variant 동일 속성이 스타일 맵에 생성 | 후처리 없음 | removeUniformProperties |
| — | uniform 속성이 다른 dimension에 남아 색상 덮어씀 | base 존재 미체크 | base 있으면 override 제거 |
| — | DynamicStyleDecomposer 동일 condition 속성 덮어씀 | Object.assign 전체 덮어쓰기 | first-write per property |
| — | ExternalRefs-StyleProcessor 순환 의존 + first-write 버그 | 한 단계 혼재 | 2단계 분리 + merge 방식 수정 |
| — | slot 스타일에 variant 속성(fontSize) 포함 | 호출 시점 오류 | slot 타입 확정 후 호출 |
| — | non-auto-layout 자식에 absolute 미적용 | position 로직 없음 | applyPositionStyles 추가 |
| — | strokeAlign INSIDE padding 과보정 | getCSSAsync 위 중복 적용 | strokeWeight 차감 제거 |
| — | CSS 변수명 86자 과장 | 전체 경로 포함 | 마지막 3단어 → 58자 제한 |
| — | dependency CSS 변수명 충돌 | 같은 변수명 존재 | 컴포넌트 이름 prefix |

---

## 의존성 컴포넌트 처리

**핵심 문제**: 메인 컴포넌트가 INSTANCE로 참조하는 외부 컴포넌트를 올바르게 컴파일하고 통합해야 한다. override 전달, wrapper 크기, 중첩 의존성이 반복적 문제 영역.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **004** | INSTANCE wrapper에 width/height 없음 | Figma가 INSTANCE에 CSS 크기 미제공 | `absoluteBoundingBox`에서 크기 추출 |
| **009** | 같은 컴포넌트의 다른 INSTANCE가 동일 렌더링 | override 정보 미전달 | override → CSS 변수 + Props interface |
| **011** | enriched INSTANCE 자식이 삭제됨 | `I...` ID 노드 일괄 삭제 | `_enrichedFromEmptyChildren` 플래그 |
| **012** | 의존성 VECTOR 노드가 빈 div 렌더링 | vectorSvgs 미전달 | 루트 vectorSvgs 전달 |
| **014** | 중첩 의존성(Popup→Button) INSTANCE 렌더링 안 됨 | 4가지 복합 원인 | 의존성 문서 탐색 확장 + 각각 수정 |
| **018** | wrapper와 의존성 모두 background → 시각적 충돌 | 역할 혼동 | 의존성에서 visual style 분리 |
| **023** | visible override INSTANCE의 styleTree 병합 안 됨 | hidden children 시 병합 건너뜀 | 무관하게 병합 수행 |
| **024** | 메인 "Label"과 의존성 "label" 이름 충돌 → 무한 재귀 | 정규화 시 대소문자 소실 | `_` prefix + JSX 참조 재작성 |
| **032** | 새 파이프라인 INSTANCE wrapper 크기 누락 (004 재발) | 동일 문제 미처리 | `wrapperStyles` 추가 |
| — | dependencies 없는 INSTANCE가 빈 component 렌더링 | 모든 INSTANCE를 외부 참조 처리 | dependencies 유무 체크 |
| — | INSTANCE override 파이프라인 미구현 (새 파이프라인) | 파이프라인 없음 | ComponentPropsLinker + TreeManager 매핑 |
| — | dependency 번들링 시 import 중복/누락 | 정리 로직 없음 | bundleCode() import 수집→결합 |
| — | component 노드 children orphaned CSS 잔존 | children 미제거 | component+refId children 비우기 |
| — | 메인 button 안에 의존성 button 중첩 → HTML 오류 | 의존성 root가 button | button→div 변환 |

---

## SVG 렌더링

**핵심 문제**: Figma의 VECTOR/ELLIPSE/BOOLEAN_OPERATION 노드를 올바른 SVG로 렌더링하고, variant별 색상 변경을 지원해야 한다. fill→currentColor 변환의 적용 범위가 핵심.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **006** | 아이콘 색상이 State별 미변경 | SVG fill 하드코딩 | fill→currentColor + variant color 적용 |
| **013** | GNB 아이콘 윤곽선만 표시 | ELLIPSE background→color 변환 없음 | ELLIPSE 특수 처리 + fill→color |
| **017** | 배터리/신호 아이콘 빈 박스 | BOOLEAN_OPERATION 타입 누락 | SVG 수집 + vector 타입 처리에 추가 |
| **020** | 다색 SVG가 단일 currentColor → 색상 손실 | 모든 fill 일괄 변환 | 이미 currentColor인 경우만 유지 |
| **028** | 흰색 아이콘이 회색으로 렌더링 | fill=currentColor인데 부모 color 없음 | 원본 fill 값 보존 |
| **029** | INSTANCE_SWAP variant가 모두 같은 SVG | variantSvgs 체크가 조기 return 후 실행 | return 전으로 이동 |
| — | VECTOR rotate 이중 적용 + 아이콘 센터링 누락 | SVG에 이미 회전 반영 | CSS rotate 제거 + flex centering |
| — | INSTANCE CSS/SVG 좌표계 불일치 | 스케일 기준 불일치 | merged SVG 인라인 + instanceScale |
| — | VECTOR에 CSS 미지원 속성 잔존 + overflow 클리핑 | SVG 속성 미제거 | stroke-width 등 제거 + overflow:visible |
| — | 컨테이너가 내부 VECTOR로 SVG 변환 | 모든 dependency에 vectorSvg 주입 | isIconPattern() 검증 |

---

## 코드 생성 & 레이아웃

**핵심 문제**: UITree를 올바른 React/CSS 코드로 출력하고, Figma 레이아웃을 CSS로 정확히 재현해야 한다. TypeScript 타입 에러, HTML 중첩 규칙, Prettier 호환성도 포함.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **007** | disabled 버튼에 hover 잔존 + active가 hover에 덮어씀 | pseudo-class 순서 오류 | 순서 적용 + `:not(:disabled)` 래핑 |
| **008** | 90° 회전 요소 보이지 않음 | CSS transform은 시각적 효과만 | ±90° → transform 제거 + renderBounds |
| **010** | wrapper가 inline style 사용 (CSS class 무시) | 항상 inline style 적용 | CSS class 우선 사용 |
| **033** | slot 원본 SVG 자식이 placeholder와 함께 렌더링 | 원본 자식 ID 추적 없음 | `descendantIds` 추가 → 필터링 |
| **034** | variant별 TEXT 조건부 렌더링 미표현 | 조건 없이 렌더링 | 조건부 텍스트 표현식 생성 |
| — | variant style 객체 TS2538 타입 에러 | 타입 어노테이션 없음 | `Record<string, any>` 추가 |
| — | boolean prop을 object index로 사용 → TS2538 | boolean은 인덱스 불가 | `String()` 래핑 |
| — | Tailwind 빌드 시 Emotion css prop TS2322 | styleStrategy 분기 없음 | `getJsxStyleAttribute()` 사용 |
| — | void element(`<img>`)에 children → React 에러 | 처리 로직 없음 | `isVoidElement()` + self-closing |
| — | 스타일 맵 undefined + 빈 슬롯 wrapper | optional chaining 누락 | `?.` + 조건부 렌더링 |
| — | root INSTANCE self-referencing → 무한 재귀 | type "component"로 매핑 | container 변환 |
| — | Prettier 비호환 + 한글 노드명 충돌 + 예약어 prop | 복합 원인 | Prettier 호환 + nodeId 기반 + is 접두사 |

---

## 휴리스틱 — 컴포넌트별 엣지케이스

**핵심 문제**: 각 Heuristic이 특정 컴포넌트 패턴의 엣지케이스를 처리해야 한다. State/checked 변환, 이벤트 바인딩, 스타일 정리가 컴포넌트마다 다르게 동작한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| — | Dropdown 리스트가 흐름에 추가 → 트리거 밀어올림 | absolute 미적용 | relative+absolute+top:100% |
| — | Dropdown trigger-list 간격 없음 + gap 덜컹거림 | top:100% 직결 | calc(100%+4px) + gap 제거 |
| — | ProfileHeuristic 등록 누락 | 정리 시 실수 제거 | 재등록 |
| — | isToggleProp "on"이 "onChange"에 매칭 | 단어 경계 미검사 | 소문자 이어지면 거부 |
| — | SwitchHeuristic disable 스타일 모든 노드에 주입 → ReferenceError | 전체 주입 | 루트만 적용 |
| — | Checkbox 5건: SVG 센터링, 테두리, strokeAlign, border-style | 복합 원인 | renderBounds/border-style/radius/overflow |
| — | state/states 복수형 미매칭 + checked 하드코딩 | 패턴 미등록 | isStateProp() + 동적 감지 |
| — | FAB hover 범위 40x40 제한 + states prop 제거 실패 | filter() 미mutate | splice() + hover root 이동 |
| — | Checkbox BOOLEAN_OPERATION이 div로 렌더링 | vector 미분류 | BOOLEAN_OPERATION→vector + fill |
| — | Radio 복수 export default + :disabled 미주입 + size 충돌 | 3가지 복합 | 마지막 export + opacity + w/h 제거 |
| — | InputHeuristic helperText 바인딩 오타 + 위치 오류 | label→helperTextPropName | 바인딩명 + y값 기반 선택 |
| — | InputHeuristic 기존 바인딩 prop 미제거 | nodePropBindings 미확인 | 바인딩 확인 후 제거 |
| — | SegmentedControl 불필요한 icon prop | 컴포넌트 레벨 추출 | option에만 포함 |
| — | disabled 버튼 자식의 hover/active pseudo 잔존 → 아이콘 크기 변경 | 자식 pseudo 미제거 | disabled 시 자식 hover/active 제거 |
| — | slot 텍스트 색상 누락 + dependency 크기 + stroke padding | 복합 원인 | 스타일 수집 + 100% + strokeWeight 보정 |

---

## Tailwind & 타입 체커

**핵심 문제**: Tailwind 전략은 Emotion과 다른 코드를 생성하며, arbitrary value 이스케이핑과 CVA 타입 스텁이 추가로 필요하다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| — | Tailwind arbitrary value `\_` 백슬래시 소실 | JS 문자열에서 `\\` 소실 | `String.raw` 템플릿 리터럴 |
| — | CVA + String.raw 타입 스텁 없음 | 모듈 정의 누락 | CVA 스텁 + `StringConstructor.raw()` |
| — | INSTANCE 상속 변수 누락 + fontSize 타입 힌트 부재 | boundVariables API 한계 | getCSSAsync 전체 스캔 + `length:` 힌트 |

---

## 데이터 수집 — Plugin Backend

**핵심 문제**: Figma Plugin API(`getCSSAsync`)가 일부 CSS 속성을 반환하지 않아 수동 보충이 필요하다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| — | getCSSAsync INSTANCE opacity 누락 → overlay 항상 보임 | Figma API 한계 | opacity !== 1이면 수동 추가 |
| — | getCSSAsync clipsContent/blendMode/rotation 누락 | Figma API 한계 | overflow/mix-blend-mode/transform 수동 보충 |

---

## 이슈 통계

| 분류 | 문서화 | 미문서화 | 합계 |
|------|:-----:|:------:|:---:|
| Variant 병합 & 노드 매칭 | 5 | 6 | **11** |
| Props 추출 & 조건 처리 | 5 | 10 | **15** |
| 슬롯 감지 | 5 | 7 | **12** |
| 스타일 분류 & 분해 | 5 | 16 | **21** |
| 의존성 컴포넌트 처리 | 9 | 5 | **14** |
| SVG 렌더링 | 6 | 4 | **10** |
| 코드 생성 & 레이아웃 | 5 | 7 | **12** |
| 휴리스틱 엣지케이스 | — | 15 | **15** |
| Tailwind & 타입 체커 | — | 3 | **3** |
| Plugin Backend | — | 2 | **2** |
| **합계** | **40** | **75** | **115** |

> **가장 취약한 영역**: 스타일 분류 & 분해 (21건) — DynamicStyleDecomposer의 소유권 분석, pseudo-class 분류, unitless 속성 등 엣지케이스가 가장 많이 발생함. 기존 문서에서는 의존성 처리(9건)가 최다였으나, git 히스토리를 포함하면 스타일 분해와 휴리스틱이 실제 최다 문제 영역.
