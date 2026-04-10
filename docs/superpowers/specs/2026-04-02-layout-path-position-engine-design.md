# Layout Normalizer Engine — 설계 문서

## Context

VariantMerger에서 variant간 노드 매칭 시, 현재 **variant root 기준 절대 좌표 정규화**를 사용한다. 중간 컨테이너의 레이아웃 속성(padding, alignment 등)을 무시하고 root에서의 절대 거리만 보기 때문에, 중첩 컨테이너 안의 노드에서 부정확하다.

**문제 예시 (Chips):**
- Small: root(53x16) → Frame(37x16) → icon(12x12) → root 기준 Y ratio = 0.125
- Large: root(67x24) → Frame(47x24) → icon(14x14) → root 기준 Y ratio = 0.208
- 차이 0.083 → cost 0.15 > threshold 0.1 → 매칭 실패
- 실제로는 둘 다 Frame 안에서 center-aligned (ratio 0.5 = 0.5)

## 목표

`f(reference, target)` → reference의 content box 기준으로 target의 정규화된 위치 정보를 반환하는 **단일 함수**.

호출자가 기준점(reference)을 자유롭게 선택:
- VariantMerger: `f(matchedParentA, childA)` vs `f(matchedParentB, childB)` → 직접 부모 기준
- squash: `f(variantRootA, nodeA)` vs `f(variantRootB, nodeB)` → root 기준

## 핵심 설계

### normalize(reference, target) → NormalizedPosition

```typescript
interface NormalizedPosition {
  relCenterX: number;  // reference content box 대비 center X (0~1)
  relCenterY: number;  // reference content box 대비 center Y (0~1)
  relWidth: number;    // reference content box 대비 너비 비율
  relHeight: number;   // reference content box 대비 높이 비율
}
```

4개 값에서 파생 가능한 정보:
- 3-way left/center/right: `left = relCenterX - relWidth/2`
- overflow 여부: `relWidth > 1 || relHeight > 1`
- size 유사도: `relWidth`, `relHeight` 비율 비교

### compare(a, b) → number

두 NormalizedPosition을 비교하여 0~1 범위의 cost 반환.

```
X축 3-way (독립 정규화):
  leftA   = a.relCenterX - a.relWidth/2
  leftB   = b.relCenterX - b.relWidth/2
  centerDiff = |a.relCenterX - b.relCenterX|
  rightA  = 1 - a.relCenterX - a.relWidth/2
  rightB  = 1 - b.relCenterX - b.relWidth/2
  minDiffX = min(|leftA-leftB|, centerDiff, |rightA-rightB|)

Y축도 동일.
cost = max(minDiffX, minDiffY)
```

### content box 계산

reference 노드의 content box:
```
contentX = reference.absoluteBoundingBox.x + paddingLeft
contentY = reference.absoluteBoundingBox.y + paddingTop
contentWidth = reference.width - paddingLeft - paddingRight
contentHeight = reference.height - paddingTop - paddingBottom

strokesIncludedInLayout이 true면:
  contentWidth -= strokeWeight * 2
  contentHeight -= strokeWeight * 2
```

target의 상대 위치:
```
relCenterX = (target.centerX - contentX) / contentWidth
relCenterY = (target.centerY - contentY) / contentHeight
relWidth = target.width / contentWidth
relHeight = target.height / contentHeight
```

## 구현 구조

```typescript
class LayoutNormalizer {
  constructor(private dataManager: DataManager) {}

  /** reference의 content box 기준으로 target의 상대 위치 반환 */
  normalize(reference: SceneNode, target: SceneNode): NormalizedPosition { ... }

  /** 두 정규화된 위치의 유사도 비교 (0~1, 낮을수록 유사) */
  compare(a: NormalizedPosition, b: NormalizedPosition): number { ... }

  /** content box 계산 (padding, stroke 고려) */
  private calcContentBox(node: SceneNode): ContentBox { ... }

  // 캐싱: 같은 reference에 대한 content box 재계산 방지
  private contentBoxCache: Map<string, ContentBox>;
}
```

