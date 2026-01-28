# FigmaCodeGenerator Architecture

> 이 문서는 FigmaCodeGenerator의 새로운 아키텍처를 정의합니다.
> 기존 코드를 이 구조로 점진적으로 리팩토링합니다.

## Overview

FigmaCodeGenerator는 Figma 디자인 데이터를 React/Vue/Swift 등의 컴포넌트 코드로 변환합니다.

### 설계 원칙

1. **레이어 분리**: 각 레이어는 명확한 단일 책임을 가짐
2. **단방향 의존성**: 상위 레이어만 하위 레이어를 참조
3. **플랫폼 독립적 IR**: TreeBuilder까지는 플랫폼에 독립적
4. **Policy 기반 확장**: 하드코딩 대신 정책으로 동작 커스터마이징
5. **의존성 그래프 기반 컴파일**: 토폴로지 정렬로 컴파일 순서 결정

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      FigmaCodeGenerator                          │
│                          (Facade)                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     PolicyManager                           │ │
│  │                    (정책 관리 및 제공)                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  DependencyAnalyzer                         │ │
│  │        (의존성 그래프 구축 + 토폴로지 정렬 + 순환 감지)         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │    ┌────────────┐   ┌───────────┐   ┌───────────┐          │ │
│  │    │DataPreparer│ → │TreeBuilder│ → │CodeEmitter│          │ │
│  │    └────────────┘   └───────────┘   └───────────┘          │ │
│  │         ↑                ↑               ↑                  │ │
│  │         └────────────────┴───────────────┘                  │ │
│  │                    Policy Hooks                              │ │
│  │                                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                        Bundler                              │ │
│  │                  (번들링 + 포맷팅 + 최적화)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 컴포넌트 요약

| 컴포넌트 | 역할 |
|---------|------|
| **PolicyManager** | 정책 관리 및 각 단계에 제공 |
| **DependencyAnalyzer** | 의존성 분석, 컴파일 순서 결정 |
| **DataPreparer** | 데이터 저장/조회 + enrichment + props 추출 |
| **TreeBuilder** | 플랫폼 독립적 IR 생성 |
| **CodeEmitter** | 플랫폼별 코드 생성 (React/Vue/Swift) |
| **Bundler** | 번들링 + 포맷팅 |

---

## DataPreparer

### 책임

- Figma 원본 데이터를 준비된 형태로 변환
- 데이터 접근을 위한 효율적인 자료구조 제공 (HashMap 등)
- INSTANCE override 병합
- Variant 데이터 enrichment
- Props 정의 추출

### Input / Output

```typescript
Input:  FigmaNodeData (raw JSON from Figma)
Output: PreparedDesignData
```

### 인터페이스

```typescript
interface DataPreparer {
  prepare(data: FigmaNodeData): PreparedDesignData;
}

interface PreparedDesignData {
  document: PreparedNode;
  styleTree: StyleTree;
  dependencies: Map<string, FigmaNodeData>;  // 아직 준비 안된 raw 데이터
  props: ExtractedProps;

  // 조회 메서드
  getNodeById(id: string): PreparedNode | undefined;
  getStyleById(id: string): StyleTree | undefined;
}
```

### Policy Hooks

```typescript
interface DataPreparerPolicy {
  /** 특정 레이어 무시 */
  shouldIgnore?: (node: FigmaNode) => boolean;

  /** 노드 변환 규칙 */
  transformNode?: (node: FigmaNode) => FigmaNode;

  /** 커스텀 props 추출 */
  extractCustomProps?: (node: FigmaNode) => Record<string, any>;
}
```

### 내부 구성

```
DataPreparer
  │
  ├── DataStore (현재 SpecDataManager)
  │     - HashMap 생성 및 관리
  │     - 데이터 조회 메서드
  │
  ├── OverrideProcessor (현재 InstanceOverrideManager)
  │     - INSTANCE override 병합
  │
  ├── Enricher (현재 VariantEnrichManager)
  │     - SVG, 의존성 정보 enrichment
  │
  └── PropsExtractor
        - Props 정의 추출
```

