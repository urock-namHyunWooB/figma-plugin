# Variant 노드 매칭 원리

TreeBuilder에서 여러 Variant의 노드를 동일 노드로 판별하는 알고리즘을 설명합니다.

- 구현: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`

---

## 1. 전체 매칭 흐름 (isSameNode)

```
┌──────────────────────────────────────────────────────────────┐
│                      노드 매칭 프로세스                        │
├──────────────────────────────────────────────────────────────┤
│  1. 타입 호환성 체크                                          │
│     └─ 같은 타입 OR 둘 다 Shape 계열 → 계속                   │
│     └─ 그 외 → 매칭 안됨                                     │
│                                                              │
│  2. ID 체크                                                  │
│     └─ 같은 ID → 같은 노드                                   │
│                                                              │
│  2.5. INSTANCE componentSetId 체크                           │
│     └─ 둘 다 INSTANCE이고 componentId가 다르면:               │
│        └─ 같은 componentSetId → 계속 (variant 차이)           │
│        └─ 다른 componentSetId → 매칭 안됨                     │
│                                                              │
│  3. 루트 체크                                                │
│     └─ 둘 다 parent 없음 → 같은 노드 (루트끼리)               │
│                                                              │
│  4. 정규화 위치 비교 (padding-aware)                          │
│     └─ ±0.1 이내 → 같은 노드                                 │
│     └─ 실패 시 height ratio fallback                         │
│        └─ root 높이 비율 ≥2배 & 상대좌표 ≤10px → 같은 노드    │
│                                                              │
│  5. TEXT 노드 폴백                                           │
│     └─ 같은 이름 + 같은 부모 타입 → 같은 노드                  │
│                                                              │
│  6. INSTANCE 노드 폴백                                       │
│     └─ 같은 componentSetId → 같은 노드                       │
│     └─ 같은 visible ref → 같은 노드                          │
│                                                              │
│  7. 최종 실패                                                │
│     └─ 부모 노드의 새 자식으로 추가 (별개 노드 처리)            │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 타입 호환성 (Shape 계열)

일반적으로 `nodeA.type !== nodeB.type`이면 매칭 실패이지만, **Shape 계열 타입**은 상호 호환됩니다.

Figma는 같은 도형을 다른 타입으로 표현할 수 있기 때문입니다.

```typescript
SHAPE_TYPES = { "RECTANGLE", "VECTOR", "ELLIPSE", "LINE",
                "STAR", "POLYGON", "BOOLEAN_OPERATION" }

// RECTANGLE ↔ VECTOR → 같은 타입으로 취급
// RECTANGLE ↔ TEXT   → 다른 타입 (매칭 안됨)
```

---

## 3. 정규화 좌표 매칭 (Normalized Coordinate Matching)

### 문제: Variant들은 캔버스 상 다른 위치에 존재

Figma에서 COMPONENT_SET의 variant들은 캔버스 상 **서로 다른 절대 좌표**에 배치됩니다.

```
Figma 캔버스 (절대 좌표):

Variant A (root x=100, width=400)        Variant B (root x=600, width=400)
┌────────────────────┐                   ┌────────────────────┐
│  [Icon]  [Label]   │                   │  [Icon]  [Label]   │
│   x=150             │                   │   x=650             │
└────────────────────┘                   └────────────────────┘
```

절대 좌표로 비교하면 Icon의 x 좌표가 150 vs 650으로 완전히 다릅니다.

### 해결: Padding-Aware 정규화

root의 **padding을 제외한 content box** 기준으로 정규화합니다.

```typescript
// 1. root의 content box 계산
contentX = rootBounds.x + paddingLeft
contentY = rootBounds.y + paddingTop
contentWidth = rootBounds.width - paddingLeft - paddingRight
contentHeight = rootBounds.height - paddingTop - paddingBottom

// 2. content box 기준 정규화
normalizedX = (node.x - contentX) / contentWidth
normalizedY = (node.y - contentY) / contentHeight
```

**왜 padding을 제외하는가?**

Auto Layout의 padding이 variant마다 다를 수 있기 때문입니다 (예: `Tight=true/false`).
padding을 포함하면 같은 위치의 노드도 다르게 정규화됩니다.

