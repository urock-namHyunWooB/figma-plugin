# TreeBuilder Phase 2: 분석

> **핵심**: 각 노드의 시맨틱 역할과 숨김 조건을 분석합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| internalTree | semanticRoles, hiddenConditions | 역할 판별, 숨김 조건 추출 |

---

## 왜 필요한가?

Figma 노드 이름만으로는 역할을 알 수 없습니다:

```
"Frame 123"  → 이게 wrapper인가? 의미있는 컨테이너인가?
"Icon"       → 아이콘인가? 이미지인가?
```

또한 `visible=false`가 **왜** false인지 알아야 합니다:

```
visible=false (항상)     → 완전히 제거
visible=false (조건부)   → {condition && <Node/>}
```

---

## 하는 일

### 1. 시맨틱 역할 판별

노드의 특성을 분석해 역할을 부여합니다.

| 역할 | 조건 | 의미 |
|-----|------|------|
| `text` | TEXT 노드 | 텍스트 요소 |
| `icon` | INSTANCE + 아이콘 컴포넌트 참조 | 아이콘 |
| `image` | fills에 IMAGE가 있음 | 이미지 |
| `vector` | VECTOR 노드 | SVG |
| `container` | children이 있는 FRAME | 컨테이너 |
| `wrapper` | 단일 자식만 있는 FRAME | 래퍼 (잠재적 제거 대상) |

```typescript
interface SemanticRoleEntry {
  role: SemanticRole;
  confidence: number;  // 0~1
  reason: string;
}
```

### 2. 숨김 조건 추출 (VisibilityProcessor)

각 노드가 **언제** 보이는지 분석합니다.

**분석 과정**

```
variant별 visible 상태 수집:
  Size=Large, State=Default  → visible: true
  Size=Large, State=Hover    → visible: true
  Size=Small, State=Default  → visible: false
  Size=Small, State=Hover    → visible: false

패턴 감지:
  → size === "large" 일 때만 visible
  → 조건: { prop: "size", value: "large" }
```

**결과 타입**

```typescript
type ConditionNode =
  | { type: "always"; visible: boolean }
  | { type: "prop"; prop: string; value: string | boolean }
  | { type: "and"; conditions: ConditionNode[] }
  | { type: "or"; conditions: ConditionNode[] };
```

**예시**

```typescript
// showIcon === true 일 때만 visible
{ type: "prop", prop: "showIcon", value: true }

// size === "large" AND state === "default" 일 때 visible
{
  type: "and",
  conditions: [
    { type: "prop", prop: "size", value: "large" },
    { type: "prop", prop: "state", value: "default" }
  ]
}
```

---

## 출력

### semanticRoles

```typescript
Map<string, SemanticRoleEntry> {
  "matchId-1" => { role: "container", confidence: 0.9, reason: "has children" },
  "matchId-2" => { role: "icon", confidence: 1.0, reason: "INSTANCE referencing icon component" },
  "matchId-3" => { role: "text", confidence: 1.0, reason: "TEXT node" }
}
```

### hiddenConditions

```typescript
Map<string, ConditionNode> {
  "matchId-2" => { type: "prop", prop: "showIcon", value: true },
  "matchId-5" => { type: "always", visible: false }  // 항상 숨김 → 제거 대상
}
```

---

## 다음 단계

**Heuristics**에서 컴포넌트 전체 패턴을 감지합니다 (Input, Button 등).

---

## 관련 파일

- `workers/NodeProcessor.ts` (detectSemanticRoles)
- `workers/VisibilityProcessor.ts`