### 현재 코드 매핑

| 현재 | 새 구조 |
|------|---------|
| SpecDataManager | DataPreparer.DataStore |
| InstanceOverrideManager | DataPreparer.OverrideProcessor |
| VariantEnrichManager | DataPreparer.Enricher |
| PropsExtractor | DataPreparer.PropsExtractor |

---

## Layer 2: TreeBuilder

### 책임

- 정규화된 데이터를 플랫폼 독립적인 IR(Intermediate Representation)로 변환
- Variant 병합 (IoU 기반 노드 매칭)
- 스타일 분류 (base/dynamic/pseudo)
- 조건부 렌더링 로직 결정
- Slot 및 배열 슬롯 감지

### Input / Output

```typescript
Input:  PreparedDesignData
Output: DesignTree (Platform-Independent IR)
```

### 변환 파이프라인

```
PreparedDesignData
    │
    ▼
Phase 1: 구조 생성
    VariantProcessor.merge()     → internalTree (IoU 기반 variant 병합)
    PropsProcessor.extract()     → propsMap
    │
    ▼
Phase 2: 분석
    NodeProcessor.detectSemanticRoles() → semanticRoles
    VisibilityProcessor.processHidden() → hiddenConditions
    │
    ▼
Phase 3: 노드별 변환
    NodeProcessor.mapTypes()             → nodeTypes
    StyleProcessor.build()               → nodeStyles
    StyleProcessor.applyPositions()      → nodeStyles (position 추가)
    StyleProcessor.handleRotation()      → nodeStyles (rotation 처리)
    PropsProcessor.bindProps()           → nodePropBindings
    SlotProcessor.detectTextSlots()      → propsMap, nodePropBindings 업데이트
    VisibilityProcessor.resolve()        → conditionals
    SlotProcessor.detectSlots()          → slots
    SlotProcessor.detectArraySlots()     → arraySlots
    InstanceProcessor.buildExternalRefs() → nodeExternalRefs
    │
    ▼
Phase 4: 최종 조립
    NodeConverter.assemble()             → root (DesignNode 트리)
    │
    ▼
DesignTree { root, props, slots, conditionals, arraySlots }
```

### 내부 구성

```
tree-builder/
├── TreeBuilder.ts           # 파이프라인 오케스트레이터
├── index.ts                 # 모듈 public API
│
├── workers/
│   ├── VariantProcessor.ts  # IoU 기반 variant 병합 + 스쿼시
│   ├── PropsProcessor.ts    # Props 추출 + 바인딩
│   ├── NodeProcessor.ts     # 타입 매핑 + 의미론적 역할 감지
│   ├── StyleProcessor.ts    # 스타일 분류 + Position + Rotation
│   ├── VisibilityProcessor.ts # 조건 파싱 + visibility 추론 + hidden 처리
│   ├── SlotProcessor.ts     # Slot 감지 (text/instance/array)
│   ├── InstanceProcessor.ts # INSTANCE override + 외부 참조
│   ├── NodeConverter.ts     # InternalNode → DesignNode 최종 조립
│   ├── BuildContext.ts      # 파이프라인 상태 타입 (BuildContext, SemanticRoleEntry, ExternalRefData)
│   ├── constants.ts         # IoU 임계값 등 상수
│   │
│   ├── interfaces/          # Worker 인터페이스 (도메인별 분리)
│   │   ├── index.ts         # barrel re-export
│   │   ├── core.ts          # InternalNode, MergedNodeWithVariant, Figma 타입
│   │   ├── variant.ts       # IVariantMerger, ISquashByIou
│   │   ├── node.ts          # INodeTypeMapper, ISemanticRoleDetector
│   │   ├── style.ts         # IStyleClassifier, IPositionStyler
│   │   ├── props.ts         # IPropsExtractor, IPropsLinker
│   │   ├── slot.ts          # ISlotDetector, ITextSlotDetector
│   │   ├── visibility.ts    # IVisibilityDetector, IVisibilityResolver, IConditionParser, IHiddenNodeProcessor
│   │   └── instance.ts      # IInstanceOverrideHandler, IExternalRefBuilder
│   │
│   └── utils/               # 공유 유틸리티
│       ├── treeUtils.ts     # traverseTree, flattenTree, mapTree
│       ├── typeGuards.ts    # hasChildren, isInstanceNode, isComponentSetNode
│       ├── instanceUtils.ts # INSTANCE ID 처리, FigmaFill
│       ├── stringUtils.ts   # toCamelCase, toPascalCase, toKebabCase
│       └── nodeTypeUtils.ts # Figma → DesignNodeType 매핑 테이블
```

