# TreeBuilder Pipeline 설계

## 개요

TreeBuilder는 FigmaNodeData를 UITree로 변환하는 파이프라인입니다.

**핵심 원칙:**
- 필터 패턴 (Pipe-and-Filter)
- 각 단계는 이전 단계 출력 + DataManager(읽기 전용)만 참조
- 기본 파이프라인은 **순수한 데이터 변환** (판단/해석 없음)
- 의미 해석은 **휴리스틱**에서 담당

---

## 전체 구조

```
FigmaNodeData
     ↓
DataManager (읽기 전용, 전 단계 공유)
     ↓
┌─────────────────────────────────────┐
│         기본 파이프라인              │
│  [Step 1] → [Step 2] → ... → UITree │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│           휴리스틱                   │
│  UITree 분석 → componentType 결정   │
└─────────────────────────────────────┘
     ↓
최종 UITree
```

---

## 기본 파이프라인 (5단계)

### Step 1: 변형 병합 (VariantMerger)

**역할:** COMPONENT_SET의 여러 variant를 하나의 트리로 병합

**입력:**
- DataManager (spec.info.document)

**출력:**
- InternalTree (병합된 트리 구조)

**처리 내용:**
- COMPONENT_SET인 경우: IoU 기반으로 같은 위치의 노드들을 병합
- 단일 컴포넌트인 경우: 그대로 InternalTree로 변환
- visible: false인 노드는 트리에서 제외

---

### Step 2: Props 추출/바인딩 (PropsProcessor)

**역할:** componentPropertyDefinitions에서 Props 추출 및 노드에 바인딩

**입력:**
- DataManager
- InternalTree (Step 1 출력)

**출력:**
- InternalTree + Props[] + PropBindings

**처리 내용:**
- componentPropertyDefinitions에서 Props 정의 추출
- componentPropertyReferences로 노드에 Props 연결
- Props 타입: variant, boolean, slot, string

---

### Step 3: 스타일 처리 (StyleProcessor)

**역할:** 각 노드의 CSS 스타일을 추출하고 분류

**입력:**
- DataManager (styleTree)
- InternalTree + Props[]

**출력:**
- StyledTree (스타일 정보가 포함된 트리)

**처리 내용:**
- styleTree에서 CSS 추출
- base/dynamic/pseudo 분류
  - base: 모든 variant에서 동일한 스타일
  - dynamic: prop에 따라 달라지는 스타일
  - pseudo: State prop에 따른 :hover, :active 등
- 위치/회전 스타일 적용

---

### Step 4: 가시성 조건 (VisibilityProcessor)

**역할:** 노드의 visible/hidden 조건 처리

**입력:**
- DataManager
- StyledTree

**출력:**
- StyledTree + VisibilityConditions

**처리 내용:**
- variant별로 다른 visible 상태를 조건으로 변환
- boolean prop에 따른 표시/숨김 조건 생성
- ConditionNode 형태로 표현

---

### Step 5: 외부 참조 (ExternalRefProcessor)

**역할:** INSTANCE 노드가 참조하는 외부 컴포넌트 처리

**입력:**
- DataManager (dependencies)
- StyledTree + VisibilityConditions

**출력:**
- UITree

**처리 내용:**
- INSTANCE 노드를 ComponentNode로 변환
- refId 설정 (외부 컴포넌트 ID)
- props 매핑 (부모 → 자식 컴포넌트)

---

## 휴리스틱 (후처리)

**역할:** UITree를 분석하여 컴포넌트 타입 결정 및 특수 처리

**입력:**
- UITree (기본 파이프라인 출력)

**출력:**
- UITree + componentType

**처리 내용:**
- 점수 기반 컴포넌트 타입 감지:
  - button, input, checkbox, radio, toggle, link, dropdown 등
- 타입별 특수 처리:
  - input: placeholder 감지
  - button: 클릭 영역 최적화
  - 등등

---

## 데이터 흐름

```
FigmaNodeData
     │
     ▼
[Step 1: VariantMerger]
     │ InternalTree
     ▼
[Step 2: PropsProcessor]
     │ InternalTree + Props[]
     ▼
[Step 3: StyleProcessor]
     │ StyledTree
     ▼
[Step 4: VisibilityProcessor]
     │ StyledTree + Conditions
     ▼
[Step 5: ExternalRefProcessor]
     │ UITree
     ▼
[Heuristics]
     │ UITree + componentType
     ▼
최종 UITree
```

---

## 중간 타입 정의 (TODO)

```typescript
// Step 1 출력
interface InternalTree {
  // TODO: 정의
}

// Step 2 출력
interface TreeWithProps {
  tree: InternalTree;
  props: PropDefinition[];
  bindings: Map<nodeId, propBindings>;
}

// Step 3 출력
interface StyledTree {
  // InternalTree + styles
}

// Step 4 출력
interface TreeWithVisibility {
  tree: StyledTree;
  conditions: Map<nodeId, ConditionNode>;
}

// Step 5 출력
// UITree (types.ts에 정의됨)
```

---

## 설계 원칙

1. **필터 패턴**: 각 단계는 이전 단계 출력만 의존
2. **DataManager 공유**: 원본 데이터는 읽기 전용으로 모든 단계에서 접근 가능
3. **순수 변환**: 기본 파이프라인은 판단/해석 없이 데이터만 변환
4. **의미 해석 분리**: 휴리스틱에서 컴포넌트 타입 등 의미 부여
5. **점진적 변환**: 각 단계에서 트리에 정보를 추가해 나감
