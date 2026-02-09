# TreeBuilder Phase 4: 최종 조립

> **핵심**: 모든 분석 결과를 조합해 최종 DesignNode 트리를 생성합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| BuildContext (Phase 3 완료) | DesignTree | 최종 트리 조립 |

---

## 왜 필요한가?

Phase 1~3은 **분석과 분류**를 수행했습니다. 하지만 결과는 여러 Map에 흩어져 있습니다:

```
nodeTypes:      Map<string, DesignNodeType>
nodeStyles:     Map<string, StyleDefinition>
conditionals:   ConditionalRule[]
slots:          SlotDefinition[]
...
```

Phase 4는 이것들을 **하나의 트리 구조**로 조립합니다.

---

## 하는 일

### 1. InternalNode → DesignNode 변환 (NodeConverter)

각 InternalNode를 DesignNode로 변환합니다.

```typescript
function convertNode(internal: InternalNode, ctx: BuildContext): DesignNode {
  const nodeId = internal.matchId;

  return {
    id: nodeId,
    name: internal.name,
    type: ctx.nodeTypes.get(nodeId) ?? "element",
    styles: ctx.nodeStyles.get(nodeId),
    propBindings: ctx.nodePropBindings.get(nodeId),
    externalRef: ctx.nodeExternalRefs.get(nodeId),
    children: internal.children.map(child => convertNode(child, ctx))
  };
}
```

### 2. 트리 정리 (CleanupProcessor)

불필요한 노드를 제거하거나 단순화합니다.

**제거 대상**

| 조건 | 처리 |
|-----|------|
| `visible: false` (항상) | 트리에서 제거 |
| 빈 wrapper (자식 1개, 스타일 없음) | 자식으로 대체 |
| 빈 container (자식 없음) | 제거 |

**예시**

```
Before:
Frame (no style)
└── Frame (no style)
    └── Text

After:
Text
```

### 3. 최종 DesignTree 생성

```typescript
function assembleDesignTree(ctx: BuildContext): DesignTree {
  // InternalTree를 DesignNode로 변환
  const root = convertNode(ctx.internalTree!, ctx);

  // 트리 정리
  const cleanedRoot = cleanupTree(root, ctx);

  return {
    root: cleanedRoot,
    componentType: ctx.componentType,
    props: Array.from(ctx.propsMap!.values()),
    slots: ctx.slots,
    conditionals: ctx.conditionals,
    arraySlots: ctx.arraySlots
  };
}
```

---

## 출력: DesignTree

```typescript
interface DesignTree {
  root: DesignNode;
  componentType?: ComponentType;
  props: PropDefinition[];
  slots: SlotDefinition[];
  conditionals: ConditionalRule[];
  arraySlots: ArraySlotInfo[];
}

interface DesignNode {
  id: string;
  name: string;
  type: DesignNodeType;
  styles?: StyleDefinition;
  propBindings?: Record<string, string>;
  externalRef?: ExternalRefData;
  slotInfo?: SlotInfo;
  children: DesignNode[];
}
```

**예시**

```typescript
{
  root: {
    id: "root",
    name: "Button",
    type: "container",
    styles: {
      base: { display: "flex", padding: "8px 16px" },
      variants: { size: { large: {...}, small: {...} } },
      pseudoClasses: { hover: {...} }
    },
    children: [
      {
        id: "icon",
        name: "Icon",
        type: "slot",
        slotInfo: { name: "icon", type: "single" }
      },
      {
        id: "label",
        name: "Label",
        type: "text",
        propBindings: { content: "label" }
      }
    ]
  },
  props: [
    { name: "size", type: "variant", options: ["large", "small"] },
    { name: "label", type: "string", default: "Button" },
    { name: "icon", type: "slot" }
  ],
  slots: [
    { name: "icon", nodeId: "icon", type: "single" }
  ],
  conditionals: [
    { nodeId: "icon", condition: { prop: "showIcon", value: true } }
  ]
}
```

---

## 다음 단계

DesignTree는 **Layer 3: ReactEmitter**로 전달됩니다.

ReactEmitter는 DesignTree를 실제 React/TypeScript 코드로 변환합니다.

---

## 관련 파일

- `workers/NodeConverter.ts`
- `workers/CleanupProcessor.ts`
- `TreeBuilder.ts` (assembleDesignTree)