### Policy Hooks

```typescript
interface TreeBuilderPolicy {
  /** 특정 레이어를 특정 컴포넌트로 해석 */
  interpretAs?: Map<string, ComponentType>;

  /** 컴포넌트 분리 기준 */
  shouldSplitComponent?: (node: DesignNode) => boolean;

  /** 커스텀 조건부 렌더링 규칙 */
  customConditionals?: (node: DesignNode) => ConditionalRule | null;

  /** 배열 슬롯 감지 커스터마이징 */
  detectArraySlot?: (nodes: DesignNode[]) => ArraySlotInfo | null;
}
```

### 레거시 코드 매핑

| 레거시 | TreeBuilder |
|--------|-------------|
| CreateSuperTree | VariantProcessor.merge() |
| _TempAstTree (스타일) | StyleProcessor.build/applyPositions/handleRotation() |
| _TempAstTree (visibility) | VisibilityProcessor.processHidden/resolve() |
| _TempAstTree (props) | PropsProcessor.bindProps() |
| _FinalAstTree (slots) | SlotProcessor.detectSlots/detectTextSlots/detectArraySlots() |
| _FinalAstTree (외부참조) | InstanceProcessor.buildExternalRefs() |
| NodeMatcher (IoU) | VariantProcessor.calculateIoU() |
| ArraySlotDetector | SlotProcessor.detectArraySlot() |

---

## CodeEmitter

### 책임

- 플랫폼별 코드 생성 (React, Vue, Swift 등)
- 스타일 전략 적용 (Emotion, Tailwind, CSS Modules 등)
- 코드 컨벤션 적용
- 디자인 시스템 메타데이터 삽입

### Input / Output

```typescript
Input:  DesignTree + Policy
Output: EmittedCode
```

### 인터페이스

```typescript
interface CodeEmitter {
  emit(tree: DesignTree, policy: CodeEmitterPolicy): EmittedCode;
}

interface EmittedCode {
  code: string;           // 컴포넌트 코드
  imports: ImportStatement[];
  types: string;          // TypeScript 타입 정의
}
```

### Policy Hooks

```typescript
interface CodeEmitterPolicy {
  /** 타겟 플랫폼 */
  platform: 'react' | 'vue' | 'svelte' | 'swift' | 'kotlin';

  /** 스타일 전략 */
  styleStrategy: 'emotion' | 'tailwind' | 'css-modules' | 'styled-components';

  /** 코드 컨벤션 */
  convention?: {
    componentStyle: 'function' | 'arrow' | 'class';
    naming: 'camelCase' | 'PascalCase' | 'kebab-case';
    exportStyle: 'default' | 'named';
  };

  /** 메타데이터 삽입 */
  injectMetadata?: (code: EmittedCode) => EmittedCode;

  /** 커스텀 import 추가 */
  additionalImports?: ImportStatement[];

  /** 디자인 시스템 통합 */
  designSystem?: {
    name: string;
    componentMapping: Map<string, string>;  // DesignNode type → DS component
    tokenMapping: Map<string, string>;      // Figma token → DS token
  };
}
```