```
processors/
├── LayoutNormalizer.ts           ← 새 클래스
├── NodeMatcher.ts                ← LayoutNormalizer 인스턴스 주입받아 사용
│   ├── getPositionCost()
│   └── isSamePosition()
└── UpdateSquashByIou.ts          ← 같은 LayoutNormalizer 인스턴스 공유
    └── isSamePosition3Way()
```

인스턴스 공유:
```typescript
// TreeBuilder에서 생성
const normalizer = new LayoutNormalizer(dataManager);
const nodeMatcher = new NodeMatcher(dataManager, nodeToVariantRoot, normalizer);
const squash = new UpdateSquashByIou(dataManager, nodeToVariantRoot, normalizer);
```

## 호출 패턴

### VariantMerger (같은 depth)
```typescript
// 매칭된 부모의 자식끼리 비교 → 각자의 부모 기준
const infoA = normalize(originalParentA, originalChildA);
const infoB = normalize(originalParentB, originalChildB);
const cost = compare(infoA, infoB);
```

### UpdateSquashByIou (cross-depth)
```typescript
// 다른 depth의 노드 비교 → 각자의 variant root 기준
const infoA = normalize(variantRootA, nodeA);
const infoB = normalize(variantRootB, nodeB);
const cost = compare(infoA, infoB);
```

## 사용 가능한 Figma 데이터

### content box 계산에 필요한 속성

| 속성 | 용도 |
|------|------|
| `absoluteBoundingBox` | 모든 노드의 절대 좌표 |
| `paddingLeft/Right/Top/Bottom` | content box 계산 |
| `strokeWeight` | strokesIncludedInLayout 시 보정 |
| `strokesIncludedInLayout` | stroke가 레이아웃에 포함되는지 |

### 비교 시 참고 가능한 속성 (compare에서 필요 시)

| 속성 | 용도 |
|------|------|
| `layoutMode` | AL 방향 (호출자가 reference 선택 시 참고) |
| `counterAxisAlignItems` | 교차축 정렬 (추가 검증용) |
| `layoutAlign` | 자식의 정렬 override |
| `layoutPositioning` | ABSOLUTE면 flow 밖 |

## 기존 로직 대체 범위

| 기존 | 새 방식 |
|------|---------|
| `NodeMatcher.calcPositionCost()` | `compare(normalize(parentA, a), normalize(parentB, b))` |
| `NodeMatcher.isSamePosition()` | `compare() ≤ 0.1` |
| `NodeMatcher.calcPositionCostByParent()` | 제거 (normalize에 통합) |
| `NodeMatcher.computeAutoLayoutShift()` | 제거 (부모 기준 정규화로 불필요) |
| `NodeMatcher.getContentBoxInfo()` | normalize 내부로 이동 |
| `UpdateSquashByIou.isSamePosition3Way()` | `compare(normalize(rootA, a), normalize(rootB, b)) ≤ 0.1` |

## 경계 조건

1. **reference에 padding 정보 없음**: padding 0으로 간주 (bounds = content box)
2. **content box 크기 0 이하**: Infinity 반환
3. **overflow 노드**: relWidth > 1 또는 relHeight > 1 → 별도 체크 유지 (compare와 독립)
4. **layoutPositioning=ABSOLUTE**: flow 밖 노드이지만, 절대 좌표는 있으므로 normalize 동작함
5. **경로를 못 찾는 경우**: mergedNodes가 없거나 DataManager에서 못 찾으면 → Infinity 반환

## Chips 적용 예시

```
VariantMerger: Frame의 자식들 매칭

Small Frame(37x16, padding=0):
  icon(12x12) @ (0, 2)
  → normalize(SmallFrame, icon) = { relCenterX: 0.16, relCenterY: 0.5, ... }

Large Frame(47x24, padding=0):
  icon(14x14) @ (0, 5)
  → normalize(LargeFrame, icon) = { relCenterX: 0.15, relCenterY: 0.5, ... }

compare → centerY diff = |0.5 - 0.5| = 0 → cost ≈ 0 ✓
```

## 검증

- `npx vitest run` — 기존 997+ 테스트 전체 통과
- Chips: icon-checking/icon_checking 합침 확인
- Checkbox: Box/Interaction 구분 유지 (overflow 체크)
- Profile, Breakpoint, Tagreview 등 기존 fixture 영향 없음
