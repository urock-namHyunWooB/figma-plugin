# FigmaCodeGenerator Architecture

> 이 문서는 FigmaCodeGenerator의 현재 아키텍처를 정의합니다.
> 레거시 파이프라인은 완전히 제거되었으며, 이 문서는 현재 운영 중인 유일한 파이프라인을 설명합니다.

## Overview

FigmaCodeGenerator는 Figma 디자인 데이터를 React 컴포넌트 코드로 변환합니다.

### 설계 원칙

1. **레이어 분리**: 각 레이어는 명확한 단일 책임을 가짐
2. **단방향 의존성**: 상위 레이어만 하위 레이어를 참조
3. **플랫폼 독립적 IR**: TreeBuilder까지는 플랫폼에 독립적 (UITree)
4. **휴리스틱 기반 컴포넌트 감지**: 점수 기반 매칭으로 UX 패턴 자동 인식
5. **Strategy 패턴**: 스타일 전략 (Emotion/Tailwind)을 교체 가능

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      FigmaCodeGenerator                          │
│                        (Orchestrator)                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Layer 1: DataManager                                       │ │
│  │  (HashMap 기반 O(1) 데이터 접근 + 벡터/이미지 정규화)          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Layer 2: TreeManager                                       │ │
│  │  ┌───────────────────────────────────────────────────────┐ │ │
│  │  │  TreeBuilder (2-Phase 파이프라인)                       │ │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │ │ │
│  │  │  │Processors│→ │Heuristics│→ │UINodeConverter     │  │ │ │
│  │  │  └──────────┘  └──────────┘  └────────────────────┘  │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  │  ┌───────────────────────────────────────────────────────┐ │ │
│  │  │  Post-Processors                                       │ │ │
│  │  │  ComponentPropsLinker → UITreeOptimizer                │ │ │
│  │  │  DynamicStyleDecomposer (FD 분해)                      │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Layer 3: ReactEmitter (ICodeEmitter)                       │ │
│  │  ┌────────────┐ ┌──────────┐ ┌─────────────┐ ┌─────────┐ │ │
│  │  │ImportsGen. │ │PropsGen. │ │StylesGen.   │ │JsxGen.  │ │ │
│  │  └────────────┘ └──────────┘ └─────────────┘ └─────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  IStyleStrategy: EmotionStrategy / TailwindStrategy  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  ReactBundler (멀티 컴포넌트 번들링)                    │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 컴포넌트 요약

| 컴포넌트 | 역할 |
|---------|------|
| **DataManager** | HashMap 기반 O(1) 데이터 접근, 벡터/이미지 정규화 |
| **TreeManager** | 트리 빌딩 오케스트레이션 + 의존성 트리 구축 |
| **TreeBuilder** | 2-Phase 파이프라인으로 UITree 생성 |
| **ReactEmitter** | UITree → React 코드 생성 (ICodeEmitter 구현) |
| **ReactBundler** | 멀티 컴포넌트 단일 파일 번들링 |

---

## Layer 1: DataManager

### 책임

- FigmaNodeData를 HashMap 기반으로 O(1) 조회 가능하게 변환
- 노드, 스타일, 의존성, 이미지, 벡터 SVG 통합 관리
- INSTANCE 벡터 SVG 병합 및 정규화
- 생성자에서 모든 데이터 구조를 한 번에 구축 (이후 불변)

### Input / Output

```typescript
Input:  FigmaNodeData (raw JSON from Figma)
Output: DataManager (O(1) lookup 인스턴스)
```

### 내부 자료구조

```typescript
class DataManager {
  private spec: FigmaNodeData;          // 원본 데이터 deep copy
  private document: SceneNode;          // 루트 문서 노드
  private styleTree: StyleTree;         // 루트 스타일 트리
  private nodeMap: Map<string, SceneNode>;     // ID → SceneNode
  private styleMap: Map<string, StyleTree>;    // ID → StyleTree
  private dependencies: Map<string, FigmaNodeData>;  // 재귀 수집된 의존성
  private imageUrls: Map<string, string>;      // imageRef → URL
  private vectorSvgs: Map<string, string>;     // nodeId → SVG 문자열
  private dependencyMergedSvgs: Map<string, string>; // 정규화된 병합 SVG
}
```

### 주요 API

