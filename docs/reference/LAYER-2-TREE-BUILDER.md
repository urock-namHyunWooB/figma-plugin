# Layer 2: TreeBuilder

> **핵심**: Figma 구조를 플랫폼 독립적 IR(DesignTree)로 변환합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| PreparedDesignData | DesignTree | variant 병합, 스타일 분류, 슬롯 감지 |

---

## 왜 필요한가?

Figma 데이터와 React 코드 사이에는 **개념적 차이**가 있습니다.

| Figma | React |
|-------|-------|
| 여러 variant가 별도 트리 | 하나의 컴포넌트에 조건부 스타일 |
| visible=false | 조건부 렌더링 |
| INSTANCE | 외부 컴포넌트 import |
| componentPropertyReferences | props 바인딩 |

TreeBuilder는 이 차이를 **중간 표현(IR)**으로 해소합니다.

---

## 내부 구조

```
PreparedDesignData
     │
     ▼
┌─────────────────────────────────────────┐
│              TreeBuilder                 │
├─────────────────────────────────────────┤
│                                         │
│  Phase 1: 구조 생성                      │
│  ├── variant 병합 (IoU 기반)            │
│  └── props 추출                         │
│                                         │
│  Phase 2: 분석                           │
│  ├── 시맨틱 역할 판별                    │
│  └── 숨김 조건 추출                      │
│                                         │
│  Heuristics (COMPONENT_SET 전용)         │
│  └── 컴포넌트 패턴 감지 (Input 등)       │
│                                         │
│  Phase 3: 노드별 변환                    │
│  ├── 타입 결정                          │
│  ├── 스타일 분류                        │
│  ├── 외부 참조 처리                      │
│  ├── 조건부 렌더링                       │
│  └── 슬롯 감지                          │
│                                         │
│  Phase 4: 최종 조립                      │
│  └── DesignNode 트리 생성               │
│                                         │
└─────────────────────────────────────────┘
     │
     ▼
DesignTree
```

---

## 각 단계 요약

| 단계 | 질문 | 주요 결과 |
|------|-----|----------|
| **Phase 1** | "여러 variant를 어떻게 합칠까?" | internalTree, propsMap |
| **Phase 2** | "각 노드가 무엇이고, 언제 보여야 하나?" | semanticRoles, hiddenConditions |
| **Heuristics** | "이 컴포넌트가 Input인가?" | componentType, nodeSemanticTypes |
| **Phase 3** | "타입, 스타일, 슬롯은?" | nodeTypes, nodeStyles, slots 등 |
| **Phase 4** | "최종 트리는?" | root (DesignNode) |

---

## BuildContext

각 단계는 **BuildContext**를 받아서 확장하고 반환합니다.

```typescript
interface BuildContext {
  // 입력 (불변)
  data: PreparedDesignData;
  totalVariantCount: number;

  // Phase 1
  internalTree?: InternalNode;
  propsMap?: Map<string, PropDefinition>;

  // Phase 2
  semanticRoles?: Map<string, SemanticRoleEntry>;
  hiddenConditions?: Map<string, ConditionNode>;

  // Heuristics
  componentType?: ComponentType;
  nodeSemanticTypes?: Map<string, SemanticTypeEntry>;

  // Phase 3
  nodeTypes?: Map<string, DesignNodeType>;
  nodeStyles?: Map<string, StyleDefinition>;
  nodePropBindings?: Map<string, Record<string, string>>;
  nodeExternalRefs?: Map<string, ExternalRefData>;
  conditionals: ConditionalRule[];
  slots: SlotDefinition[];
  arraySlots: ArraySlotInfo[];

  // Phase 4
  root?: DesignNode;
}
```

---

## 출력: DesignTree

```typescript
interface DesignTree {
  root: DesignNode;              // 트리 구조
  componentType?: ComponentType; // "input", "button" 등
  props: PropDefinition[];       // Props 정의
  slots: SlotDefinition[];       // 슬롯 정의
  conditionals: ConditionalRule[]; // 조건부 렌더링
  arraySlots: ArraySlotInfo[];   // 배열 슬롯
}
```

---

## 상세 문서

- [Phase 1: 구조 생성](./LAYER-2-TREE-BUILDER-PHASE-1.md)
- [Phase 2: 분석](./LAYER-2-TREE-BUILDER-PHASE-2.md)
- [Heuristics](./LAYER-2-TREE-BUILDER-HEURISTICS.md)
- [Phase 3: 노드별 변환](./LAYER-2-TREE-BUILDER-PHASE-3.md)
- [Phase 4: 최종 조립](./LAYER-2-TREE-BUILDER-PHASE-4.md)

---

## 관련 파일

```
core/tree-builder/
├── TreeBuilder.ts           # 파이프라인 오케스트레이터
├── workers/
│   ├── VariantProcessor.ts
│   ├── PropsProcessor.ts
│   ├── NodeProcessor.ts
│   ├── StyleProcessor.ts
│   ├── VisibilityProcessor.ts
│   ├── SlotProcessor.ts
│   ├── InstanceProcessor.ts
│   ├── NodeConverter.ts
│   └── CleanupProcessor.ts
└── heuristics/
    ├── HeuristicsRunner.ts
    └── components/
        └── InputHeuristic.ts
```