### 현재 코드 매핑

| 현재 | 새 구조 |
|------|---------|
| ReactGenerator | CodeEmitter 구현체 (ReactEmitter) |
| StyleStrategy | CodeEmitterPolicy.styleStrategy |
| generate-imports/ | CodeEmitter 내부 |
| generate-interface/ | CodeEmitter 내부 |
| generate-styles/ | CodeEmitter 내부 |
| generate-component/ | CodeEmitter 내부 |

---

## Bundler

### 책임

- 여러 컴포넌트 코드 번들링
- Import 문 정리 및 최적화
- 코드 포맷팅 (Prettier 등)
- 최종 출력 최적화

### Input / Output

```typescript
Input:  Map<ComponentId, EmittedCode>
Output: string (최종 코드)
```

### 인터페이스

```typescript
interface Bundler {
  bundle(codes: Map<ComponentId, EmittedCode>, policy: BundlerPolicy): string;
}
```

### Policy Hooks

```typescript
interface BundlerPolicy {
  /** 코드 스타일 */
  codeStyle?: 'airbnb' | 'google' | 'standard' | 'custom';

  /** Prettier 설정 */
  prettier?: PrettierConfig;

  /** Import 정렬 규칙 */
  importOrder?: string[];

  /** 번들링 옵션 */
  bundling?: {
    singleFile: boolean;        // 단일 파일로 출력
    separateTypes: boolean;     // 타입 정의 분리
    separateStyles: boolean;    // 스타일 분리
  };

  /** 후처리 훅 */
  postProcess?: (code: string) => string;
}
```

### 현재 코드 매핑

| 현재 | 새 구조 |
|------|---------|
| DependencyManager.bundle() | Bundler |

---

## PolicyManager

### 책임

- Policy 정의 로드 및 검증
- 각 단계에 해당하는 Policy 제공
- Policy 병합 (기본값 + 사용자 정의)

### 인터페이스

```typescript
interface PolicyManager {
  load(policy: Partial<Policy>): void;
  getDataPreparerPolicy(): DataPreparerPolicy;
  getTreeBuilderPolicy(): TreeBuilderPolicy;
  getCodeEmitterPolicy(): CodeEmitterPolicy;
  getBundlerPolicy(): BundlerPolicy;
}

interface Policy {
  dataPreparer?: DataPreparerPolicy;
  treeBuilder?: TreeBuilderPolicy;
  codeEmitter?: CodeEmitterPolicy;
  bundler?: BundlerPolicy;
}
```

---

## DependencyAnalyzer

### 책임

- 전체 의존성 그래프 구축
- 순환 의존성 감지
- 토폴로지 정렬로 컴파일 순서 결정
- 각 컴포넌트가 한 번만 컴파일되도록 보장

### 왜 필요한가?

컴포넌트가 다른 컴포넌트를 **정적으로 참조**할 때:

```
COMPONENT_SET: Card
  └── COMPONENT: variant
        ├── CloseButton (INSTANCE) ← 정적 참조, 항상 렌더링
        └── {children}              ← slot

생성되는 코드:
  function Card({ children }) {
    return (
      <div>
        <CloseButton />  {/* CloseButton도 함께 컴파일 필요 */}
        {children}
      </div>
    );
  }
```

### 인터페이스

```typescript
interface DependencyAnalyzer {
  /**
   * 의존성 그래프 구축
   * @param rootData 루트 컴포넌트 데이터
   * @returns 의존성 그래프 (인접 리스트)
   */
  buildGraph(rootData: FigmaNodeData): DependencyGraph;

  /**
   * 토폴로지 정렬 (컴파일 순서 결정)
   * @throws CircularDependencyError 순환 의존성 발견 시
   */
  topologicalSort(graph: DependencyGraph): ComponentId[];

  /**
   * 순환 의존성 감지
   */
  detectCycles(graph: DependencyGraph): Cycle[] | null;
}

interface DependencyGraph {
  nodes: Map<ComponentId, ComponentInfo>;
  edges: Map<ComponentId, Set<ComponentId>>;  // A → B (A가 B를 의존)
}

interface ComponentInfo {
  id: ComponentId;
  name: string;
  data: FigmaNodeData;
}

type ComponentId = string;  // componentSetId
type Cycle = ComponentId[];
```

