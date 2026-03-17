# Issue Summary

> 35개 이슈의 요약본. 전체 해결 완료 (ISSUE-001은 후속 이슈에서 해결됨).
>
> **참고**: ISSUE-001~033은 레거시 파이프라인 기준으로 작성되었으며, 현재는 3-Layer 파이프라인으로 마이그레이션 완료됨. 문제의 본질과 해결 원리는 여전히 유효하지만, 파일 경로와 클래스명은 현재 코드와 다를 수 있음.

---

## Variant 병합 & 노드 매칭

**핵심 문제**: 여러 variant의 독립된 트리를 하나로 합칠 때, "같은 노드"를 정확히 식별해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **019** | variant 노드가 캔버스 절대좌표로 배치되어 위치 비교 실패 | COMPONENT_SET 자식은 캔버스 좌표를 가짐 | variant root 감지 → position 0,0으로 보정 |
| **026** | 자식 수가 다른 variant 간 구조 매칭 실패 (3 vs 2) | 구조 비교가 정확 일치 요구 | prefix 매칭 허용 (한쪽이 다른 쪽의 prefix면 동일 구조) |
| **016** | ArraySlot parentId가 병합 후 root ID와 불일치 | 원본 variant ID를 저장했으나 병합 시 대표 ID로 변경됨 | children ID로 폴백 매칭 |
| **033** | 병합 후 자식 순서가 Figma와 다름 | variant 자식을 단순 연결(concat)하여 순서 뒤섞임 | 평균 x좌표 기준 정렬 |
| **033** | 병합 시 FRAME의 layoutMode(HORIZONTAL) 소실 | 자식을 평탄화할 때 부모 속성 유실 | `inheritedLayoutMode` 필드 추가하여 보존 |

---

## Props 추출 & 조건 처리

**핵심 문제**: Figma의 variant prop을 React prop으로 변환할 때, State 같은 시각적 상태를 CSS pseudo-class로 분리해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **002** | State variant(Error, Insert 등)의 조건부 렌더링 미적용 | State 조건을 파싱하지 않고 전부 건너뜀 | CSS 변환 가능/불가능 state 분리 + 노드에 conditions 필드 추가 |
| **031** | CSS 변환 불가 state(Loading 등)가 삭제되어 조건 렌더링 실패 | pseudo 변환 시 비변환 값도 함께 삭제 | 변환 불가 값이 있으면 State prop 유지 |
| **021** | Figma prop 이름(type, name)이 HTML 속성과 충돌 | 컴파일러는 rename하지만 TestPage는 원본 이름 사용 | HTML 충돌 속성 감지 + rename 로직 통일 |
| **034** | 의존성 컴포넌트에서 variant별 TEXT가 같은 prop으로 병합됨 | 대표 variant 1개만 컴파일하여 variant 정보 유실 | PropDefinition에 nodeId/variantValue 메타 추가, 전체 variant 탐색 |
| **030** | 숫자로 시작하는 노드 이름이 JS SyntaxError 유발 | JS 식별자는 숫자로 시작 불가 | `_` prefix 추가 |

---

## 슬롯 감지

**핵심 문제**: INSTANCE의 가시성/존재 여부를 React의 slot prop(`React.ReactNode`)으로 변환해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **005** | FRAME 내 동일 컴포넌트 자식을 ArraySlot으로 잘못 감지 | 모든 노드 타입에 ArraySlot 감지 적용 | COMPONENT_SET/COMPONENT에만 제한 |
| **015** | 다른 variant(Left Neutral, Right Primary)가 하나의 ArraySlot으로 병합 | componentSetId로 그룹핑하여 variant 구분 무시 | componentId(정확한 variant)로 그룹핑 |
| **025** | COMPONENT_SET 내 TEXT 노드가 slot으로 변환되지 않음 | TEXT에 대한 slot 변환 로직 없음 | TEXT → slot 변환 추가 + 중복 이름 처리 |
| **027** | slot prop의 조건부 스타일이 통째로 삭제됨 | slot 변환 시 관련 dynamic 스타일을 전부 제거 | 조건을 삭제 대신 변환 (`=== "True"` → `!= null`) + CSS 변수 생성 |
| **035** | 분리된 동일 컴포넌트(leftIcon, rightIcon)를 ArraySlot으로 잘못 감지 | componentId만 보고 연속성 확인 안 함 | `areContiguous()` 체크 추가 |

