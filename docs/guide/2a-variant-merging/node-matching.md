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
│     └─ 같은 타입 OR 둘 다 Shape 계열 OR 둘 다 Container 계열  │
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
│  4. 4-Way 위치 비교 (비례·좌·가운데·우 기준)                   │
│     └─ X축·Y축 각 4가지 비교 최소값 ≤ 0.1 → 같은 노드         │
│     └─ 실패 시 height ratio fallback                         │
│        └─ root 높이 비율 ≥2배 & 상대좌표 ≤10px → 같은 노드    │
│                                                              │
│  5. TEXT 노드 폴백                                           │
│     └─ 같은 이름 + 같은 부모 타입 → 같은 노드                  │
│                                                              │
│  5.5. Auto Layout 왼쪽 컨텍스트 보정 매칭                      │
│     └─ 부모가 Auto Layout이면:                                │
│        └─ 같은 타입 + 유사 크기(±5px) 확인                     │
│        └─ 왼쪽 형제 type+size 매칭 → extra 요소 식별            │
│        └─ extra 크기+gap으로 위치 보정 → ±10px이면 같은 노드    │
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

## 2. 타입 호환성 (Shape 계열 + Container 계열)

일반적으로 `nodeA.type !== nodeB.type`이면 매칭 실패이지만, **Shape 계열**과 **Container 계열** 타입은 각각 상호 호환됩니다.

Figma는 같은 도형을 다른 타입으로, 같은 컨테이너를 GROUP/FRAME으로 표현할 수 있기 때문입니다.

```typescript
SHAPE_TYPES = { "RECTANGLE", "VECTOR", "ELLIPSE", "LINE",
                "STAR", "POLYGON", "BOOLEAN_OPERATION" }

CONTAINER_TYPES = { "GROUP", "FRAME" }

// RECTANGLE ↔ VECTOR → 같은 타입으로 취급 (Shape 호환)
// GROUP ↔ FRAME      → 같은 타입으로 취급 (Container 호환)
// RECTANGLE ↔ TEXT    → 다른 타입 (매칭 안됨)
```

**Container 호환이 필요한 이유**: Figma variant에서 Auto Layout 설정에 따라 같은 컨테이너가 GROUP 또는 FRAME으로 전환될 수 있습니다.

---

## 3. 위치 매칭: 4-Way Comparison

### 문제: Variant들은 캔버스 상 다른 위치에 존재

Figma에서 COMPONENT_SET의 variant들은 캔버스 상 **서로 다른 절대 좌표**에 배치되고,
variant마다 root의 **크기(width/height)와 padding**이 다를 수 있습니다.

```
Figma 캔버스:

Variant L (width=165, pad=28)       Variant S (width=89, pad=8)
┌──[28]──────────[28]──┐            ┌─[8]──────[8]─┐
│  [Icon]  [Label] [→] │            │ [Ic] [La] [→]│
└──────────────────────┘            └──────────────┘
contentWidth = 109                  contentWidth = 73
```

### 해결: Content Box 기준 4가지 비교

root의 **padding을 제외한 content box**를 기준으로 **4가지 비교를 동시에** 수행합니다.
X축·Y축 각각 4개 중 **최소 오차**를 취하여, 둘 다 ≤ 0.1이면 매칭.

```
offset = node.x - contentBox.x  (content box 왼쪽 경계로부터의 거리)
avgW   = (contentWidthA + contentWidthB) / 2

비교 1) 비례 배치:  |offsetA/cwA - offsetB/cwB|
비교 2) 좌정렬:    |offsetA - offsetB| / avgW
비교 3) 가운데정렬: |centerA - centerB| / avgW
비교 4) 우정렬:    |rightGapA - rightGapB| / avgW

minDiffX = min(비교1, 비교2, 비교3, 비교4)
minDiffY도 동일하게 계산 (top/middle/bottom)
```

**왜 4가지인가?** — 단일 비교로는 모든 정렬 방식을 커버할 수 없습니다:

| 배치 방식 | 비례 | 좌기준 | 가운데기준 | 우기준 | **최소값** |
|----------|------|--------|----------|--------|-----------|
| 비례 25% | **0** | 0.03 | 0.03 | 0.09 | **0** |
| 좌정렬 | 0.007 | **0** | 0.06 | 0.12 | **0** |
| 가운데정렬 | 0.007 | 0.06 | **0** | 0.06 | **0** |
| 우정렬 | 0.007 | 0.12 | 0.06 | **0** | **0** |

어떤 정렬이든 해당 기준점에서 오차 0 → 최소값이 항상 0 또는 0에 근접.

### Content Box 계산

```typescript
contentX = rootBounds.x + paddingLeft
contentY = rootBounds.y + paddingTop
contentWidth = rootBounds.width - paddingLeft - paddingRight
contentHeight = rootBounds.height - paddingTop - paddingBottom
```

