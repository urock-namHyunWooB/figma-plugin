# TreeBuilder 파이프라인 개요

> 이 문서는 TreeBuilder의 전체 파이프라인 흐름을 설명합니다.

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TreeBuilder.build()                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Phase 1: 구조 생성                                                 │  │
│  │                                                                    │  │
│  │  PreparedDesignData                                                │  │
│  │        │                                                           │  │
│  │        ▼                                                           │  │
│  │  VariantProcessor.merge()          → internalTree                  │  │
│  │        │                                                           │  │
│  │        ▼                                                           │  │
│  │  CleanupProcessor.removeInstance() → INSTANCE 내부 노드 제거        │  │
│  │        │                                                           │  │
│  │        ▼                                                           │  │
│  │  PropsProcessor.extract()          → propsMap                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Phase 2: 분석                                                      │  │
│  │                                                                    │  │
│  │  NodeProcessor.detectSemanticRoles() → semanticRoles               │  │
│  │        │                                                           │  │
│  │        ▼                                                           │  │
│  │  VisibilityProcessor.processHidden() → hiddenConditions            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Heuristics (COMPONENT_SET 전용)                                    │  │
│  │                                                                    │  │
│  │  HeuristicsRunner.run()            → componentType                 │  │
│  │                                    → nodeSemanticTypes             │  │
│  │                                    → excludePropsFromStyles        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Phase 3: 노드별 변환                                               │  │
│  │                                                                    │  │
│  │  NodeProcessor.mapTypes()          → nodeTypes                     │  │
│  │  StyleProcessor.build()            → nodeStyles (base/dynamic/pseudo)│ │
│  │  StyleProcessor.applyPositions()   → nodeStyles에 position 추가    │  │
│  │  StyleProcessor.handleRotation()   → nodeStyles에 rotation 처리    │  │
│  │  InstanceProcessor.buildExternal() → nodeExternalRefs              │  │
│  │  VisibilityProcessor.resolve()     → conditionals                  │  │
│  │  PropsProcessor.bindProps()        → nodePropBindings              │  │
│  │  SlotProcessor.detectTextSlots()   → propsMap 업데이트             │  │
│  │  SlotProcessor.detectSlots()       → slots                         │  │
│  │  SlotProcessor.detectArraySlots()  → arraySlots                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Phase 4: 최종 조립                                                 │  │
│  │                                                                    │  │
│  │  NodeConverter.assemble()          → root (DesignNode 트리)        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│                         DesignTree                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 데이터 변환 흐름

```
SceneNode (Figma 원본)
     │
     ▼ Phase 1
InternalNode (병합된 트리, mergedNode에 variant 정보)
     │
     ▼ Phase 2-3
Map<nodeId, 각종 메타데이터>
  - nodeTypes, nodeStyles, nodePropBindings, etc.
     │
     ▼ Phase 4
DesignNode (플랫폼 독립적 IR)
     │
     ▼ ReactEmitter
React Component Code
```

---

## BuildContext 상태 흐름

BuildContext는 파이프라인 전체를 통해 전달되는 상태 객체입니다.

```typescript
interface BuildContext {
  // 입력 (불변)
  data: PreparedDesignData;
  policy?: TreeBuilderPolicy;
  totalVariantCount: number;

  // Phase 1 후
  internalTree?: InternalNode;
  propsMap?: Map<string, PropDefinition>;

  // Phase 2 후
  semanticRoles?: Map<string, SemanticRoleEntry>;
  hiddenConditions?: Map<string, ConditionNode>;

  // Heuristics 후
  componentType?: ComponentType;
  nodeSemanticTypes?: Map<string, SemanticTypeEntry>;
  excludePropsFromStyles?: Set<string>;

  // Phase 3 후
  nodeTypes?: Map<string, DesignNodeType>;
  nodeStyles?: Map<string, StyleDefinition>;
  nodePropBindings?: Map<string, Record<string, string>>;
  nodeExternalRefs?: Map<string, ExternalRefData>;
  conditionals: ConditionalRule[];
  slots: SlotDefinition[];
  arraySlots: ArraySlotInfo[];

  // Phase 4 후
  root?: DesignNode;
}
```

---

## 각 Phase 요약

### Phase 1: 구조 생성

여러 variant를 하나의 통합 트리로 병합합니다.

