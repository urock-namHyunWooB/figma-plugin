# Compound Prop 분해 + 아이콘 가시성 조건 수정

> Commit: `4d10da5` | 2026-03-13

## 문제

Btnsbtn 컴포넌트는 4개 variant 축(style, tone, state, size)을 가진 버튼이다. `background` 같은 CSS 속성이 단일 prop이 아닌 **복합 조합**(예: style=filled + tone=blue + state=default → `#628cf5`)에 의해 결정되는데, 기존 파이프라인은 단일 prop 소유만 지원하여 compound CSS를 올바르게 분해하지 못했다.

추가로, 아이콘 노드가 "State=loading이면서 Size=M,S에서만 visible"(L 제외)인 **부분 커버리지** 조건을 표현하지 못하는 문제도 있었다.

## 수정 내역 (6개 파일)

### 1. StyleProcessor — 비공통 diff를 per-variant 엔트리로 보존

**Before**: state별 그룹에서 공통 diff만 추출, 나머지 버림
**After**: 공통 diff → 단일 state 조건 엔트리 / 비공통 diff → `createConditionFromVariantName`으로 per-variant compound 조건 엔트리 생성

```
// 예: state=hover, style=filled, tone=blue에서만 나타나는 background
// → AND(state=hover, style=filled, tone=blue) 조건으로 보존
```

### 2. rewritePropConditions — compound-varying CSS 감지 및 pseudo 변환 방지

- 같은 state 값이 여러 non-state 그룹에서 **다른 CSS 값**을 가지면 `compoundProps`로 마킹
- compound CSS 속성은 pseudo(`:hover` 등)로 변환하지 않고 `keptEntries`로 유지
- default 엔트리도 state 조건을 유지하여 decomposer의 대칭적 compound 감지 보장

### 3. VisibilityProcessor — 부분 커버리지 조건 추가

**Before**: 공통 prop만으로 조건 생성 → `AND(state=loading)`
**After**: 공통 prop + 비공통 prop의 부분 커버리지 → `AND(state=loading, OR(size=M, size=S))`

```ts
// icon_delete: root Size={L,M,S} 중 child는 {M,S}에서만 visible
// → root 전체를 커버하지 않으면 OR 조건 추가
findPartialCoverageConditions(allVariantProps, commonKeys)
```

### 4. DynamicStyleDecomposer — compound owner 지원

`findControllingProp`에 2-prop, 3-prop compound 탐색 단계 추가:

```
1차: 단일 prop이 모든 그룹에서 일관적 → 단일 owner
2차: 단일 prop 과반수 미만 → 2-prop/3-prop 조합 탐색 → "style+tone" 형태 반환
3차: best-fit fallback
```

결과 맵에 compound owner(`"style+tone+state"`)별 value map 구성 (Step 5b).

### 5. JsxGenerator — compound prop 참조 코드 생성

`buildDynamicStyleRef` 신규 메서드:

| 타입 | 생성 코드 |
|------|-----------|
| single (`size`) | `varName_sizeStyles?.[String(size)]` |
| compound (`style+tone`) | `` varName_styleToneStyles?.[`${style}+${tone}`] `` |

Tailwind cva에서는 compound prop을 `flatMap(split("+"))`으로 개별 prop 인자로 전개.

### 6. ButtonHeuristic + SlotProcessor — 보조 수정

- **ButtonHeuristic**: TEXT slot 노드의 `styles` 제거 로직 삭제 → font-size, color 등 스타일 유지
- **SlotProcessor**: `areContiguous` 체크 추가 — 같은 componentId지만 TEXT로 분리된 비연속 인스턴스(좌/우 아이콘)를 array slot으로 병합하지 않음

## 테스트

`test/compiler/test-btnsbtn-decompose.test.ts` 추가:
- Emotion: compound style map에 background 색상(`#628cf5`, `#ff8484`) 올바르게 배치 확인
- Tailwind: 컴포넌트 함수 정상 생성 확인

## 관련 파일

- `layers/tree-manager/tree-builder/processors/StyleProcessor.ts`
- `layers/tree-manager/tree-builder/processors/VisibilityProcessor.ts`
- `layers/tree-manager/tree-builder/processors/utils/rewritePropConditions.ts`
- `layers/tree-manager/post-processors/DynamicStyleDecomposer.ts`
- `layers/code-emitter/react/generators/JsxGenerator.ts`
- `layers/tree-manager/tree-builder/heuristics/ButtonHeuristic.ts`
- `layers/tree-manager/tree-builder/processors/SlotProcessor.ts`