| 메서드 | 반환 | 설명 |
|--------|------|------|
| `getById(id)` | `{node?, style?, spec?}` | 통합 O(1) 조회 |
| `getDocument()` | `SceneNode` | 루트 문서 노드 |
| `getMainComponentId()` | `string` | 루트 노드 ID |
| `getRootNodeType()` | `string` | 문서 노드 타입 |
| `totalVariantCount` | `number` | COMPONENT_SET 자식 수 또는 1 |
| `getAllDependencies()` | `Map<string, FigmaNodeData>` | 모든 의존성 |
| `getDependenciesGroupedByComponentSet()` | `Record<id, {name, variants}>` | ComponentSet별 그룹 |
| `getImageUrlByNodeId(nodeId)` | `string?` | 노드 이미지 URL |
| `getVectorSvgByNodeId(nodeId)` | `string?` | 벡터 SVG 직접 조회 |
| `getVectorSvgByLastSegment(nodeId)` | `string?` | INSTANCE 복합 ID 접미사 매칭 |
| `mergeInstanceVectorSvgs(instanceId)` | `string?` | 멀티 벡터 → 단일 SVG 병합 |
| `getMergedVectorSvgForComponent(componentId)` | `string?` | 의존성용 정규화 SVG |
| `getComponentPropertyDefinitions()` | `Record?` | 컴포넌트 속성 정의 |

### INSTANCE 복합 ID 처리

INSTANCE 자식 노드는 `I704:56;704:29;692:1613` 형태의 복합 ID를 가집니다:
- `I704:56` = 외부 INSTANCE
- `704:29` = 중간 컴포넌트
- `692:1613` = 원본 컴포넌트 노드 ID (마지막 세그먼트)

`getVectorSvgByLastSegment()`는 마지막 세그먼트로 접미사 매칭을 수행합니다.

### 파일 위치

```
layers/data-manager/
└── DataManager.ts    # 단일 파일, 서브 컴포넌트 없음
```

---

## Layer 2: TreeManager + TreeBuilder

### TreeManager

#### 책임

- 메인 컴포넌트와 의존성 컴포넌트 트리 빌딩 오케스트레이션
- 의존성을 ComponentSet별로 그룹화하여 variant 병합
- 빌드 완료 후 Post-Processing (Props 연결, 최적화)

#### Input / Output

```typescript
Input:  DataManager
Output: { main: UITree, dependencies: Map<string, UITree> }
```

#### 빌드 흐름

```
TreeManager.build()
│
├── 1. buildComponentTree(mainId)     → 메인 UITree
│
├── 2. buildDependencyTrees()         → Map<id, UITree>
│     ├── getDependenciesGroupedByComponentSet()
│     ├── 단일 variant → 개별 컴포넌트 빌드
│     └── 다중 variants → COMPONENT_SET 병합 빌드
│           └── inferComponentPropertyDefinitions()
│               (variant 이름에서 props 추론: "State=Normal, Guide=False")
│
├── 3. ComponentPropsLinker.process() → INSTANCE override props 연결
│
└── 4. UITreeOptimizer.optimize()     → 중복 동적 스타일 병합, 미사용 props 제거
```

### TreeBuilder

#### 책임

- 단일 컴포넌트의 SceneNode → UITree 변환
- 2-Phase 파이프라인 (구조 확정 → 스타일 적용)
- 11단계 순차 처리 + 휴리스틱 기반 컴포넌트 감지

#### Input / Output

```typescript
Input:  SceneNode (Figma document 노드)
Output: UITree { root: UINode, props, arraySlots, derivedVars, stateVars }
```

#### 2-Phase 파이프라인