| 단계 | 하는 일 | 결과 |
|-----|--------|------|
| VariantProcessor.merge() | IoU 기반 variant 병합 | `internalTree` |
| CleanupProcessor | INSTANCE 내부 노드 제거 | `internalTree` 정리 |
| PropsProcessor.extract() | props 정의 추출 | `propsMap` |

**상세**: [PHASE-1-STRUCTURE-CREATION.md](./PHASE-1-STRUCTURE-CREATION.md)

---

### Phase 2: 분석

노드의 역할과 숨김 조건을 분석합니다.

| 단계 | 하는 일 | 결과 |
|-----|--------|------|
| NodeProcessor.detectSemanticRoles() | 노드 역할 판별 (root, button, text 등) | `semanticRoles` |
| VisibilityProcessor.processHidden() | variant별 숨김 조건 추출 | `hiddenConditions` |

---

### Heuristics (COMPONENT_SET 전용)

컴포넌트 패턴을 감지합니다.

| 단계 | 하는 일 | 결과 |
|-----|--------|------|
| HeuristicsRunner.run() | Input/Button 등 패턴 감지 | `componentType`, `nodeSemanticTypes` |

---

### Phase 3: 노드별 변환

각 노드에 대해 타입, 스타일, 바인딩 등을 계산합니다.

| 단계 | 하는 일 | 결과 |
|-----|--------|------|
| NodeProcessor.mapTypes() | Figma 타입 → DesignNodeType | `nodeTypes` |
| StyleProcessor.build() | variant 스타일 → base/dynamic/pseudo | `nodeStyles` |
| StyleProcessor.applyPositions() | position: absolute 계산 | `nodeStyles` 업데이트 |
| StyleProcessor.handleRotation() | 회전 요소 처리 | `nodeStyles` 업데이트 |
| InstanceProcessor.buildExternalRefs() | 외부 컴포넌트 참조 | `nodeExternalRefs` |
| VisibilityProcessor.resolve() | 숨김 조건 → ConditionalRule | `conditionals` |
| PropsProcessor.bindProps() | componentPropertyReferences 바인딩 | `nodePropBindings` |
| SlotProcessor.detectTextSlots() | TEXT prop 바인딩 감지 | `propsMap` 업데이트 |
| SlotProcessor.detectSlots() | INSTANCE slot 감지 | `slots` |
| SlotProcessor.detectArraySlots() | 반복 INSTANCE 감지 | `arraySlots` |

---

### Phase 4: 최종 조립

모든 Map 데이터를 조합하여 DesignNode 트리를 생성합니다.

| 단계 | 하는 일 | 결과 |
|-----|--------|------|
| NodeConverter.assemble() | Map들 → DesignNode 트리 | `root` |

---

## 핵심 타입

### InternalNode

Phase 1에서 생성되는 중간 표현입니다.

```typescript
interface InternalNode {
  id: string;
  type: string;           // "FRAME", "TEXT", "VECTOR" 등
  name: string;
  parent: InternalNode | null;
  children: InternalNode[];
  mergedNode: MergedNodeWithVariant[];  // 이 노드에 병합된 variant 정보
  bounds?: { x, y, width, height };
}

interface MergedNodeWithVariant {
  id: string;
  name: string;
  variantName?: string;  // "Size=Large, State=Default"
}
```

### DesignNode

Phase 4에서 생성되는 최종 IR입니다.

```typescript
interface DesignNode {
  id: string;
  type: DesignNodeType;   // "container", "text", "image", "vector", "slot", "component", "input"
  name: string;
  styles: StyleDefinition;
  children: DesignNode[];
  conditions?: ConditionalRule[];
  propBindings?: Record<string, string>;
  externalRef?: ExternalRef;
  semanticRole?: SemanticRole;
  semanticType?: SemanticType;
  textContent?: string;
  vectorSvg?: string;
}
```

### StyleDefinition

스타일의 세 가지 분류입니다.

```typescript
interface StyleDefinition {
  base: Record<string, string | number>;      // 모든 variant에서 동일
  dynamic: Array<{                             // prop에 따라 달라지는 스타일
    condition: ConditionNode;
    style: Record<string, string | number>;
  }>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;  // :hover, :active 등
}
```

---

## 관련 문서

- [Phase 1 상세](./PHASE-1-STRUCTURE-CREATION.md)
- [아키텍처 개요](../ARCHITECTURE-NEW-PIPELINE.md)