### 컴파일 흐름

```typescript
class FigmaCodeGenerator {
  async compile(): Promise<string> {
    // 1단계: 의존성 분석
    const graph = this.dependencyResolver.buildGraph(this.data);

    // 2단계: 순환 의존성 확인
    const cycles = this.dependencyResolver.detectCycles(graph);
    if (cycles) {
      throw new CircularDependencyError(cycles);
    }

    // 3단계: 토폴로지 정렬 (의존되는 것부터)
    const order = this.dependencyResolver.topologicalSort(graph);
    // 예: [Badge, Icon, Large, Case]

    // 4단계: 순서대로 컴파일 (각각 한 번만)
    const compiled = new Map<ComponentId, GeneratedCode>();
    for (const componentId of order) {
      const componentData = graph.nodes.get(componentId)!.data;
      const code = await this.pipeline.compileSingle(componentData);
      compiled.set(componentId, code);
    }

    // 5단계: 번들링
    return this.codeFormatter.bundle(Array.from(compiled.values()));
  }
}
```

### 예시: 의존성 그래프

```
입력:
  Case → Large, Icon
  Large → Badge
  Icon → (없음)
  Badge → (없음)

그래프:
  Case ──→ Large ──→ Badge
    │
    └───→ Icon

토폴로지 정렬 결과:
  [Badge, Icon, Large, Case]
  또는
  [Icon, Badge, Large, Case]
  (둘 다 유효)

컴파일 순서:
  1. Badge 컴파일
  2. Icon 컴파일
  3. Large 컴파일 (Badge 참조 가능)
  4. Case 컴파일 (Large, Icon 참조 가능)
```

### 기존 코드와 비교

| 기존 방식 | 새 방식 |
|----------|---------|
| 재귀적으로 FigmaCodeGenerator 생성 | 의존성 그래프 먼저 구축 |
| `_skipDependencyCompilation` 플래그 | 토폴로지 정렬로 순서 보장 |
| 같은 dependency 중복 컴파일 가능 | 각 컴포넌트 한 번만 컴파일 |
| 순환 의존성 감지 어려움 | 명시적 순환 감지 |

---

## Compile Flow (전체 흐름)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FigmaCodeGenerator                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1단계: 의존성 분석 (DependencyAnalyzer)                       │   │
│  │                                                               │   │
│  │    FigmaNodeData                                              │   │
│  │         │                                                     │   │
│  │         ▼                                                     │   │
│  │    ┌─────────────┐      ┌─────────────┐                      │   │
│  │    │ buildGraph  │  →   │ Dependency  │                      │   │
│  │    │             │      │   Graph     │                      │   │
│  │    └─────────────┘      └──────┬──────┘                      │   │
│  │                                │                              │   │
│  │                                ▼                              │   │
│  │                     ┌──────────────────┐                     │   │
│  │                     │ topologicalSort  │                     │   │
│  │                     └────────┬─────────┘                     │   │
│  │                              │                                │   │
│  │                              ▼                                │   │
│  │                   [Badge, Icon, Large, Case]                  │   │
│  │                      (컴파일 순서)                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│                                ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2단계: 순서대로 변환                                           │   │
│  │                                                               │   │
│  │    for each component in order:                               │   │
│  │                                                               │   │
│  │    FigmaNodeData ──→ DataPreparer ──→ PreparedData           │   │
│  │                                            │                  │   │
│  │                                            ▼                  │   │
│  │                                      TreeBuilder              │   │
│  │                                            │                  │   │
│  │                                            ▼                  │   │
│  │                                       DesignTree (IR)         │   │
│  │                                            │                  │   │
│  │                                            ▼                  │   │
│  │                                       CodeEmitter             │   │
│  │                                            │                  │   │
│  │                                            ▼                  │   │
│  │                                       EmittedCode             │   │
│  │                                            │                  │   │
│  │                              ┌─────────────┴─────────────┐   │   │
│  │                              ▼                           ▼   │   │
│  │                         Cache에 저장              다음 컴포넌트 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│                                ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3단계: 번들링 (Bundler)                                       │   │
│  │                                                               │   │
│  │    Map<ComponentId, EmittedCode>                             │   │
│  │              │                                                │   │
│  │              ▼                                                │   │
│  │    ┌─────────────────┐                                       │   │
│  │    │     Bundler     │                                       │   │
│  │    │  - import 정리   │                                       │   │
│  │    │  - 번들링        │                                       │   │
│  │    │  - 포맷팅        │                                       │   │
│  │    └────────┬────────┘                                       │   │
│  │             │                                                 │   │
│  │             ▼                                                 │   │
│  │       Final Code (string)                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 단일 컴포넌트 변환 흐름