---

## 스타일 분류 & 분해

**핵심 문제**: 48개 variant의 CSS에서 각 속성이 어떤 prop에 의해 제어되는지 역추론해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **001** | 3D variant(size×type×state)에서 prop 값이 서로 덮어쓰기 | prop별 CSS 소유권 분석 없음 | → ISSUE-035에서 DynamicStyleDecomposer로 해결 |
| **035** | 복합 prop(style+tone) 조합의 CSS 소유권 미분해 | `findControllingProp()`이 단일 prop만 탐색 | 2-prop, 3-prop compound 감지 추가 + compound owner 결과 맵 생성 |
| **022** | Color variant별 disabled 텍스트 색상이 모두 동일 | `:disabled` pseudo가 button에만 적용, Color 인덱싱 없음 | Color+Disabled 조합 조건부 스타일(indexed conditional) 구현 |
| **033** | State 스타일이 CSS pseudo-class 대신 JS 조건으로 생성됨 | state 스타일을 pseudo로 분류하는 로직 없음 | `groupByState()` + `isStateSpecific()` 구현하여 pseudo 분류 |
| **003** | `flex: 1 0 0`과 padding이 충돌하여 불균등 레이아웃 | flex-basis:0은 padding을 무시하지 않음 | flex-basis를 실제 Figma width로 교체 |

---

## 의존성 컴포넌트 처리

**핵심 문제**: 메인 컴포넌트가 INSTANCE로 참조하는 외부 컴포넌트를 올바르게 컴파일하고 통합해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **004** | INSTANCE wrapper에 width/height 없어 자식 100% 크기 실패 | Figma가 INSTANCE 노드에 CSS 크기를 제공하지 않음 | `absoluteBoundingBox`에서 크기 추출하여 wrapper에 적용 |
| **009** | 같은 컴포넌트의 다른 INSTANCE가 동일하게 렌더링됨 | override 정보가 의존성 컴파일에 전달되지 않음 | override를 CSS 변수로 추출 + Props interface 생성 |
| **011** | enriched INSTANCE 자식이 삭제됨 | `I...` ID 노드를 일괄 삭제하는 cleanup이 enriched 노드도 삭제 | `_enrichedFromEmptyChildren` 플래그로 보호 |
| **012** | 의존성 VECTOR 노드가 빈 div로 렌더링 | vectorSvgs 데이터가 의존성 컴파일에 전달되지 않음 | 루트 문서의 vectorSvgs를 의존성 컴파일에 전달 |
| **014** | 중첩 의존성(Popup→Button) INSTANCE가 렌더링 안 됨 | 4가지 복합 원인: 탐색 범위, visible:false 필터링, I... 삭제, enrichment 플래그 | 의존성 문서까지 탐색 확장 + 각 원인 개별 수정 |
| **018** | wrapper와 의존성 모두 background를 가져 시각적 충돌 | 의존성이 자신의 것이 아닌 visual style까지 보유 | 의존성에서 visual style(background, border, opacity) 분리 |
| **023** | visible override가 있는 INSTANCE의 styleTree가 병합 안 됨 | hidden children이 있으면 styleTree 병합을 건너뜀 | hidden children과 무관하게 styleTree 병합 수행 |
| **024** | 메인 "Label"과 의존성 "label"이 같은 이름으로 무한 재귀 | 정규화 시 대소문자 차이 소실 | 이름 충돌 감지 → 의존성에 `_` prefix + JSX 참조 재작성 |
| **032** | 새 파이프라인에서 INSTANCE wrapper 크기 누락 (ISSUE-004 재발) | 새 파이프라인에서도 동일 문제 미처리 | `wrapperStyles`를 DesignNode에 추가 |