**왜 padding을 제외하는가?** — Auto Layout의 padding이 variant마다 다를 수 있기 때문 (예: `Tight=true/false`).

```
Variant A (padding=20):    Variant B (padding=10):
┌──[20px]──────[20px]──┐   ┌─[10px]────────[10px]─┐
│         [Icon]       │   │        [Icon]         │
└──────────────────────┘   └───────────────────────┘

단순 정규화: Icon 위치가 다름 (padding 차이로 왜곡)
Content box 정규화: Icon 위치가 같음 ✓
```

### 실제 검증 (urockButton fixture, Size=L vs Size=S)

```
Size=L filled: contentBox w=109, h=24
Size=S filled: contentBox w=73,  h=20
widthRatio = 1.49x

LEFT icon_arrow:
  offset: L=0, S=0 → 비례=0, 좌=0 → minDiffX = 0 ✓

RIGHT icon_arrow:
  offset: L=85, S=57
  → 비례: |85/109 - 57/73| = 0.001
  → 좌:   |85-57|/91 = 0.308
  → 우:   |0-0|/91 = 0         ← 우정렬 기준이 구제!
  → minDiffX = 0 ✓
```

### Multi-mergedNode 탐색

이미 여러 variant가 병합된 노드는 `mergedNodes` 배열에 복수의 원본 ID를 가집니다.
`getContentBoxInfo()`는 mergedNodes를 순회하여 **유효한 contentBox를 찾으면 즉시 반환**합니다.

---

## 3.5. Shape 크기 유사도 검증

4-Way 위치 비교가 성공하더라도, **Shape 타입 노드**는 추가로 크기 유사도를 검증합니다.

```typescript
// Shape 타입끼리 위치가 매칭되면 크기 비교 추가 수행
if (SHAPE_TYPES.has(nodeA.type) && SHAPE_TYPES.has(nodeB.type)) {
  if (!isSimilarSize(nodeA, nodeB)) return false;
}
```

**isSimilarSize 기준**: width와 height 각각의 ratio가 1.3배 이내

```
nodeA: ELLIPSE (width=24, height=24)
nodeB: ELLIPSE (width=8,  height=8)

widthRatio  = 24/8 = 3.0 > 1.3 → 매칭 거부 ✓
```

**필요한 이유**: 동심원(concentric circles)처럼 중심 좌표가 같지만 크기가 다른 Shape 노드의 false positive 매칭을 방지합니다.

```
Variant A:                  Variant B:
┌──────────────────┐        ┌──────────────────┐
│  ╭──────────╮    │        │  ╭──────────╮    │
│  │  ╭────╮  │    │        │  │  ╭────╮  │    │
│  │  │ ●  │  │    │        │  │  │ ●  │  │    │
│  │  ╰────╯  │    │        │  │  ╰────╯  │    │
│  ╰──────────╯    │        │  ╰──────────╯    │
└──────────────────┘        └──────────────────┘
   외원(24px)과 내원(8px)의 중심이 동일 → 위치 매칭은 성공
   그러나 크기 ratio = 3.0 → 매칭 거부 (별개 노드)
```

---

## 4. Height Ratio Fallback

4-way 비교 실패 시, variant root 높이 비율이 **2배 이상** 차이나면
**root 기준 상대 좌표**로 비교합니다 (±10px).

```typescript
const heightRatio = Math.max(rootA.height, rootB.height)
                  / Math.min(rootA.height, rootB.height);

if (heightRatio >= 2) {
  const relAx = nodeA.x - rootA.x;
  const relBx = nodeB.x - rootB.x;
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
└─────────────────────────┘

Variant B (Icon=false, height=40):
┌─────────────────────────┐
│          [Label]        │
└─────────────────────────┘

높이 비율 = 100/40 = 2.5 (≥2)
→ 4-way 비교 왜곡 위험 → 상대 좌표(±10px)로 비교
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

**주의: 같은 componentId로는 매칭하지 않음**

같은 컴포넌트가 한 variant 안에서 **여러 위치**에 사용될 수 있습니다.
(예: `leftIcon`과 `rightIcon`이 같은 arrow 컴포넌트)
componentId가 같다고 무조건 매칭하면 서로 다른 위치의 아이콘이 잘못 병합됩니다.
→ 같은 componentId의 INSTANCE는 위치 비교(Step 4)에 의존해야 합니다.

### 폴백 전략 요약

| 노드 타입 | 폴백 기준 | 설명 |
|-----------|-----------|------|
| TEXT | 이름 + 부모 타입 | 위치가 달라도 같은 역할의 텍스트 |
| **모든 타입** | **Auto Layout 왼쪽 컨텍스트** | **위치 시프트를 보정하여 매칭 (Stage 5.5)** |
| INSTANCE | componentSetId | 같은 컴포넌트 세트의 variant 차이 |
| INSTANCE | visible ref | 같은 visibility prop으로 제어 |

---

## 5.5. Auto Layout 왼쪽 컨텍스트 보정 매칭

Auto Layout 컨테이너에서 variant 간 요소 추가/제거 시, 후속 노드의 위치가 밀려
4-way 비교가 실패할 수 있습니다. 이때 **왼쪽(위쪽) 형제 컨텍스트**를 비교하여
위치를 보정한 뒤 다시 비교합니다.

### 전제 조건

1. **같은 타입** (Stage 1에서 이미 검증됨)
2. **부모가 Auto Layout** (`layoutMode === "HORIZONTAL" | "VERTICAL"`)
3. **유사한 크기** (width, height 각각 ±5px)

### 알고리즘

```
A: [Header(40)] [Badge(100)] [Content(60)] [Deco(30)]
B: [Header(40)] [Content(60)]