```
FigmaNodeData
     │
     ▼
┌────────────┐
│DataPreparer│ + DataPreparerPolicy
└─────┬──────┘
     │
     ▼
PreparedDesignData
     │
     ▼
┌───────────┐
│TreeBuilder│ + TreeBuilderPolicy
└─────┬─────┘
     │
     ▼
DesignTree (플랫폼 독립적 IR)
     │
     ▼
┌───────────┐
│CodeEmitter│ + CodeEmitterPolicy
└─────┬─────┘
     │
     ▼
EmittedCode
```

---

## Usage Example

```typescript
import { FigmaCodeGenerator } from '@anthropic/figma-to-code';

// 기본 사용
const generator = new FigmaCodeGenerator(figmaData);
const code = await generator.generate();

// Policy 적용
const generator = new FigmaCodeGenerator(figmaData, {
  policy: {
    treeBuilder: {
      interpretAs: new Map([
        ['PrimaryButton', 'Button'],
        ['SecondaryButton', 'Button'],
      ]),
    },
    codeEmitter: {
      platform: 'react',
      styleStrategy: 'tailwind',
      designSystem: {
        name: 'MyDesignSystem',
        componentMapping: new Map([
          ['Button', '@myds/Button'],
        ]),
      },
    },
    bundler: {
      codeStyle: 'airbnb',
      bundling: { singleFile: true },
    },
  },
});

const code = await generator.generate();
```

---

## Migration Plan

### Phase 1: 인터페이스 정의 ✅
- [x] 각 컴포넌트 인터페이스 TypeScript 정의
- [x] Policy 타입 정의
- [x] 중간 데이터 구조 (PreparedDesignData, DesignTree) 정의
- [x] DependencyGraph 타입 정의

> 구현: `src/frontend/ui/domain/compiler/types/architecture.ts`

### Phase 2: DependencyAnalyzer 구현 ✅
- [x] 의존성 그래프 구축 로직 (buildGraph)
- [x] 토폴로지 정렬 구현 (topologicalSort) - Kahn's algorithm
- [x] 순환 의존성 감지 (detectCycles) - DFS 기반
- [ ] 기존 DependencyManager 재귀 로직 대체 (Phase 3 이후)

> 구현: `src/frontend/ui/domain/compiler/core/DependencyAnalyzer.ts`
> 테스트: `test/compiler/dependencyAnalyzer.test.ts`

### Phase 3: DataPreparer 통합 ✅
- [x] SpecDataManager + PropsExtractor 통합
- [x] DataPreparer 인터페이스 구현
- [x] PreparedDesignData 출력 구조 정의
- [ ] ~~InstanceOverrideManager, VariantEnrichManager 통합~~ → 분리 유지 결정 (DependencyManager 전용)