```
SceneNode
    │
    ▼
═══════════════════════════════════════════════════════
Phase 1: 구조 확정 (스타일 접근 없음)
═══════════════════════════════════════════════════════
    │
    ├── 1. VariantMerger.merge()
    │      COMPONENT_SET variants → InternalTree (IoU 기반 노드 매칭)
    │
    ├── 2. PropsExtractor.extract()
    │      componentPropertyDefinitions → PropDefinition[]
    │
    ├── 3. SlotProcessor.process()
    │      개별 슬롯 + 배열 슬롯 + 텍스트 슬롯 감지
    │
    ├── 4. VisibilityProcessor.apply()
    │      variant별 가시성 → ConditionNode 생성
    │
    ├── 5. ExternalRefsProcessor.resolveStructure()
    │      INSTANCE → refId 설정, 벡터 전용 의존성 SVG 병합
    │
    ▼
═══════════════════════════════════════════════════════
Phase 2: 스타일 + 후처리 (구조 잠금)
═══════════════════════════════════════════════════════
    │
    ├── 6. StyleProcessor.applyStyles()
    │      variant 스타일 → base/dynamic/pseudo 분류
    │
    ├── 7. ExternalRefsProcessor.applyColorStyles()
    │      벡터 colorMap 동적 스타일 적용
    │
    ├── 8. Override Detection + Text Bindings
    │      INSTANCE override 감지 + TEXT 바인딩
    │
    ├── 9. ModuleHeuristic.run()
    │      반응형 breakpoint → @media 쿼리 변환
    │
    ├── 10. HeuristicsRunner.run()
    │       점수 기반 컴포넌트 타입 감지 (threshold: 10)
    │
    ├── 11. State → Pseudo 변환
    │       미처리 State props → :hover, :active 등 의사 클래스
    │
    ▼
═══════════════════════════════════════════════════════
최종 변환
═══════════════════════════════════════════════════════
    │
    └── UINodeConverter.convert()
        InternalTree → UITree (UINode 트리)
```

### Processors

| Processor | 역할 |
|-----------|------|
| **VariantMerger** | IoU 기반 노드 매칭으로 COMPONENT_SET variants 병합 |
| **VariantGraphBuilder** | variant 병합 순서 결정 (의존성 그래프) |
| **NodeMatcher** | 위치/ID/타입 기반 노드 매칭 |
| **PropsExtractor** | componentPropertyDefinitions → PropDefinition[] |
| **SlotProcessor** | 통합 슬롯 감지 (개별 + 배열 + 텍스트) |
| **InstanceSlotProcessor** | INSTANCE 슬롯 바인딩 처리 |
| **ArraySlotProcessor** | 반복 INSTANCE → 배열 슬롯 |
| **TextProcessor** | TEXT 노드 콘텐츠 추출 + 바인딩 |
| **VisibilityProcessor** | variant 조건 파싱 + 중복 조건 최적화 |
| **StyleProcessor** | variant 스타일 → CSS (base/dynamic/pseudo/mediaQuery) |
| **ExternalRefsProcessor** | INSTANCE 외부 참조 + 벡터 SVG 병합 |

### Processor 유틸리티

```
processors/utils/
├── overrideUtils.ts        # INSTANCE override 감지
├── instanceSlotUtils.ts    # INSTANCE 슬롯 유틸리티
├── propPatterns.ts         # prop 이름 패턴 매칭
├── rewritePropConditions.ts # State → pseudo-class 변환
└── textSlotUtils.ts        # 텍스트 슬롯 유틸리티
```

### Heuristics 시스템

COMPONENT_SET에서 특정 UX 패턴을 **점수 기반**으로 감지하는 시스템.

#### 설계 원칙

1. **점수 기반 매칭**: 각 Heuristic이 `score()`로 점수 반환, 최고 점수 ≥ 10이면 선택
2. **score() + apply() 분리**: 판별과 처리를 분리
3. **GenericHeuristic 폴백**: 매칭 실패 시 범용 처리 (score: 0)

#### 인터페이스

```typescript
interface HeuristicContext {
  tree: InternalTree;
  dataManager: DataManager;
  componentName: string;
  propDefs: Record<string, ComponentPropertyDef> | undefined;  // Figma 원본
  props: PropDefinition[];                                     // 추출된 props 배열
}

interface IHeuristic {
  readonly name: string;
  readonly componentType: ComponentType;
  score(ctx: HeuristicContext): number;
  apply(ctx: HeuristicContext): HeuristicResult;
}
```

#### 등록된 Heuristics (14개)

