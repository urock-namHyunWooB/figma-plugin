# 변형 병합 (Variant Merging) 개념 원리

## 목차
1. [개요](#개요)
2. [왜 필요한가?](#왜-필요한가)
3. [핵심 개념](#핵심-개념)
4. [병합 알고리즘](#병합-알고리즘)
5. [노드 매칭 방식](#노드-매칭-방식)
6. [Cross-Depth Squash](#cross-depth-squash)
7. [예제](#예제)

---

## 개요

**변형 병합(Variant Merging)**은 Figma의 COMPONENT_SET에 포함된 여러 variant들을 하나의 통합된 InternalTree로 병합하는 과정입니다.

### 입력과 출력

```
입력: 24개의 개별 variant 트리
  ├── Size=default, Variant=default, Icon=false
  ├── Size=default, Variant=primary, Icon=false
  ├── Size=default, Variant=danger, Icon=false
  └── ... (21 more variants)

출력: 1개의 통합 InternalTree
  Button (24 merged)
  ├── Icon (12 merged)        ← Icon=true인 variant들
  └── Label (24 merged)       ← 모든 variant
```

---

## 왜 필요한가?

### 문제: Variant 폭발

Figma에서 버튼 컴포넌트를 만들 때:
- Size: default, small, large (3개)
- Variant: default, primary, danger, secondary (4개)
- Icon: true, false (2개)

**결과**: 3 × 4 × 2 = **24개의 variant**가 생성됨

각 variant를 개별 컴포넌트로 생성하면:
- 24개의 React 컴포넌트 생성
- 중복 코드 대량 발생
- Props로 제어 불가능

### 해결: 병합을 통한 단일 컴포넌트 생성

```tsx
// ❌ 병합 없이 24개 컴포넌트
<ButtonDefaultDefaultFalse />
<ButtonDefaultPrimaryFalse />
<ButtonDefaultDangerFalse />
// ... 21 more

// ✅ 병합 후 1개 컴포넌트
<Button
  size="default"
  variant="primary"
  icon={<Icon />}
/>
```

---

## 핵심 개념

### 1. InternalTree

병합 과정의 중간 표현 (Intermediate Representation). `InternalTree`는 `InternalNode`의 타입 별칭이다.

```typescript
type InternalTree = InternalNode;  // 루트 노드 = 트리

interface InternalNode extends UINodeBase {
  type: string;
  parent?: InternalNode | null;
  children: InternalNode[];
  mergedNodes?: VariantOrigin[];  // 병합된 원본 정보
  bounds?: { x: number; y: number; width: number; height: number };
  refId?: string;                 // 외부 컴포넌트 참조 ID (INSTANCE만)
}
```

**핵심**: `mergedNodes` 배열에 어떤 variant에서 왔는지 기록

```typescript
// Icon 노드 예시
{
  id: "icon-1",
  name: "Icon",
  type: "INSTANCE",
  mergedNodes: [
    { id: "...", variantName: "Size=default, Icon=true" },
    { id: "...", variantName: "Size=small, Icon=true" },
    { id: "...", variantName: "Size=large, Icon=true" },
    // ... 총 12개 (Icon=true인 variant들)
  ]
}
```

### 2. 정규화된 위치 (Normalized Position)

**문제**: Figma 캔버스에서 각 variant는 다른 절대 좌표를 가짐

```
Canvas:
┌─────────────────────────────────────────────┐
│ [Variant 1]  [Variant 2]  [Variant 3]      │
│  x=100        x=300        x=500            │
└─────────────────────────────────────────────┘
```

**해결**: Variant 루트 기준 상대 좌표로 정규화 (0~1 범위)

```typescript
normalizedX = (nodeX - variantRootX) / variantRootWidth
normalizedY = (nodeY - variantRootY) / variantRootHeight

// 예시
// Variant 1의 Icon: x=110, variantRoot x=100, width=100
// → normalizedX = (110 - 100) / 100 = 0.1

// Variant 2의 Icon: x=310, variantRoot x=300, width=100
// → normalizedX = (310 - 300) / 100 = 0.1

// 두 Icon의 normalizedX가 같음 → 같은 위치!
```

### 3. 1-Prop 차이 기반 병합 순서

**목표**: 비슷한 variant부터 병합하여 정확도 향상

```
Variant Graph:
  0 ──1── 1 ──1── 2
  │      │      │
  1      1      1
  │      │      │
  3 ──1── 4 ──1── 5

숫자 = prop 차이 개수
0: Size=default, Variant=default, Icon=false
1: Size=default, Variant=primary, Icon=false  (Variant만 다름)
2: Size=default, Variant=danger, Icon=false   (Variant만 다름)
...
```

**BFS 순회로 병합 순서 결정**:
1. 시작점(0)에서 출발
2. 인접 노드 중 prop 차이가 적은 순서로 방문
3. 방문 순서 = 병합 순서

---

## 병합 알고리즘

### 전체 파이프라인

```typescript
function mergeVariants(variants: SceneNode[]): InternalTree {
  // 1. 노드 ID → variant 루트 매핑 구축
  buildNodeToVariantRootMap(variants);

  // 2. Variant 그래프 구축 (1-prop 차이 기반)
  const graph = buildVariantGraph(variants);

  // 2. 그래프: variant 그래프 구축 및 순서 결정
  const { graph, mergeOrder } = buildGraphAndOrder(variants);

  // 3. 병합: 순서대로 트리 병합
  const merged = mergeTreesInOrder(graph, mergeOrder);

  // 3.5. Cross-depth squash (3-Way 독립 정규화 위치 비교)
  const squasher = new UpdateSquashByIou(dataManager, nodeToVariantRoot);
  squasher.execute(merged, variantTrees);

  // 4. 정렬: children x 좌표 기준 정렬
  sortChildrenByPosition(merged);

  // 5. 완료: 루트 이름 설정
  merged.name = componentSetName;

  return merged;
}
```

### 1단계: nodeToVariantRoot 매핑

**목적**: 각 노드가 어느 variant에 속하는지 추적

```typescript
// 병합 전
nodeToVariantRoot = {
  "variant1-id": "variant1-id",
  "label1-id": "variant1-id",      // Label은 variant1 소속
  "icon1-id": "variant1-id",       // Icon도 variant1 소속

  "variant2-id": "variant2-id",
  "label2-id": "variant2-id",      // Label은 variant2 소속
  "icon2-id": "variant2-id",       // Icon도 variant2 소속
}

// 병합 후에도 각 mergedNode의 원본 위치를 찾을 수 있음
```

### 2단계: Variant 그래프 구축 + 병합 순서 결정

#### 왜 그래프가 필요한가?

4개 variant를 병합할 때, 아무 순서로 합쳐도 최종 트리 구조는 같습니다.
하지만 **노드 매칭 정확도가 달라집니다.**

비슷한 variant(1-prop 차이)끼리 먼저 병합하면 노드 위치·구조 차이가 작아서 `isSameNode()`가 올바르게 매칭할 가능성이 높아집니다. 반대로 차이가 큰 variant를 먼저 합치면 매칭 실패 → 같은 역할의 노드가 별개 노드로 분리될 위험이 있습니다.

```
나쁜 순서: Size=Large/State=Default + Size=Small/State=Hover (2개 prop 동시 변경)
→ 크기·상태가 동시에 달라 노드 위치 차이가 커짐 → isSameNode 실패율 증가

좋은 순서: Size=Large/State=Default + Size=Small/State=Default (Size 1개만 변경)
→ 상태가 같으므로 구조적 차이가 최소화 → 노드 매칭 안정적
```

> **참고**: `propDiff`가 `mergeTwoTrees()`에 전달되지만 현재 구현에서는 실제로 참조되지 않습니다 (dead parameter). 스타일 소유권 분석은 병합 완료 후 `StyleProcessor`와 `DynamicStyleDecomposer`가 `mergedNodes` 전체를 보고 독립적으로 수행합니다.

**목표: 매번 prop 1개만 달라지는 순서를 찾는 것.**

#### 2-1. Props 추출

각 variant에서 props를 추출합니다.
- `variantProperties`가 있으면 그대로 사용
- 없으면 `variant.name`을 파싱 (예: `"Size=Large, State=Default"` → `{Size: "Large", State: "Default"}`)

```typescript
extractVariantProps(variant):
  // Figma API의 variantProperties 우선 사용
  if (variant.variantProperties) return variant.variantProperties;

  // fallback: name 문자열 파싱
  "Size=Large, State=Default"
    .split(",")     → ["Size=Large", " State=Default"]
    .map(trim)      → ["Size=Large", "State=Default"]
    .split("=")     → { Size: "Large", State: "Default" }
```

#### 2-2. 그래프 구축: "비슷한 것끼리 연결"

모든 variant 쌍(i, j)을 비교해서, **prop 값이 다른 게 1개 이하**인 쌍만 엣지로 연결합니다.

```typescript
for (i = 0; i < N; i++)
  for (j = i+1; j < N; j++)
    // 두 variant의 모든 prop key를 합집합으로 모음
    allKeys = union(keys(propsA), keys(propsB))
    // 값이 다른 key만 수집
    diffs = allKeys.filter(key => propsA[key] !== propsB[key])
    // diff가 1개 이하면 엣지 생성
    if (diffs.length <= 1)
      edges.push({ from: i, to: j, propDiff: diffs.length })
```

**구체적 예시** (4개 variant):

```
[0] Size=Large, State=Default
[1] Size=Small, State=Default
[2] Size=Large, State=Hover
[3] Size=Small, State=Hover

모든 쌍 비교:
(0,1) → diff: ["Size"]         → 1개 → 엣지 ✓
(0,2) → diff: ["State"]        → 1개 → 엣지 ✓
(0,3) → diff: ["Size","State"] → 2개 → 엣지 ✗  ← 대각선은 연결 안 됨
(1,2) → diff: ["Size","State"] → 2개 → 엣지 ✗
(1,3) → diff: ["State"]        → 1개 → 엣지 ✓
(2,3) → diff: ["Size"]         → 1개 → 엣지 ✓
```

결과 그래프:

```
 [0] Large/Default ──── [1] Small/Default
       │                       │
   (State만 다름)          (State만 다름)
       │                       │
 [2] Large/Hover   ──── [3] Small/Hover

* 대각선(0↔3, 1↔2)은 2개 prop이 다르므로 연결 안 됨
```

> **복잡도**: O(N²) — 모든 쌍을 비교하지만, variant 수는 보통 10개 미만이므로 문제없음

#### 2-3. 병합 순서 결정 (BFS)

그래프에서 **0번 노드부터 BFS**로 순회한 방문 순서 = 병합 순서입니다.

```
시작: queue=[0], visited={0}, order=[]

① current=0 → order에 추가 → order=[0]
   이웃: [1], [2] (미방문)
   queue=[1, 2], visited={0, 1, 2}

② current=1 → order에 추가 → order=[0, 1]
   이웃: [3] (미방문)
   queue=[2, 3], visited={0, 1, 2, 3}

③ current=2 → order에 추가 → order=[0, 1, 2]
   이웃: [3] → 이미 방문 → skip
   queue=[3]

④ current=3 → order에 추가 → order=[0, 1, 2, 3]

최종 병합 순서: [0, 1, 2, 3]
```

이 순서로 병합하면:
```
0 + 1: Size만 다름 ✓ → 구조 차이 최소 → 노드 매칭 안정적
(0+1) + 2: State만 다름 ✓ → 마찬가지
(0+1+2) + 3: State만 다름 ✓
```

**매번 1개 prop만 달라지므로 각 병합 단계에서 노드 매칭 오차가 최소화됩니다.**

#### 2-4. Disconnected 처리

만약 1-prop 경로로 도달할 수 없는 variant가 있으면 (그래프가 끊어진 경우),
BFS 후 미방문 노드를 순서 끝에 추가합니다.

```typescript
for (let i = 0; i < graph.nodes.length; i++) {
  if (!visited.has(i)) order.push(i);
}
```

이런 경우는 드물지만, 발생해도 모든 variant가 빠짐없이 병합됩니다.

### 4단계: 트리 병합

```typescript
function mergeTreesInOrder(graph, mergeOrder): InternalTree {
  let merged = graph.nodes[mergeOrder[0]].tree;
  let prevProps = graph.nodes[mergeOrder[0]].props;

  for (let i = 1; i < mergeOrder.length; i++) {
    const nextTree = graph.nodes[mergeOrder[i]].tree;
    const currentProps = graph.nodes[mergeOrder[i]].props;

    // prop 차이 계산
    const propDiff = calculatePropDiff(prevProps, currentProps);

    // 두 트리 병합
    merged = mergeTwoTrees(merged, nextTree, propDiff);

    prevProps = currentProps;
  }

  return merged;
}
```

### 5단계: Children 병합 (2-Pass + Hungarian)

두 트리의 같은 depth children을 매칭할 때, 2-Pass 전략으로 확정 매칭과 최적 매칭을 분리합니다.

#### Pass 1: 확정 매칭 (ID 일치)

같은 ID를 가진 노드는 무조건 같은 노드이므로 위치 비교 없이 즉시 매칭합니다.

```typescript
// Pass 1: ID가 같으면 확정 매칭
for (childB of childrenB)
  for (childA of merged)
    if (isDefiniteMatch(childA, childB))  // 같은 ID
      merge(childA, childB)
      break
```

#### Pass 2: Hungarian algorithm (최적 매칭)

Pass 1에서 매칭되지 않은 나머지 노드들은 **비용 행렬 + Hungarian algorithm**으로 전역 최적 매칭을 수행합니다.

```typescript
// Pass 2: 남은 노드의 모든 쌍에 대해 위치 비용 계산
costMatrix[i][j] = getPositionCost(freeA[j], freeB[i])
// 타입 비호환이면 Infinity, 위치 차이를 0~1 범위로 반환

// Hungarian algorithm으로 총 비용 최소인 매칭 산출
assignment = hungarian(costMatrix)

// 비용이 threshold(0.1) 이하인 쌍만 매칭 확정
for (row, col) in assignment:
  if costMatrix[row][col] <= 0.1:
    merge(freeA[col], freeB[row])
  else:
    // threshold 초과 → 매칭 거부, 새 노드로 추가
```

매칭되지 않은 B 노드는 배열 끝에 새 노드로 추가됩니다 (나중에 `visibleCondition` 부여).

#### 왜 greedy가 아닌 Hungarian인가

기존 greedy 방식은 B를 순서대로 순회하며 첫 번째 매칭을 채택했습니다. 이 방식은 **순회 순서에 따라 결과가 달라지는** 문제가 있습니다.

```
예: A=[icon1, icon2], B=[iconX, iconY]

Greedy: B[0]=iconX가 A[0]=icon1과 먼저 매칭 → 고정
        B[1]=iconY는 A[1]=icon2와 매칭

Hungarian: 4개 쌍의 위치 비용을 모두 계산
           총합이 최소인 조합 선택
           → iconX↔icon2, iconY↔icon1이 더 가까우면 그쪽으로 매칭
```

Hungarian은 O(n³)이지만, children 수가 보통 20개 이내이므로 성능 문제 없습니다.

---

## 노드 매칭 방식

노드 매칭의 상세 알고리즘(타입 호환성, padding-aware 정규화, height ratio fallback, INSTANCE/TEXT 폴백 전략 등)은 [노드 매칭 원리](node-matching.md)를 참조하세요.

---

## Cross-Depth Squash

### 문제: 병합 후 잔여 중복 노드

노드 매칭은 같은 depth의 children끼리 비교하므로, **다른 depth에 같은 역할의 노드**가 남을 수 있습니다.

```
Variant A:                  Variant B:
Button                      Button
├── Frame                   └── Label (TEXT)
│   └── Label (TEXT)
└── Icon

병합 결과 (cross-depth squash 전):
Button
├── Frame
│   └── Label (TEXT)  ← depth 2, Variant A에서 옴
├── Icon
└── Label (TEXT)      ← depth 1, Variant B에서 옴 (매칭 실패)
```

두 Label은 같은 역할인데 depth가 달라서 매칭되지 못했습니다. 이 상태로 코드를 생성하면 `<span>` 태그가 중복됩니다.

### 해결: 3-Way 위치 비교 + 독립 정규화 (UpdateSquashByIou)

병합이 완료된 후, 같은 타입이면서 **다른 depth**에 있는 노드 쌍의 위치를 비교하여 같은 위치의 노드를 합칩니다.

#### 알고리즘

```
반복 (squash 대상이 없을 때까지):
  1. groupNodesByType       — BFS로 타입별 노드 수집
  2. findSquashGroups       — 같은 이름(TEXT는 부모 구조) + 다른 depth + 3-Way 위치 매칭인 쌍 찾기
  3. isValidSquashGroup     — mask, INSTANCE 호환성, 조상-자손 관계 검증
  4. squashByTopoSort       — 3x 카운트 사전 판정 또는 2단계 sibling 검증으로 안전한 방향 결정
  5. performSquash          — mergedNodes + children 재귀 병합 + source 노드 제거
후처리:
  6. pruneEmptyContainers   — squash로 비워진 컨테이너 제거 + recordLayoutOverride
```

한 번에 하나의 squash group만 처리하고 트리를 재스캔한다. squash가 트리 구조를 변경하므로, 이전 그룹핑이 무효화될 수 있기 때문이다.

#### Squash 판정 조건 요약

| 조건 | 설명 |
|------|------|
| 같은 name + type | 같은 역할의 노드만 후보 |
| TEXT 이름 다를 때 부모 구조 동등성 | TEXT는 variant마다 내용(=이름)이 다를 수 있으므로, 이름 불일치 시 부모의 자식 타입 시퀀스로 구조적 동등성 확인 |
| 다른 depth | 같은 depth는 의도적 분리 (배열 등) |
| 3-Way 위치 매칭 (≤ 0.1) | 독립 정규화된 좌표로 위치 유사성 판정 |
| 조상-자손 관계 아님 | 부모-자식을 합치면 트리 파괴 |
| topo 검증 (sibling 순서) | 원본 variant의 형제 순서를 보존 |

#### TEXT 이름 불일치 허용 (hasSameParentStructure)

TEXT 노드는 variant마다 `characters`(=이름)가 달라질 수 있다 (예: "Approved" vs "Rejected"). 이름이 다르면 일반 노드는 squash 후보에서 제외되지만, TEXT는 **부모의 자식 타입 시퀀스**가 동일하면 같은 구조적 위치로 판단한다.

```typescript
hasSameParentStructure(nodeA, nodeB):
  부모A.children.map(c => c.type) === 부모B.children.map(c => c.type)
  // 예: [TEXT, FRAME] === [TEXT, FRAME] → true (같은 구조)
  // 예: [TEXT, FRAME] !== [TEXT, INSTANCE] → false (다른 구조)
```

#### 3-Way 위치 비교 + 독립 정규화

NodeMatcher와 동일한 3-Way 비교(좌·중·우, 상·중·하)를 사용하되, **정규화 방식이 다릅니다**.

**NodeMatcher** (같은 depth 노드 비교):
```
diff = |offsetA - offsetB| / avgSize
→ 절대 오프셋 차이를 평균 크기로 나눔
→ 같은 depth에서는 variant root 크기가 비슷하므로 문제없음
```

**Cross-depth squash** (다른 depth 노드 비교):
```
normalizedA = offsetA / contentSizeA    → 0~1 비율
normalizedB = offsetB / contentSizeB    → 0~1 비율
diff = |normalizedA - normalizedB|
→ 각자의 variant root content box 기준으로 독립 정규화
→ variant root 크기가 크게 달라도 비율로 비교하므로 스케일링 차이 상쇄
```

**왜 독립 정규화가 필요한가:**

cross-depth에서는 variant root 크기가 크게 다를 수 있습니다 (예: Small=23px, Large=32px). 같은 상대 위치에 있는 노드라도 절대 픽셀 오프셋이 다르고, 이를 평균 크기로 나누면 오차가 threshold를 넘을 수 있습니다.

```
예: Tagreview의 Label 노드
  Small (contentHeight=23px):  offsetY=3px  → 3/23 = 0.130 (13%)
  Large (contentHeight=32px):  offsetY=4px  → 4/32 = 0.125 (12.5%)

  NodeMatcher 방식: |3 - 4| / 27.5 = 0.1304 → ❌ (> 0.1)
  독립 정규화:      |0.130 - 0.125| = 0.005 → ✅ (≤ 0.1)
```

각자의 content box에서 차지하는 **비율**로 비교하면 크기 스케일링 차이가 자연스럽게 상쇄됩니다.

#### Cross-Depth 필터

**같은 depth의 노드는 squash 대상에서 제외합니다.** 같은 depth에 있는 동일 이름/타입의 노드는 variant merger가 의도적으로 분리한 것이기 때문입니다. 예를 들어 navigation의 Item 배열 노드들은 같은 depth에 있고, squash하면 배열 구조가 파괴됩니다.

```typescript
// 같은 depth → variant merger가 의도적으로 분리한 것 (e.g., 배열 아이템)
if (depthA === depthB) continue;

// 다른 depth → cross-depth 잔여 중복 → squash 후보
```

#### Topological Validation (2단계 sibling 검증)

squash가 트리의 sibling 순서를 깨뜨리지 않는지 2단계로 검증합니다.

```
원본 variant trees에서 sibling graph 구축:
  각 노드의 next sibling과 prev sibling을 기록

방향 검증 (A→B: A를 B에 합침, A 제거):
  1. merged tree를 deep clone
  2. clone에서 B를 찾아 A+B의 mergedNodes를 합침
  3. B부터 순회하며 모든 mergedNode의 sibling 순서 위반 검사
     → 원본에서의 next/prev sibling 타입과 현재 실제 sibling 타입 비교

**3x 카운트 사전 판정**: mergedNodes 수 비율이 3배 이상 차이나면, topo 검증을 건너뛰고 즉시 많은 쪽을 target으로 선택한다. 극단적 비대칭(예: 1개 vs 20개)에서는 방향이 자명하므로 검증 비용을 절약한다.

1단계 — next-only 검증:
  next sibling만으로 양방향(A→B, B→A) 검증
  - one-valid  → 바로 실행
  - both-invalid → mergedNodes 수 기반 fallback (많은 쪽이 target)

  both-valid → 2단계로 진행

2단계 — next+prev tiebreaker:
  prev sibling도 추가로 검사하여 방향을 결정
  - one-valid → 실행
  - 여전히 both-valid → mergedNodes 수 기반 fallback
  - 여전히 both-invalid → 스킵
```

prev를 1단계가 아닌 2단계에서만 검사하는 이유: cross-depth squash는 depth가 다른 노드를 합치므로 parent가 다르고, sibling도 구조적으로 다를 수밖에 없습니다. prev를 항상 검사하면 정당한 squash까지 차단됩니다 (예: Icon 유무에 따라 wrapper Frame이 추가되어 depth가 달라진 버튼 레이블). prev는 both-valid 상황에서 방향을 결정하는 tiebreaker로만 사용합니다.

**both-valid/both-invalid fallback**: 양방향 모두 유효하거나 둘 다 무효인 경우, `mergedNodes` 수가 많은 쪽을 target으로 선택합니다. 더 많은 variant에 존재하는 노드가 "주요 노드"이며, source(적은 쪽)의 정보를 target에 합치는 것이 안전합니다.

#### Squash 후 결과

```
Cross-depth squash 후:
Button
├── Frame
│   └── Label (TEXT, mergedNodes: [A의 Label, B의 Label])  ← 합쳐짐!
└── Icon

→ 코드 생성 시 <span>이 1개만 출력
```

#### Children 재귀 병합 (mergeChildrenInto)

`performSquash`에서 source 노드를 target에 합칠 때, source의 children도 함께 병합한다. type+name이 일치하는 자식은 mergedNodes를 합치고 재귀적으로 children도 병합한다. 일치하는 자식이 없으면 새 자식으로 추가한다.

```typescript
mergeChildrenInto(target, source):
  for (srcChild of source.children):
    match = target.children.find(tgt => tgt.type === srcChild.type && tgt.name === srcChild.name)
    if (match):
      match.mergedNodes += srcChild.mergedNodes  // 병합 정보 합치기
      mergeChildrenInto(match, srcChild)          // 재귀
    else:
      target.children.push(srcChild)              // 새 자식으로 추가
```

이를 통해 squash 대상 노드뿐만 아니라 그 하위 트리도 올바르게 통합된다.

### 구현 참고

- 구현: `src/.../processors/UpdateSquashByIou.ts`
- 호출 위치: `VariantMerger.mergeVariants()` Step 3→4 사이
- v1에서 포팅 후 확장:
  - IoU → 3-Way 위치 비교: 면적 겹침 대신 좌/중/우 3기준점 비교로 크기 차이에 강건
  - 독립 정규화: 각 노드를 자기 variant root content box 기준으로 0~1 비율 정규화
  - 2단계 prev tiebreaker: next-only에서 both-valid인 케이스를 prev 검사로 해소
  - both-valid/both-invalid fallback: mergedNodes 수 기반 방향 결정

#### 레이아웃 오버라이드 (recordLayoutOverride)

squash 후 빈 컨테이너가 prune될 때, 해당 wrapper의 레이아웃 속성을 부모 노드에 기록한다. 이 오버라이드는 StyleProcessor가 variant별 레이아웃을 교정하는 데 사용된다.

기록되는 CSS 속성 (6가지):

| Figma 속성 | CSS 속성 | 변환 |
|-----------|---------|------|
| `layoutMode` | `flex-direction` | HORIZONTAL → row, VERTICAL → column |
| `itemSpacing` (> 0) | `gap` | `${itemSpacing}px` |
| `paddingTop/Right/Bottom/Left` (> 0) | `padding` | `${pt}px ${pr}px ${pb}px ${pl}px` |
| `primaryAxisAlignItems` | `justify-content` | MIN→flex-start, CENTER→center, MAX→flex-end, SPACE_BETWEEN→space-between |
| `counterAxisAlignItems` | `align-items` | MIN→flex-start, CENTER→center, MAX→flex-end, STRETCH→stretch, BASELINE→baseline |
| `layoutWrap` | `flex-wrap` | WRAP → wrap |

이 오버라이드는 `metadata.layoutOverrides[variantName]`에 CSS property map으로 저장되며, StyleProcessor에서 CSS 노이즈 정규화 이후에 적용된다.

---

## 예제

### 예제 1: 간단한 버튼 (2개 variant)

#### 입력

**Variant 1**: Size=default, Icon=false
```
Button (id: v1)
└── Label (id: label1, x: 16, y: 8)
```

**Variant 2**: Size=small, Icon=false
```
Button (id: v2)
└── Label (id: label2, x: 12, y: 6)
```

#### 병합 과정

1. **nodeToVariantRoot 구축**
   ```
   { "v1": "v1", "label1": "v1" }
   { "v2": "v2", "label2": "v2" }
   ```

2. **정규화된 위치 계산**
   ```
   Label1:
     variantRoot = v1 (x: 0, y: 0, width: 100, height: 32)
     normalizedX = (16 - 0) / 100 = 0.16
     normalizedY = (8 - 0) / 32 = 0.25

   Label2:
     variantRoot = v2 (x: 0, y: 0, width: 80, height: 28)
     normalizedX = (12 - 0) / 80 = 0.15
     normalizedY = (6 - 0) / 28 = 0.21
   ```

3. **노드 매칭**
   ```
   isSameNode(Label1, Label2):
     - type 같음 ✓ (TEXT)
     - dx = |0.16 - 0.15| = 0.01 < 0.1 ✓
     - dy = |0.25 - 0.21| = 0.04 < 0.1 ✓
     → 같은 노드!
   ```

4. **병합 결과**
   ```
   Button
   └── Label (mergedNodes: [label1, label2])
   ```

### 예제 2: Icon 버튼 (4개 variant)

#### 입력

```
Variant 1: Size=default, Icon=false
  Button
  └── Label

Variant 2: Size=default, Icon=true
  Button
  ├── Icon
  └── Label

Variant 3: Size=small, Icon=false
  Button
  └── Label

Variant 4: Size=small, Icon=true
  Button
  ├── Icon
  └── Label
```

#### 병합 순서 (1-prop 차이 기반)

```
Graph:
  0 ──1── 1
  │      │
  1      1
  │      │
  2 ──1── 3

병합 순서: [0, 1, 2, 3]
  0 → 1: Icon만 다름 (1-prop)
  1 → 3: Size만 다름 (1-prop)
  0 → 2: Size만 다름 (1-prop)
```

#### 병합 과정

**Step 1**: 0 + 1 병합
```
Before:
  0: [Label]
  1: [Icon, Label]

After:
  merged: [Label, Icon]
```

**Step 2**: merged + 2 병합
```
Before:
  merged: [Label(1 merged), Icon(1 merged)]
  2: [Label]

After:
  merged: [Label(2 merged), Icon(1 merged)]
```

**Step 3**: merged + 3 병합
```
Before:
  merged: [Label(2 merged), Icon(1 merged)]
  3: [Icon, Label]

After:
  merged: [Label(3 merged), Icon(2 merged)]
```

**최종 정렬**: x 좌표 기준 정렬
```
Button
├── Icon (2 merged)      ← Icon=true인 variant만
└── Label (4 merged)     ← 모든 variant
```

### 예제 3: Label과 Secondary 병합

**특수 케이스**: 이름이 다른 TEXT 노드

```
Variant 1: Variant=default
  Button
  └── Label "Click me"

Variant 2: Variant=secondary
  Button
  └── Secondary "Click me"
```

#### 매칭 로직

```typescript
isSameNode(Label, Secondary):
  1. type 같음 ✓ (TEXT)
  2. id 다름 ✗
  3. 정규화된 위치 계산
     - Label: (0.16, 0.25)
     - Secondary: (0.17, 0.25)
     - dx = 0.01, dy = 0.00
     - dx <= 0.1 && dy <= 0.1 ✓
  → 같은 노드! (위치가 거의 같음)
```

**병합 결과**:
```
Button
└── Label (mergedNodes: [Label, Secondary])
```

이름은 다르지만, **같은 위치**에 있으므로 "같은 역할"로 판단!

---

## 정리

### 핵심 원칙

1. **위치 기반 매칭**: 절대 좌표가 아닌 정규화된 상대 위치로 비교
2. **점진적 병합**: 비슷한 variant부터 병합 (1-prop 차이 우선)
3. **재귀적 처리**: 부모가 매칭되면 children도 재귀적으로 병합
4. **오차 허용**: ±0.1 범위 내에서 같은 위치로 인정

### 병합 후 이점

```typescript
// 병합 전: 24개 variant
<ButtonDefaultDefaultFalse />
<ButtonDefaultDefaultTrue />
<ButtonDefaultPrimaryFalse />
// ... 21 more

// 병합 후: 1개 컴포넌트 + Props
<Button
  size={size}           // "default" | "small" | "large"
  variant={variant}     // "default" | "primary" | "danger" | "secondary"
  icon={icon}           // ReactNode | undefined
>
  {children}
</Button>
```

### 다음 단계

InternalTree 병합이 완료되면:
- **Step 2**: Props 추출/바인딩 (mergedNodes 정보 활용)
- **Step 3**: 스타일 처리 (variant별 스타일 분기)
- **Step 4**: 가시성 조건 (Icon prop에 따라 Icon 노드 표시/숨김)
- **Step 5**: 외부 참조 해결 (INSTANCE → 실제 컴포넌트 매핑)

---

## 참고

- 병합 구현: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger.ts`
- Cross-depth squash: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/UpdateSquashByIou.ts`
- 노드 매칭: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher.ts`
- 테스트: `test/tree-builder/inspect-merge.test.ts`
