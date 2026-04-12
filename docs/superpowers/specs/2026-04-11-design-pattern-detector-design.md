# Design Pattern Detector Layer — 설계 스펙

## 배경

현재 디자이너의 시각 트릭(alpha mask, interaction frame 등)을 인식하는 로직이
여러 processor에 흩어져 있다. 새 패턴이 추가될 때마다 기존 processor를 찾아서
끼워넣어야 하며, "어떤 디자인 패턴이 감지되었는지" 한눈에 파악할 수 없다.

## 목표

- 디자인 패턴 **감지(detection)**를 단일 레이어로 집약
- 감지 결과를 `metadata.designPatterns` annotation으로 노드에 부착
- 기존 processor들은 annotation을 **읽기만** 하여 처리(transform) 수행
- 의존 방향: processor → 감지 레이어 (단방향)

## 비목표

- 처리(transform) 로직은 이동하지 않음 — 기존 processor에 그대로 유지
- 컴포넌트 타입 휴리스틱(14개)은 대상 아님 — 이름+구조 기반 분류이지 디자인 기법 감지가 아님

## Annotation 타입

```typescript
type DesignPattern =
  /** Loading overlay 시 content를 투명 마스크로 가리는 패턴 (visibility:hidden) */
  | {
      type: "alphaMask";
      /** 마스크를 토글하는 prop 이름 (예: "loading") */
      triggerProp: string;
      /** 마스크의 visibility condition (Content에 부여할 조건) */
      condition: ConditionNode;
    }
  /** 디자이너가 hover/active 등 인터랙션 색상을 표현하기 위해 넣은 Interaction 프레임 */
  | { type: "interactionFrame" }
  /** 부모를 99%+ 덮는 ABSOLUTE 배경 노드 — fills를 부모에 흡수하고 제거 대상 */
  | { type: "fullCoverBackground" }
  /** Figma State variant 값을 CSS pseudo-class로 변환하는 패턴 */
  | {
      type: "statePseudoClass";
      /** State를 제어하는 prop 이름 (예: "state") */
      prop: string;
      /** State 값 → CSS pseudo-class 매핑 (예: { "Hover": ":hover", "Active": ":active" }) */
      stateMap: Record<string, string>;
    }
  /** Breakpoint variant를 CSS @media query로 변환하는 패턴 */
  | {
      type: "breakpointVariant";
      /** Breakpoint를 제어하는 prop 이름 (예: "breakpoint") */
      prop: string;
    }
  /** BOOLEAN visibility가 제어하는 노드 내 isExposedInstance INSTANCE → ReactNode 슬롯 승격 대상 */
  | {
      type: "exposedInstanceSlot";
      /** visibility가 제어되는 노드 ID (FRAME 또는 INSTANCE) */
      nodeId: string;
      /** exposed INSTANCE의 노드 ID */
      instanceNodeId: string;
      /** componentPropertyReferences.visible 값 (예: "Leading Icon#438:4") */
      visibleRef: string;
    }
  /** Boolean prop에 의해 노드 위치만 좌우 이동하는 패턴 (Switch 노브 등) */
  | {
      type: "booleanPositionSwap";
      /** 위치 이동을 제어하는 prop 이름 (예: "active") */
      prop: string;
    };
```

## 감지 대상 6개 패턴

| # | 패턴 | 현재 위치 | 감지 조건 요약 |
|---|------|----------|--------------|
| 1 | Alpha Mask | VisibilityProcessor | isMask + ALPHA + componentPropertyReferences.visible |
| 2 | Interaction Frame | InteractionLayerStripper | name === "Interaction" && type === "FRAME" |
| 3 | Full Cover Background | RedundantNodeCollapser | no children, covers parent 99%+, fills only |
| 4 | State → Pseudo-class | StyleProcessor | State prop values ∈ {Hover, Active, Disabled, Focus, Visited} |
| 5 | Breakpoint Variant | ModuleHeuristic | prop name matches breakpoint/device/screen |
| 6 | Boolean Position Swap | BooleanPositionSwap signal | same name/type/size, cy 동일, cx 이동 |