```
Variant A (padding=20):    Variant B (padding=10):
┌──[20px]──────[20px]──┐   ┌─[10px]────────[10px]─┐
│         [Icon]       │   │        [Icon]         │
└──────────────────────┘   └───────────────────────┘

단순 정규화: Icon 위치가 다름 (padding 차이로 왜곡)
Content box 정규화: Icon 위치가 같음 ✓
```

### 정규화 예시

| Variant | Icon 절대 x | Root x | Root width | 정규화된 x |
|---------|-------------|--------|------------|------------|
| A       | 150         | 100    | 400        | (150-100)/400 = **0.125** |
| B       | 650         | 600    | 400        | (650-600)/400 = **0.125** |

**좌표 차이 = 0.125 - 0.125 = 0**

### 시각적 이해

```
변환 전 (절대 좌표):
Variant A: ████████[Icon at 150]████████
Variant B:                              ████████[Icon at 650]████████

변환 후 (정규화 좌표):
Variant A: [0.0]────[Icon at 0.125]────────────[1.0]
Variant B: [0.0]────[Icon at 0.125]────────────[1.0]
                         ↑
                    동일한 위치!
```

### 매칭 임계값

정규화된 좌표 차이가 **0.1 이하**면 같은 노드로 판정:

```typescript
const dx = Math.abs(normalizedX1 - normalizedX2);
const dy = Math.abs(normalizedY1 - normalizedY2);

if (dx <= 0.1 && dy <= 0.1) {
  return true; // 같은 노드
}
```

### Multi-mergedNode 재시도

이미 여러 variant가 병합된 노드는 `mergedNodes` 배열에 복수의 원본 ID를 가집니다.
첫 번째 mergedNode의 정규화 값이 0~1 범위를 벗어나면 (hidden/collapsed variant),
다른 mergedNode로 재시도합니다.

```typescript
// mergedNodes[0]으로 먼저 시도
const result = calcNormalizedForMergedNode(node.mergedNodes[0].id);
if (result && result.x >= 0 && result.x <= 1) {
  return result;  // 유효한 결과
}

// 범위 밖이면 다른 mergedNode로 재시도
for (let i = 1; i < node.mergedNodes.length; i++) {
  const alt = calcNormalizedForMergedNode(node.mergedNodes[i].id);
  if (alt && alt.x >= 0 && alt.x <= 1) {
    return alt;  // 유효한 대체 결과
  }
}
```

**왜 필요한가**: visibility toggle로 특정 variant에서 노드가 숨겨져 있을 때,
숨겨진 variant의 좌표는 content box 밖에 위치할 수 있습니다.
이 경우 보이는 variant의 좌표로 정규화해야 정확한 비교가 가능합니다.

---

## 4. Height Ratio Fallback

정규화 매칭이 실패했을 때, variant root 높이 비율이 **2배 이상** 차이나면
정규화 대신 **root 기준 상대 좌표**로 비교합니다.

```typescript
const heightRatio = Math.max(rootA.height, rootB.height)
                  / Math.min(rootA.height, rootB.height);

if (heightRatio >= 2) {
  // root 기준 상대 좌표 차이 ≤10px이면 같은 노드
  const relAx = nodeA.x - rootA.x;
  const relAy = nodeA.y - rootA.y;
  const relBx = nodeB.x - rootB.x;
  const relBy = nodeB.y - rootB.y;
  if (Math.abs(relAx - relBx) <= 10 && Math.abs(relAy - relBy) <= 10) {
    return true;
  }
}
```

**발동 조건**: visibility toggle로 컨테이너가 확장/축소되는 경우

```
Variant A (Icon=true, height=100):
┌─────────────────────────┐
│  [Icon]  [Label]        │
│                         │
│                         │
└─────────────────────────┘

Variant B (Icon=false, height=40):
┌─────────────────────────┐
│          [Label]        │
└─────────────────────────┘

높이 비율 = 100/40 = 2.5 (≥2)
→ 정규화 왜곡 위험 → 상대 좌표(±10px)로 비교
```

---

## 5. 노드 타입별 폴백 전략

위치 매칭이 실패했을 때 노드 타입별로 추가 매칭을 시도합니다.

### TEXT 노드 폴백

**조건**: 같은 이름 + 같은 부모 타입

```typescript
// "Label"이라는 TEXT 노드가 위치는 다르지만
// 부모가 둘 다 FRAME이면 → 같은 역할의 텍스트
if (nodeA.type === "TEXT" && nodeA.name === nodeB.name) {
  if (nodeA.parent?.type === nodeB.parent?.type) {
    return true;
  }
}
```

