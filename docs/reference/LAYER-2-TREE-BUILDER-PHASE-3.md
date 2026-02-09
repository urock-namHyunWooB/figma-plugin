# TreeBuilder Phase 3: 노드별 변환

> **핵심**: 각 노드의 타입, 스타일, 슬롯, 바인딩을 결정합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| BuildContext (Phase 2 완료) | nodeTypes, nodeStyles, slots 등 | 세부 변환 |

---

## 왜 필요한가?

Phase 2까지는 **분석**만 했습니다. Phase 3에서는 실제 **변환 결과**를 생성합니다:

- 노드 타입: `<div>`, `<span>`, `<img>`, 외부 컴포넌트
- 스타일: 기본, 변이(variant), 의사 클래스
- 슬롯: 어떤 props가 슬롯인가
- 바인딩: 어떤 속성이 props에 연결되는가

---

## 하는 일

### 1. 노드 타입 결정 (NodeProcessor)

각 노드가 최종적으로 어떤 요소가 될지 결정합니다.

| InternalNode 타입 | 조건 | 결과 DesignNodeType |
|-------------------|-----|-------------------|
| TEXT | - | text |
| INSTANCE | 외부 컴포넌트 | external |
| INSTANCE | 내부 (슬롯) | slot |
| FRAME/GROUP | children 있음 | container |
| VECTOR | - | vector |
| 기타 | - | element |

### 2. 스타일 분류 (StyleProcessor)

variant별 스타일을 분류합니다.

```typescript
interface StyleDefinition {
  base: CSSProperties;           // 모든 variant 공통
  variants: VariantStyles;       // variant별 차이
  pseudoClasses: PseudoStyles;   // :hover, :active 등
}
```

**State → Pseudo 변환**

```
State=Hover   → :hover
State=Active  → :active
State=Disabled → :disabled (+ disabled 속성)
State=Focus   → :focus
```

**예시**

```typescript
{
  base: {
    display: "flex",
    padding: "8px 16px",
    borderRadius: "4px"
  },
  variants: {
    size: {
      large: { padding: "12px 24px", fontSize: "16px" },
      small: { padding: "4px 8px", fontSize: "12px" }
    }
  },
  pseudoClasses: {
    hover: { backgroundColor: "#e0e0e0" },
    active: { backgroundColor: "#d0d0d0" }
  }
}
```

### 3. 외부 참조 처리 (InstanceProcessor)

INSTANCE 노드가 참조하는 외부 컴포넌트를 기록합니다.

```typescript
interface ExternalRefData {
  componentId: string;       // 참조하는 컴포넌트 ID
  componentName: string;     // 컴포넌트 이름
  propsMapping: Record<string, string>;  // override props
}
```

### 4. 조건부 렌더링 (VisibilityProcessor)

숨김 조건을 조건부 렌더링 규칙으로 변환합니다.

```typescript
// Phase 2 결과
hiddenConditions.get("icon-node")
  → { type: "prop", prop: "showIcon", value: true }

// Phase 3 변환
conditionals.push({
  nodeId: "icon-node",
  condition: { prop: "showIcon", value: true },
  renderType: "conditional"  // {showIcon && <Icon/>}
});
```

### 5. 슬롯 감지 (SlotProcessor)

INSTANCE_SWAP이나 children 주입 지점을 슬롯으로 변환합니다.

```typescript
interface SlotDefinition {
  name: string;           // props 이름 (예: "icon")
  nodeId: string;         // 주입 지점 노드 ID
  defaultComponent?: string;  // 기본 컴포넌트
  type: "single" | "multiple";
}
```

**감지 조건**

1. `componentPropertyDefinitions`에 INSTANCE_SWAP 타입이 있음
2. visible 토글로 INSTANCE를 제어함
3. 이름에 "slot", "children" 등이 포함됨

---

## 출력

```typescript
// BuildContext에 추가되는 필드들
{
  nodeTypes: Map<string, DesignNodeType>,
  nodeStyles: Map<string, StyleDefinition>,
  nodePropBindings: Map<string, Record<string, string>>,
  nodeExternalRefs: Map<string, ExternalRefData>,
  conditionals: ConditionalRule[],
  slots: SlotDefinition[],
  arraySlots: ArraySlotInfo[]
}
```

---

## 다음 단계

**Phase 4**에서 이 정보들을 조합해 최종 DesignNode 트리를 생성합니다.

---

## 관련 파일

- `workers/NodeProcessor.ts`
- `workers/StyleProcessor.ts`
- `workers/InstanceProcessor.ts`
- `workers/VisibilityProcessor.ts`
- `workers/SlotProcessor.ts`
