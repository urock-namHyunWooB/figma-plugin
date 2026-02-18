# Variant 노드 매칭 원리

TreeBuilder에서 여러 Variant의 노드를 동일 노드로 판별하는 두 가지 핵심 알고리즘을 설명합니다.

---

## 1. 정규화 좌표 매칭 (Normalized Coordinate Matching)

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

### 해결: 정규화(Normalization)

정규화 공식:

```typescript
normalizedX = (node.x - root.x) / root.width
normalizedY = (node.y - root.y) / root.height
```

이 공식을 적용하면:

| Variant | Icon 절대 x | Root x | Root width | 정규화된 x |
|---------|-------------|--------|------------|------------|
| A       | 150         | 100    | 400        | (150-100)/400 = **0.125** |
| B       | 650         | 600    | 400        | (650-600)/400 = **0.125** |

**좌표 차이 = 0.125 - 0.125 = 0**

### 원리: 2단계 변환

#### 1단계: 평행 이동 (Translation)
```
node.x - root.x
```
- 각 노드 좌표에서 자신이 속한 variant root 좌표를 뺌
- 캔버스 상 어디에 variant가 있든, "root 기준 상대 위치"만 남음

#### 2단계: 스케일 정규화 (Scale Normalization)
```
/ root.width
```
- root 크기로 나누어 0~1 범위로 정규화
- variant 크기가 다르더라도 비율 기반 비교 가능

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
const xDiff = Math.abs(normalizedX1 - normalizedX2);
const yDiff = Math.abs(normalizedY1 - normalizedY2);

if (xDiff <= 0.1 && yDiff <= 0.1) {
  return true; // 같은 노드
}
```

---

## 2. IoU 매칭 (Intersection over Union)

### 개념

IoU는 두 영역의 **겹침 정도**를 0~1 사이 값으로 나타내는 지표입니다.

```
IoU = 교집합 영역 / 합집합 영역
```

### 시각적 이해

```
Box A          Box B          교집합         합집합
┌─────┐        ┌─────┐
│     │        │     │        ┌──┐          ┌────────┐
│     │   +    │     │   →    │██│    /     │████████│
│     │        │     │        └──┘          │████████│
└─────┘        └─────┘                      └────────┘

IoU = 교집합 넓이 / 합집합 넓이
```

### 계산 공식

```typescript
function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  // 교집합 영역 계산
  const xOverlap = Math.max(0,
    Math.min(boxA.x + boxA.width, boxB.x + boxB.width) -
    Math.max(boxA.x, boxB.x)
  );
  const yOverlap = Math.max(0,
    Math.min(boxA.y + boxA.height, boxB.y + boxB.height) -
    Math.max(boxA.y, boxB.y)
  );
  const intersection = xOverlap * yOverlap;

  // 합집합 영역 계산
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const union = areaA + areaB - intersection;

  return intersection / union;
}
```

### IoU 값의 의미

| IoU 값 | 의미 |
|--------|------|
| 1.0 | 완전히 동일한 위치와 크기 |
| 0.8+ | 거의 같은 위치 (매칭 성공) |
| 0.5 | 절반 정도 겹침 |
| 0.0 | 전혀 겹치지 않음 |

### 예시: 동일 노드 판별

```
Variant A의 Button:           Variant B의 Button:
┌──────────────┐              ┌──────────────┐
│   x: 0.1     │              │   x: 0.1     │
│   y: 0.2     │              │   y: 0.2     │
│   w: 0.3     │              │   w: 0.3     │
│   h: 0.1     │              │   h: 0.1     │
└──────────────┘              └──────────────┘

→ 정규화된 좌표가 동일 → IoU = 1.0 → 같은 노드!
```

### 예시: 살짝 다른 위치

```
Variant A의 Label:            Variant B의 Label:
┌──────────────┐                ┌──────────────┐
│   x: 0.15    │                │   x: 0.18    │  (아이콘 유무로 밀림)
│   y: 0.2     │                │   y: 0.2     │
│   w: 0.2     │                │   w: 0.2     │
│   h: 0.05    │                │   h: 0.05    │
└──────────────┘                └──────────────┘

→ x 차이 0.03 존재 → IoU ≈ 0.85 → 같은 노드로 판정
→ x 차이가 더 크면 IoU < 0.8 → 다른 노드로 판정
```

---

## 3. 매칭 전략 조합

TreeBuilder는 두 알고리즘을 조합하여 사용합니다:

```
┌─────────────────────────────────────────────────────────┐
│                    노드 매칭 프로세스                      │
├─────────────────────────────────────────────────────────┤
│  1. 타입 비교: node.type === candidate.type             │
│     └─ 실패 → 매칭 안됨                                  │
│                                                         │
│  2. 정규화 좌표 계산                                      │
│     └─ 각 노드를 자신의 variant root 기준으로 0~1 정규화   │
│                                                         │
│  3. IoU 계산 (정규화된 좌표 기반)                         │
│     └─ IoU ≥ 0.8 → 같은 노드                            │
│     └─ IoU < 0.8 → 폴백 시도                            │
│                                                         │
│  4. 폴백 (TEXT 노드 전용)                                │
│     └─ 이름이 동일하면 같은 노드로 판정                    │
│                                                         │
│  5. 최종 실패                                           │
│     └─ 부모 노드의 새 자식으로 추가 (별개 노드 처리)        │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 한계 및 주의사항

### 레이아웃 변화 시 매칭 실패

```
hasIcon=true:   [Icon x=0.05] [Label x=0.15]
hasIcon=false:                [Label x=0.05]
                                    ↑
                              차이 = 0.10
```

- 정규화된 x 좌표 차이가 0.1로 경계선
- 조금 더 밀리면 IoU < 0.8이 되어 **다른 노드로 오판**

### 폴백 전략의 한계

| 노드 타입 | 폴백 가능 여부 | 설명 |
|-----------|---------------|------|
| TEXT | ✅ 이름 기반 폴백 | 위치가 달라도 이름이 같으면 매칭 |
| FRAME | ❌ 폴백 없음 | 위치만으로 판단 |
| INSTANCE | ❌ 폴백 없음 | 위치만으로 판단 |

### 결과

매칭 실패 시 해당 노드는 **variant-specific 노드**가 되어 최종 코드에 중복 출력될 수 있습니다.