Content(A) vs Content(B) 비교:

1. 왼쪽 형제 수집 (원본 variant 데이터에서):
   leftA = [Header(FRAME,40), Badge(RECT,100)]
   leftB = [Header(FRAME,40)]

2. type+size greedy 매칭:
   Header ↔ Header → 공유
   Badge → extra in A

3. 보정량 = extra 크기 + gap:
   shiftA = 100 + 10 = 110

4. 보정된 위치 비교:
   posA = 160 - 110 = 50
   posB = 50
   |50 - 50| = 0 ≤ 10 → 매칭 ✓
```

### False Positive 방지

공유 컨텍스트가 없는 경우(`sharedCount === 0`), **부모의 자식 수**를 확인합니다:
- 자식 수가 **같으면** → 요소 재배치(rearrangement) → **거부**
- 자식 수가 **다르면** → 요소 추가/제거 → **허용**

```
반례: LeftIcon과 RightIcon (같은 타입, 같은 크기)
A: [LeftIcon(18)] [Text(100)] [RightIcon(18)]
B: [LeftIcon(18)] [Text(100)] [RightIcon(18)]

LeftIcon(A) vs RightIcon(B) 비교:
  leftA = [] → leftB = [LeftIcon, Text] → sharedCount = 0
  자식 수: A=3, B=3 (같음) → 재배치 → 거부 ✓
```

### 원본 데이터 참조

merge 과정에서 `InternalNode.parent.children`이 stale해질 수 있으므로,
`dataManager.getById()`로 **원본 variant 데이터**에서 형제를 조회합니다.

### 제한사항

- `primaryAxisAlignItems`가 `SPACE_BETWEEN` 또는 `CENTER`이면 gap이 가변이므로
  정확한 위치 보정 불가 (현재는 `itemSpacing` 값 사용)
- 4-way 비교가 먼저 매칭하는 경우 Stage 5.5에 도달하지 않음
  (같은 타입의 extra가 같은 정렬 위치에 있으면 4-way가 잘못 매칭할 수 있음)

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

### Y축 Figma 정수 반올림 오차

Figma는 좌표를 정수로 반올림하므로, 가운데 정렬 시 1~2px의 미세 오차가 발생할 수 있습니다.

```
Size=L: contentHeight=24, icon=24 → offsetY=0
Size=S: contentHeight=20, icon=16 → offsetY=2 (가운데 정렬 반올림)

기존 비례 비교: |0/24 - 2/20| = 0.100 (경계선!)
4-way 비교:    top=0.091, middle=0.091, bottom=0.091 → min=0.091 (여유 있음)
```

### 레이아웃 변화 시 매칭 실패

```
hasIcon=true:   [Icon x=0.05] [Label x=0.15]
hasIcon=false:                [Label x=0.05]
                                    ↑
                              차이 = 0.10
```

- 좌정렬 기준으로는 차이 0이므로 4-way 비교에서 매칭 성공
- 그래도 실패하면 TEXT 폴백이 구제 (이름 + 부모 타입이 같으면 매칭 성공)

### 매칭 실패 결과

매칭 실패 시 해당 노드는 **variant-specific 노드**가 되어 최종 코드에 중복 출력될 수 있습니다.

### Cross-Depth 잔여 중복

노드 매칭은 같은 depth의 children끼리 비교하므로, variant 간 트리 구조가 다르면 같은 역할의 노드가 **다른 depth에 중복으로 남을 수 있습니다**. 이 문제는 병합 후 `UpdateSquashByIou`의 cross-depth squash 후처리가 해결합니다. 자세한 내용은 [변형병합 알고리즘 — Cross-Depth Squash](merging-algorithm.md#cross-depth-squash)를 참조하세요.

---

## 참고

- 구현: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- 관련: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts`
- 테스트: `test/compiler/nodeMatherChildPattern.test.ts`
- 테스트: `test/tree-builder/node-matcher-auto-layout.test.ts` (Stage 5.5 단위 테스트)
- 테스트: `test/tree-builder/auto-layout-shift-e2e.test.ts` (Stage 5.5 E2E 테스트)
