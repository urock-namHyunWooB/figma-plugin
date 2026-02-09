# TreeBuilder Phase 1: 구조 생성

> **핵심**: 여러 variant를 하나의 트리로 병합하고, props를 추출합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| PreparedDesignData | internalTree, propsMap | variant 병합, props 추출 |

---

## 왜 필요한가?

COMPONENT_SET은 여러 variant를 가집니다:

```
Button (COMPONENT_SET)
├── Size=Large, State=Default   ← variant 1
├── Size=Large, State=Hover     ← variant 2
├── Size=Small, State=Default   ← variant 3
└── Size=Small, State=Hover     ← variant 4
```

하지만 **코드는 하나**입니다:

```tsx
const Button = ({ size, state }) => (
  <button css={getStyles(size, state)}>...</button>
);
```

Phase 1은 여러 variant를 **하나의 통합 트리**로 병합합니다.

---

## 하는 일

### 1. Variant 병합 (VariantProcessor)

**IoU 기반 노드 매칭**

같은 위치에 있는 노드 = 같은 노드로 판단합니다.

```
IoU = 교집합 면적 / 합집합 면적

IoU ≥ 0.8 → 같은 노드
IoU < 0.8 → 다른 노드
```

**병합 과정**

```
variant 1          variant 2          병합 결과
┌────────┐        ┌────────┐        ┌────────┐
│ Frame  │        │ Frame  │        │ Frame  │
│ ┌────┐ │        │ ┌────┐ │   →    │ ┌────┐ │  matchId로 연결
│ │Icon│ │        │ │Icon│ │        │ │Icon│ │
│ └────┘ │        │ └────┘ │        │ └────┘ │
└────────┘        └────────┘        └────────┘
```

**InternalNode 구조**

```typescript
interface InternalNode {
  matchId: string;           // 고유 식별자
  originalIds: string[];     // 각 variant에서의 원본 ID
  nodeType: string;          // FRAME, TEXT, INSTANCE 등
  name: string;
  children: InternalNode[];

  // variant별 데이터
  variantData: Map<string, VariantNodeData>;
}
```

### 2. Props 추출 (PropsProcessor)

Figma의 `componentPropertyDefinitions`를 정규화합니다.

**타입 매핑**

| Figma | 조건 | 결과 |
|-------|-----|------|
| VARIANT | options = ["True", "False"] | boolean |
| VARIANT | otherwise | variant |
| BOOLEAN | - | boolean |
| TEXT | - | string |
| INSTANCE_SWAP | - | slot |

**이름 정규화**

```
"Show Icon#123:456" → showIcon (camelCase)
"Primary Text"      → primaryText
```

---

## 출력

### internalTree

모든 variant가 병합된 단일 트리입니다.

```typescript
InternalNode {
  matchId: "root",
  originalIds: ["704:1", "704:2", "704:3", "704:4"],
  children: [
    InternalNode { matchId: "icon", ... },
    InternalNode { matchId: "label", ... }
  ],
  variantData: Map {
    "Size=Large,State=Default" => { styles: {...}, visible: true },
    "Size=Large,State=Hover" => { styles: {...}, visible: true },
    ...
  }
}
```

### propsMap

정규화된 props 정의입니다.

```typescript
Map {
  "size" => { name: "size", type: "variant", options: ["large", "small"], default: "large" },
  "state" => { name: "state", type: "variant", options: ["default", "hover"], default: "default" },
  "showIcon" => { name: "showIcon", type: "boolean", default: true }
}
```

---

## 다음 단계

Phase 2에서 각 노드의 **시맨틱 역할**과 **숨김 조건**을 분석합니다.

---

## 관련 파일

- `workers/VariantProcessor.ts`
- `workers/PropsProcessor.ts`