| Heuristic | 감지 대상 | 점수 기준 |
|-----------|----------|-----------|
| **SearchFieldHeuristic** | 검색 필드 | 이름 패턴 매칭 (score: 20) |
| **DropdownHeuristic** | 드롭다운/셀렉트 | 이름 매칭 (score: 20) |
| **CheckboxHeuristic** | 체크박스 | 이름 매칭 (score: 20) |
| **RadioHeuristic** | 라디오 버튼 | 이름 매칭 (score: 20) |
| **FabHeuristic** | FAB 버튼 | 이름 매칭 (score: 15) |
| **BadgeHeuristic** | 배지 | 이름 매칭 (score: 15) |
| **ProfileHeuristic** | 프로필 카드 | 이름 매칭 (score: 15) |
| **ChipHeuristic** | 칩/태그 | 이름 매칭 (score: 10) |
| **InputHeuristic** | 입력 필드 | 이름(+10) + 캐럿(+15) + placeholder(+5) |
| **SwitchHeuristic** | 토글 스위치 | 이름 매칭 (score: 10) |
| **SegmentedControlHeuristic** | 세그먼트 컨트롤 | 이름 매칭 |
| **LinkHeuristic** | 링크/앵커 | 이름 매칭 |
| **ButtonHeuristic** | 버튼 | 이름(+10) + State prop(+10) + 시각적 특성(0~10) |
| **FrameHeuristic** | 프레임/컨테이너 | 이름 매칭 (score: 10) |

**특수 Heuristics** (배열 외):
- **GenericHeuristic** — 폴백 (score: 0). 다른 heuristic이 threshold(10) 미달 시 사용. boolean/text/instance 슬롯 감지
- **ModuleHeuristic** — TreeBuilder에서 별도 호출. breakpoint/device/screen prop → @media 반응형 변환

#### 데이터 흐름 예시 (Button)

```
1. ButtonHeuristic.score() → 20 (이름 + State prop)
2. ButtonHeuristic.apply()
   → semanticType = "button"
   → rootNodeType = "button"
   → State prop 제거, child semanticType 설정
3. UINodeConverter → UINode.type = "button"
4. JsxGenerator → <button> 태그 생성
```

### Post-Processors

| Post-Processor | 역할 |
|----------------|------|
| **ComponentPropsLinker** | INSTANCE override → 의존성 컴포넌트 props 연결, 바인딩 전파 |
| **DynamicStyleDecomposer** | AND 조건 dynamic에서 CSS 속성별 소유 prop 결정 + diagnostics 수집 |
| **UITreeOptimizer** | FD 분해 (DynamicStyleDecomposer 호출), 항상-true 동적 스타일 → base로 병합, 의존성 루트 유연화 (px → %), 미사용 props 제거 |

### 디렉토리 구조

```
layers/tree-manager/
├── TreeManager.ts                   # 오케스트레이터
│
├── post-processors/
│   ├── ComponentPropsLinker.ts      # INSTANCE override props 연결
│   ├── DynamicStyleDecomposer.ts    # 다중 prop 스타일 분해 + 진단
│   └── UITreeOptimizer.ts           # 트리 최적화
│
└── tree-builder/
    ├── TreeBuilder.ts               # 2-Phase 파이프라인
    ├── UINodeConverter.ts           # InternalTree → UINode 변환
    │
    ├── heuristics/
    │   ├── IHeuristic.ts            # 인터페이스
    │   ├── HeuristicsRunner.ts      # 점수 기반 매칭 오케스트레이터
    │   ├── GenericHeuristic.ts      # 폴백 휴리스틱
    │   ├── FrameHeuristic.ts
    │   ├── ButtonHeuristic.ts
    │   ├── BadgeHeuristic.ts
    │   ├── CheckboxHeuristic.ts
    │   ├── ChipHeuristic.ts
    │   ├── DropdownHeuristic.ts
    │   ├── FabHeuristic.ts
    │   ├── InputHeuristic.ts
    │   ├── LinkHeuristic.ts
    │   ├── ProfileHeuristic.ts
    │   ├── RadioHeuristic.ts
    │   ├── SearchFieldHeuristic.ts
    │   ├── SegmentedControlHeuristic.ts
    │   ├── SwitchHeuristic.ts
    │   └── module-heuristics/
    │       ├── ModuleHeuristic.ts    # 반응형 breakpoint 감지
    │       └── ResponsiveProcessor.ts # @media 쿼리 생성
    │
    └── processors/
        ├── VariantMerger.ts
        ├── VariantGraphBuilder.ts
        ├── NodeMatcher.ts
        ├── PropsExtractor.ts
        ├── SlotProcessor.ts
        ├── InstanceSlotProcessor.ts
        ├── ArraySlotProcessor.ts
        ├── TextProcessor.ts
        ├── VisibilityProcessor.ts
        ├── StyleProcessor.ts
        ├── ExternalRefsProcessor.ts
        └── utils/
            ├── overrideUtils.ts
            ├── instanceSlotUtils.ts
            ├── propPatterns.ts
            ├── rewritePropConditions.ts
            └── textSlotUtils.ts
```