**예시**:
```
Variant A:                Variant B:
FRAME                     FRAME
└── Label (TEXT, x=0.1)   └── Label (TEXT, x=0.3)

위치 차이 0.2 > 0.1 → 위치 매칭 실패
이름 같음 ("Label") + 부모 타입 같음 (FRAME) → 폴백 매칭 성공
```

### INSTANCE 노드 폴백

두 가지 기준으로 매칭합니다:

**1. componentSetId 매칭** — 같은 컴포넌트 세트의 다른 variant

```typescript
// componentId가 다르더라도 같은 componentSetId에 속하면 같은 노드
// (예: Icon variant=filled vs Icon variant=outlined)
const setIdA = getComponentSetId(compIdA);
const setIdB = getComponentSetId(compIdB);
if (setIdA && setIdB && setIdA === setIdB) {
  return true;  // 같은 컴포넌트 세트의 variant 차이
}
```

**2. visible ref 매칭** — 같은 visibility prop으로 제어되는 노드

```typescript
// componentPropertyReferences.visible이 같으면 같은 노드
const visRefA = nodeA.componentPropertyReferences?.visible;
const visRefB = nodeB.componentPropertyReferences?.visible;
if (visRefA && visRefB && visRefA === visRefB) {
  return true;
}
```

### 폴백 전략 요약

| 노드 타입 | 폴백 기준 | 설명 |
|-----------|-----------|------|
| TEXT | 이름 + 부모 타입 | 위치가 달라도 같은 역할의 텍스트 |
| INSTANCE | componentSetId | 같은 컴포넌트 세트의 variant 차이 |
| INSTANCE | visible ref | 같은 visibility prop으로 제어 |
| FRAME | 없음 | 위치만으로 판단 |

---

## 6. INSTANCE componentSetId 조기 차단

isSameNode의 **2.5단계**에서 INSTANCE 노드의 componentSetId를 조기에 검사합니다.
이 단계는 위치 매칭보다 **먼저** 실행되어, 서로 다른 컴포넌트 세트의 INSTANCE가
위치가 같더라도 병합되는 것을 방지합니다.

```typescript
// INSTANCE 노드끼리 componentId가 다를 때:
// 같은 componentSetId에 속하는지 확인
if (nodeA.type === "INSTANCE" && nodeB.type === "INSTANCE") {
  if (compIdA !== compIdB) {
    const setIdA = getComponentSetId(compIdA);
    const setIdB = getComponentSetId(compIdB);
    if (!(setIdA && setIdB && setIdA === setIdB)) {
      return false;  // 다른 컴포넌트 세트 → 즉시 거부
    }
    // 같은 componentSetId → 계속 진행 (위치/visible ref로 확인)
  }
}
```

**예시**:
```
Variant A:              Variant B:
FRAME                   FRAME
├── SearchIcon (x=0.1)  ├── CloseIcon (x=0.1)   ← 위치 동일!
└── Label               └── Label

SearchIcon의 componentSetId ≠ CloseIcon의 componentSetId
→ 위치가 같아도 매칭 거부 (다른 컴포넌트)
```

---

## 7. 한계 및 주의사항

### 레이아웃 변화 시 매칭 실패

```
hasIcon=true:   [Icon x=0.05] [Label x=0.15]
hasIcon=false:                [Label x=0.05]
                                    ↑
                              차이 = 0.10
```

- 정규화된 x 좌표 차이가 0.1로 경계선
- 이 경우 TEXT 폴백이 구제 (이름 + 부모 타입이 같으면 매칭 성공)

### 매칭 실패 결과

매칭 실패 시 해당 노드는 **variant-specific 노드**가 되어 최종 코드에 중복 출력될 수 있습니다.

### Cross-Depth 잔여 중복

노드 매칭은 같은 depth의 children끼리 비교하므로, variant 간 트리 구조가 다르면 같은 역할의 노드가 **다른 depth에 중복으로 남을 수 있습니다**. 이 문제는 병합 후 `UpdateSquashByIou`의 cross-depth squash 후처리가 해결합니다. 자세한 내용은 [변형병합 개념원리 — Cross-Depth Squash](변형병합-개념원리.md#cross-depth-squash)를 참조하세요.

---

## 참고

- 구현: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- 관련: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts`
- 테스트: `test/compiler/nodeMatherChildPattern.test.ts`