---

## SVG 렌더링

**핵심 문제**: Figma의 VECTOR/ELLIPSE/BOOLEAN_OPERATION 노드를 올바른 SVG로 렌더링하고, variant별 색상 변경을 지원해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **006** | 아이콘 색상이 State별로 변하지 않음 | SVG fill이 하드코딩; variant에서 색상 미추출 | fill→currentColor 변환 + variant별 color를 부모 CSS로 적용 |
| **013** | GNB My Info 아이콘이 윤곽선만 표시 | ELLIPSE background→color 변환 없음 | ELLIPSE 특수 케이스 처리 + fill→color 변환 |
| **017** | 배터리/신호 아이콘이 빈 박스로 렌더링 | BOOLEAN_OPERATION 타입이 SVG 수집/스타일 처리에서 누락 | SVG 수집과 vector 타입 처리에 BOOLEAN_OPERATION 추가 |
| **020** | 다색 SVG가 단일 currentColor로 변환되어 색상 손실 | 모든 fill을 currentColor로 일괄 변환 | 이미 currentColor인 경우만 유지, 원본 hex/rgb 보존 |
| **028** | 흰색 아이콘이 회색으로 렌더링 | fill=currentColor인데 부모에 color CSS 없음 | 원본 fill 값 보존 (currentColor 변환 중지) |
| **029** | INSTANCE_SWAP variant가 모두 같은 SVG로 렌더링 | root 문서 처리에서 variantSvgs 체크가 조기 return 후 실행됨 | variantSvgs 체크를 return 전으로 이동 |

---

## 코드 생성 & 레이아웃

**핵심 문제**: UITree를 올바른 React/CSS 코드로 출력하고, Figma의 레이아웃을 CSS로 정확히 재현해야 한다.

| # | 문제 | 원인 | 해결 |
|---|------|------|------|
| **007** | disabled 버튼에 hover 효과 잔존, active가 hover에 덮어씀 | pseudo-class 순서 오류 + :not(:disabled) 래핑 없음 | 올바른 순서 적용 + 인터랙티브 pseudo를 `:not(:disabled)` 래핑 |
| **008** | 90° 회전 요소가 보이지 않음 | CSS transform은 시각적 효과만, 레이아웃에 영향 없음 | ±90° 감지 → transform 제거 + renderBounds로 크기 재계산 |
| **010** | 외부 컴포넌트 wrapper가 inline style 사용 (CSS class 무시) | wrapper 생성 시 항상 inline style 적용 | CSS class(`cssVarName`) 우선 사용 |
| **033** | slot의 원본 SVG 자식이 slot placeholder와 함께 렌더링됨 | slot 정의에 원본 자식 ID 추적 없음 | SlotDefinition에 `descendantIds` 추가 → 자식 필터링 |
| **034** | variant별 TEXT 조건부 렌더링 미표현 | variant 특정 TEXT prop이 조건 없이 렌더링됨 | 조건부 텍스트 표현식 + 조건부 스타일 속성 생성 |

---

## 이슈 통계

| 분류 | 건수 |
|------|:---:|
| Variant 병합 & 노드 매칭 | 5 |
| Props 추출 & 조건 처리 | 5 |
| 슬롯 감지 | 5 |
| 스타일 분류 & 분해 | 5 |
| 의존성 컴포넌트 처리 | 9 |
| SVG 렌더링 | 6 |
| 코드 생성 & 레이아웃 | 5 |
| **합계** | **40** (일부 이슈가 여러 분류에 걸침) |

> **가장 많은 이슈가 발생한 영역**: 의존성 컴포넌트 처리 (9건) — INSTANCE override 전달, wrapper 크기, 중첩 의존성 등 메인↔의존성 간 데이터 흐름 문제가 반복적으로 발생함.