### 핵심 알고리즘

#### Variant 병합 (VariantMerger + NodeMatcher)

```
1. VariantGraphBuilder → 병합 순서 그래프 구축
2. 각 variant에 대해:
   - 위치(IoU), ID, 타입으로 노드 매칭
   - 매칭된 노드 mergedNodes 배열에 추적
3. 결과: 단일 InternalTree + 각 노드에 variant별 데이터
```

#### 조건 최적화 (VisibilityProcessor)

```
1. 조상의 보장된 atomic 조건 수집
2. 자식의 중복 하위 조건 제거
3. 보장된 조건 집합을 하위로 전파
```

#### 동적 스타일 분류 (StyleProcessor)

```
Phase 1: 모든 variant에서 같은 값 → base, 다르면 → dynamic
Phase 2: 모든 variant에 적용되는 dynamic → base로 승격
```

> Layer 3 (CodeEmitter)의 상세 내용은 [코드 생성 가이드](../3-code-generation/emitter.md)를 참조하세요.

---

## 타입 시스템

### 주요 타입

```
types/
├── types.ts     # 내부 타입 (UITree, UINode, StyleObject, ConditionNode, InternalNode 등)
├── public.ts    # 공개 API 타입 (PropDefinition, GeneratorOptions, MultiComponentResult 등)
└── emitter.ts   # Emitter 전용 타입
```

#### UITree (최종 IR)

```typescript
interface UITree {
  root: UINode;                    // 루트 노드
  props: PropDefinition[];         // 컴포넌트 props
  arraySlots?: ArraySlotInfo[];    // 배열 슬롯 정보
  derivedVars?: DerivedVar[];      // 파생 변수
  stateVars?: StateVar[];          // 상태 변수 (useState)
}
```

#### UINode 타입들

`ContainerNode`, `TextNode`, `ImageNode`, `VectorNode`, `ButtonNode`, `InputNode`, `LinkNode`, `SlotNode`, `ComponentNode`

#### ConditionNode (조건부 렌더링)

```typescript
type ConditionNode =
  | { type: "eq"; prop: string; value: string }     // prop === value
  | { type: "neq"; prop: string; value: string }    // prop !== value
  | { type: "truthy"; prop: string }                 // !!prop
  | { type: "and"; conditions: ConditionNode[] }     // A && B
  | { type: "or"; conditions: ConditionNode[] }      // A || B
  | { type: "not"; condition: ConditionNode }         // !A
```

#### StyleObject

```typescript
interface StyleObject {
  base: Record<string, string | number>;                      // 공통 스타일
  dynamic: DynamicStyleEntry[];                               // 조건부 스타일
  pseudo: Record<PseudoClass, Record<string, string | number>>; // :hover, :active 등
  mediaQueries?: MediaQueryEntry[];                           // @media 반응형
}
```

---

## 보조 모듈

### PropsAdapter

내부 props → UI용 props 변환 (mockupSvg, 치수 정보 보강)

```
adapters/
└── PropsAdapter.ts    # toPublicProps(): 내부 PropDefinition → 공개 PropDefinition
```

### 유틸리티

```
utils/
└── nameUtils.ts       # toComponentName(): 텍스트 → PascalCase 컴포넌트 이름
```

---