## 아키텍처

### 파일 구조

```
processors/
├── DesignPatternDetector.ts    ← 새로 추가
├── VisibilityProcessor.ts      ← annotation 읽기로 전환
├── InteractionLayerStripper.ts ← annotation 읽기로 전환
├── RedundantNodeCollapser.ts   ← annotation 읽기로 전환
├── StyleProcessor.ts           ← annotation 읽기로 전환
└── variant-merger/
    └── match-engine/
        └── signals/
            └── BooleanPositionSwap.ts ← annotation 읽기로 전환
```

### 파이프라인 위치

TreeBuilder의 Phase 1 최상단, VariantMerger 직후에 실행:

```
Step 1:  VariantMerger.merge()
Step 1.0: DesignPatternDetector.detect()  ← 새로 추가
Step 1.1: InteractionLayerStripper (annotation 소비)
Step 1.2: RedundantNodeCollapser (annotation 소비)
...
Step 4:  VisibilityProcessor (annotation 소비)
Step 6:  StyleProcessor (annotation 소비)
Step 9:  ModuleHeuristic (annotation 소비)
```

단, BooleanPositionSwap은 VariantMerger **내부**에서 매칭 시 필요하므로,
감지 레이어 실행 전에 먼저 동작해야 한다. 이 경우 두 가지 선택지:

- **A**: BooleanPositionSwap 감지만 merger 내부에서 유지하되, 결과를 annotation으로 기록
- **B**: merger 전에 raw 노드 데이터로 pre-scan하여 annotation 부착 → merger가 읽기

현재 BooleanPositionSwap은 이미 MatchSignal 인터페이스로 독립되어 있으므로
**A**가 자연스럽다. merger가 매칭 과정에서 감지하고, 결과를 `metadata.designPatterns`에
기록하면 된다.

### DesignPatternDetector 클래스

```typescript
class DesignPatternDetector {
  constructor(private dataManager: DataManager) {}

  /**
   * InternalTree를 순회하며 디자인 패턴을 감지하고
   * 해당 노드의 metadata.designPatterns에 annotation을 부착한다.
   *
   * BooleanPositionSwap은 제외 — merger 내부에서 별도 부착.
   */
  detect(tree: InternalTree): void {
    this.detectAlphaMasks(tree);
    this.detectInteractionFrames(tree);
    this.detectFullCoverBackgrounds(tree);
    this.detectStatePseudoClasses(tree);
    this.detectBreakpointVariants(tree);
  }
}
```

### 기존 Processor 변경

각 processor에서 감지 로직을 제거하고, annotation 읽기로 대체:

```typescript
// Before (VisibilityProcessor)
if (isMask && maskType === "ALPHA" && componentPropertyReferences?.visible) {
  // 감지 + 처리
}

// After
const patterns = node.metadata?.designPatterns ?? [];
const alphaMask = patterns.find(p => p.type === "alphaMask");
if (alphaMask) {
  // 처리만
}
```

## InternalNode 타입 확장

```typescript
interface InternalNode {
  // ... 기존 필드
  metadata?: {
    // ... 기존 필드
    designPatterns?: DesignPattern[];
  };
}
```

## 마이그레이션 순서

감지 로직 이동은 패턴별로 하나씩 진행하여 회귀를 방지한다:

1. DesignPattern 타입 + InternalNode metadata 확장
2. DesignPatternDetector 클래스 생성 (빈 껍데기)
3. 패턴별 마이그레이션 (각각 감지 이동 → processor에서 annotation 읽기 전환 → 테스트)
   - alphaMask
   - interactionFrame
   - fullCoverBackground
   - statePseudoClass
   - breakpointVariant
4. BooleanPositionSwap — merger 내부에서 annotation 기록 추가
5. 기존 processor에서 감지 로직 잔재 제거

## 테스트 전략

- 기존 테스트가 그대로 통과해야 함 (리팩토링이므로 동작 변경 없음)
- DesignPatternDetector 단위 테스트 추가: fixture 입력 → 올바른 annotation 부착 확인