> 구현:
> - `src/frontend/ui/domain/compiler/core/data-preparer/DataPreparer.ts`
> - `src/frontend/ui/domain/compiler/core/data-preparer/PreparedDesignData.ts`

#### ⚠️ TODO: PreparedNode 정규화 (Phase 4에서 검토)

현재 구현은 `SceneNode`를 그대로 사용합니다. `PreparedNode`로의 정규화는 다음 이유로 보류:

1. **기존 코드 의존성**: Engine, CreateSuperTree, CreateAstTree 등이 SceneNode의 세부 속성(`type`, `fills`, `componentPropertyReferences` 등)에 직접 접근
2. **TreeBuilder에서 변환이 더 적합**: Phase 4에서 `DesignNode`로 변환할 때 정규화하는 것이 자연스러움
3. **중복 변환 방지**: PreparedNode → DesignNode 이중 변환 불필요

**나중에 검토할 사항:**
- `architecture.ts`의 `PreparedDesignData` 인터페이스에서 `PreparedNode` → `SceneNode`로 수정 필요
- 또는 Phase 4에서 TreeBuilder 구현 시 PreparedNode 정규화 포함

### Phase 4: TreeBuilder 구현 ✅
- [x] VariantProcessor: IoU 기반 variant 병합 (CreateSuperTree 대체)
- [x] StyleProcessor: 스타일 분류 + position + rotation
- [x] VisibilityProcessor: 조건 파싱 + visibility 추론
- [x] PropsProcessor: props 추출 + 바인딩
- [x] SlotProcessor: text/instance/array slot 감지
- [x] InstanceProcessor: override 처리 + 외부 참조
- [x] NodeConverter: InternalNode → DesignNode 최종 조립
- [x] TreeBuilder: BuildContext 기반 파이프라인 오케스트레이터
- [x] 155개 단위 테스트 작성

> 구현: `src/frontend/ui/domain/compiler/core/tree-builder/`

#### Phase 4 리팩토링 ✅
- [x] Magic Number 상수화 (constants.ts)
- [x] 테스트 파일명 정리 (Processor 1:1 매핑)
- [x] 레거시 코드 제거 (MergedNodeInfo 등)
- [x] any 타입 제거 (FigmaFill, InstanceChildNode 등 구체 타입)
- [x] TreeTraverser 유틸리티 (traverseTree/mapTree로 13개 인라인 순회 통합)
- [x] BuildContext 타입 분리 (BuildContext.ts)
- [x] interfaces.ts 분리 (interfaces/ 디렉토리, 8개 파일)

### Phase 5: CodeEmitter 정리
- [ ] ReactGenerator를 CodeEmitter 인터페이스로 래핑 (ReactEmitter)
- [ ] StyleStrategy를 Policy로 이동

### Phase 6: Bundler 분리
- [ ] DependencyManager에서 번들링 로직만 분리
- [ ] 포맷팅/최적화 로직 추가

### Phase 7: PolicyManager 시스템
- [ ] PolicyManager 구현
- [ ] 각 컴포넌트에 Policy Hook 연결
- [ ] 기본 Policy 정의

---

## Future Extensions

### 새 플랫폼 추가
```typescript
// VueGenerator 구현
class VueGenerator implements CodeGenerator {
  generate(tree: DesignTree, policy: CodeGeneratorPolicy): GeneratedCode {
    // Vue SFC 생성 로직
  }
}
```

### 새 스타일 전략 추가
```typescript
// CSS Modules 전략
class CssModulesStrategy implements StyleStrategy {
  generateStyles(node: DesignNode): StyleOutput {
    // CSS Modules 생성 로직
  }
}
```

### 커스텀 Policy 플러그인
```typescript
// 회사별 디자인 시스템 플러그인
const myCompanyPolicy: Policy = {
  tree: {
    interpretAs: loadFromFigmaPluginData(),
  },
  code: {
    designSystem: {
      name: '@mycompany/design-system',
      componentMapping: loadComponentMapping(),
    },
  },
};
```