## Compile Flow (전체 흐름)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FigmaCodeGenerator                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FigmaNodeData (document, components, styles, deps, images, SVGs)  │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Layer 1: DataManager                                          │   │
│  │  - nodeMap, styleMap, dependencies (HashMap 구축)              │   │
│  │  - imageUrls, vectorSvgs 정규화                                │   │
│  └─────────────────────────┬────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Layer 2: TreeManager                                          │   │
│  │                                                                │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │ TreeBuilder (메인 + 각 의존성)                           │   │   │
│  │  │  Phase 1: VariantMerger → Props → Slots → Visibility  │   │   │
│  │  │  Phase 2: Styles → Heuristics → UINodeConverter        │   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  │                              │                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │ Post-Processing                                         │   │   │
│  │  │  ComponentPropsLinker → UITreeOptimizer                 │   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  │                              │                                 │   │
│  │  Output: { main: UITree, dependencies: Map<id, UITree> }     │   │
│  └─────────────────────────┬────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Layer 3: ReactEmitter                                         │   │
│  │                                                                │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │ emit() per UITree:                                      │   │   │
│  │  │  Imports → Props → Styles → JSX → Prettier             │   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  │                              │                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │ ReactBundler.bundle() (compile 모드)                    │   │   │
│  │  │  중복 제거 → import 통합 → CSS 접두사 → 이름 충돌 해결    │   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  │                              │                                 │   │
│  │  Output: BundledResult { code, diagnostics }                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 출력 모드

| 메서드 | 출력 | 설명 |
|--------|------|------|
| `generate()` | `GeneratedResult` | 메인 + 의존성 개별 파일 |
| `compile()` | `string \| null` | 단일 번들 파일 |
| `compileWithDiagnostics()` | `CompileResult` | 번들 + 진단 정보 (`{ code: string \| null, diagnostics }`) |
| `buildUITree()` | `{main, deps}` | 디버그: 코드 생성 없이 UITree만 |
| `getPropsDefinition()` | `PropDefinition[]` | UI 컨트롤러용 props 메타데이터 |

---

## 전체 디렉토리 구조

```
src/frontend/ui/domain/code-generator2/
├── FigmaCodeGenerator.ts              # 메인 오케스트레이터
├── index.ts                            # barrel export
│
├── adapters/
│   └── PropsAdapter.ts                 # 내부 → 공개 props 변환
│
├── layers/
│   ├── data-manager/
│   │   └── DataManager.ts              # Layer 1: O(1) 데이터 접근
│   │
│   ├── tree-manager/
│   │   ├── TreeManager.ts              # Layer 2: 트리 빌딩 오케스트레이터
│   │   │
│   │   ├── post-processors/
│   │   │   ├── ComponentPropsLinker.ts
│   │   │   ├── DynamicStyleDecomposer.ts  # 다중 prop 스타일 분해 + 진단
│   │   │   └── UITreeOptimizer.ts
│   │   │
│   │   └── tree-builder/
│   │       ├── TreeBuilder.ts          # 2-Phase 파이프라인
│   │       ├── UINodeConverter.ts
│   │       │
│   │       ├── heuristics/             # 14개 컴포넌트 패턴 감지기 + 폴백/모듈
│   │       │   ├── IHeuristic.ts
│   │       │   ├── HeuristicsRunner.ts
│   │       │   ├── GenericHeuristic.ts
│   │       │   ├── FrameHeuristic.ts
│   │       │   ├── ButtonHeuristic.ts
│   │       │   ├── BadgeHeuristic.ts
│   │       │   ├── CheckboxHeuristic.ts
│   │       │   ├── ChipHeuristic.ts
│   │       │   ├── DropdownHeuristic.ts
│   │       │   ├── FabHeuristic.ts
│   │       │   ├── InputHeuristic.ts
│   │       │   ├── LinkHeuristic.ts
│   │       │   ├── ProfileHeuristic.ts
│   │       │   ├── RadioHeuristic.ts
│   │       │   ├── SearchFieldHeuristic.ts
│   │       │   ├── SegmentedControlHeuristic.ts
│   │       │   ├── SwitchHeuristic.ts
│   │       │   └── module-heuristics/
│   │       │       ├── ModuleHeuristic.ts
│   │       │       └── ResponsiveProcessor.ts
│   │       │
│   │       └── processors/             # 11개 데이터 변환 프로세서
│   │           ├── VariantMerger.ts
│   │           ├── VariantGraphBuilder.ts
│   │           ├── NodeMatcher.ts
│   │           ├── PropsExtractor.ts
│   │           ├── SlotProcessor.ts
│   │           ├── InstanceSlotProcessor.ts
│   │           ├── ArraySlotProcessor.ts
│   │           ├── TextProcessor.ts
│   │           ├── VisibilityProcessor.ts
│   │           ├── StyleProcessor.ts
│   │           ├── ExternalRefsProcessor.ts
│   │           └── utils/
│   │               ├── overrideUtils.ts
│   │               ├── instanceSlotUtils.ts
│   │               ├── propPatterns.ts
│   │               ├── rewritePropConditions.ts
│   │               └── textSlotUtils.ts
│   │
│   └── code-emitter/
│       ├── ICodeEmitter.ts             # Layer 3 인터페이스
│       ├── index.ts
│       └── react/
│           ├── ReactEmitter.ts         # React 코드 생성
│           ├── ReactBundler.ts         # 멀티 컴포넌트 번들링
│           ├── generators/
│           │   ├── index.ts
│           │   ├── ImportsGenerator.ts
│           │   ├── PropsGenerator.ts
│           │   ├── StylesGenerator.ts
│           │   └── JsxGenerator.ts
│           └── style-strategy/
│               ├── index.ts
│               ├── IStyleStrategy.ts
│               ├── EmotionStrategy.ts
│               ├── TailwindStrategy.ts
│               └── groupDynamicByProp.ts
│
├── types/
│   ├── types.ts                        # 내부 타입
│   ├── public.ts                       # 공개 API 타입
│   └── emitter.ts                      # Emitter 전용 타입
│
└── utils/
    └── nameUtils.ts                    # 컴포넌트 이름 정규화
```

---

## Usage Example

```typescript
import { FigmaCodeGenerator } from "./code-generator2";

// 기본 사용 (Emotion)
const generator = new FigmaCodeGenerator(figmaData);
const { code, diagnostics } = await generator.compileWithDiagnostics();

// Tailwind 사용
const generator = new FigmaCodeGenerator(figmaData, {
  styleStrategy: "tailwind",
});
const bundled = await generator.compile();

// 멀티 파일 출력
const result = await generator.generate();
// result.main: EmittedCode
// result.dependencies: Map<id, EmittedCode>

// Props 정보 (UI 컨트롤러용)
const props = generator.getPropsDefinition();

// 디버그: UITree만 확인
const { main, dependencies } = generator.buildUITree();
```

---

## Key Concepts

### Variant Merging
COMPONENT_SET의 여러 variant (예: Size=Large/Small, State=Default/Hover)를 단일 InternalTree로 병합합니다.
노드는 4-Way Position Comparison (비례·좌·가운데·우 정렬)으로 매칭됩니다 — 최소 오차 ≤ 0.1이면 동일 노드. 병합 후 Cross-Depth Squash (IoU ≥ 0.5)로 다른 depth의 중복 노드를 통합합니다.

### Props 변환 규칙
- `State` prop → CSS pseudo-class (`:hover`, `:active`, `:disabled`)
- Boolean props → INSTANCE 가시성 제어 시 Slot props (`React.ReactNode`)
- `componentPropertyReferences` → prop 바인딩

### 의존성 처리
- DataManager가 재귀적으로 모든 의존성 수집
- TreeManager가 ComponentSet별 그룹화 후 variant 병합
- ComponentPropsLinker가 INSTANCE override → 의존성 props 연결
- ReactBundler가 미참조 의존성 필터링 + CSS 충돌 방지

---

## Future Extensions

### 새 플랫폼 추가

```typescript
// ICodeEmitter 인터페이스 구현
class VueEmitter implements ICodeEmitter {
  readonly framework = "vue";
  async emit(uiTree: UITree): Promise<EmittedCode> {
    // Vue SFC 생성 로직
  }
}
```

### 새 스타일 전략 추가

```typescript
// IStyleStrategy 인터페이스 구현
class CssModulesStrategy implements IStyleStrategy {
  name = "css-modules";
  generateStyle(nodeId, nodeName, style, parentPath?) {
    // CSS Modules 생성 로직
  }
}
```

### 새 Heuristic 추가

```typescript
// IHeuristic 인터페이스 구현
class TabBarHeuristic implements IHeuristic {
  score(tree, dataManager, props) {
    // 탭 바 패턴 점수 계산
    return nameMatches ? 20 : 0;
  }
  apply(tree, dataManager, props) {
    // semanticType, props, bindings 설정
  }
}
// HeuristicsRunner에 등록
```
