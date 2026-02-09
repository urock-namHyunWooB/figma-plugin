# ISSUE-033: Primary 버튼 렌더링 종합 수정

## 상태
**RESOLVED**

## 문제 설명

Primary 버튼 컴포넌트(test/fixtures/failing/Primary.json)가 여러 문제로 인해 올바르게 렌더링되지 않음.

### 증상 목록

1. **State 스타일이 CSS pseudo-class로 생성되지 않음**
   - Hover, Pressed, Disabled 상태의 배경색이 `:hover`, `:active`, `:disabled`로 분류되지 않음
   - `state` prop이 함수 인자로 전달되어 JavaScript로 처리됨

2. **flex-direction이 column으로 잘못 적용**
   - 버튼 내 요소들이 세로로 배치됨
   - Figma에서는 HORIZONTAL 레이아웃인데 CSS에서 column으로 변환

3. **SVG가 slot과 함께 렌더링**
   - leftIcon/rightIcon slot의 원본 SVG 자손이 함께 출력됨
   - 아이콘이 중복으로 표시됨

4. **요소 순서가 잘못됨**
   - variant merge 후 children 순서가 Figma 원본과 다름
   - x좌표 기준 정렬이 안 됨

5. **MinWidth LINE이 공간을 차지**
   - height: 0인 LINE 노드가 CSS에서 width: 90px로 공간 차지
   - 텍스트가 오른쪽으로 밀림

---

## 수정 1: State pseudo-class 생성

### 원인
`StyleProcessor.classifyStyles`에서 다른 prop(Size, LeftIcon)이 있으면 `condition ≠ null`이라서 pseudo로 분류되지 않음.

### 해결
State-specific 스타일 판별 로직 추가. 같은 State 내에서 모든 Size/Icon 조합이 동일한 값을 가지면 pseudo로 분류.

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/StyleProcessor.ts`

```typescript
// State별로 variant 그룹화
private groupByState(variantStyles: VariantStyle[]): Map<string, VariantStyle[]>

// State-specific 여부 판별
private isStateSpecific(key: string, stateGroups: Map<string, VariantStyle[]>): boolean

// classifyStyles에서 State-specific 스타일을 pseudo로 분류
if (stateGroups.size > 1) {
  for (const key of dynamicKeys) {
    if (this.isStateSpecific(key, stateGroups)) {
      // State에 따라 다름 → pseudo 또는 base
      for (const [state, variants] of stateGroups) {
        const pseudoClass = stateToPseudo(state);
        if (pseudoClass) {
          pseudo[pseudoClass]![key] = value;  // :hover, :active, :disabled
        } else {
          base[key] = value;  // Default → base
        }
      }
    }
  }
}
```

**수정 파일**: `src/frontend/ui/domain/code-generator/core/code-emitter/style-strategy/EmotionStyleStrategy.ts`

```typescript
// pseudo 스타일이 있으면 state prop을 dynamicProps에서 제외
const hasPseudoStyles = node.styles?.pseudo && Object.keys(node.styles.pseudo).length > 0;
if (hasPseudoStyles) {
  pseudoHandledProps.add("state");
}
```

### 결과
```css
/* Before */
const PrimaryCssStateStyles = {
  Default: css({ background: "#F64C4C" }),
  Hover: css({ background: "#EC2D30" }),
  // ...
};

/* After */
const PrimaryCss = css`
  background: var(--Danger-600, #f64c4c);
  &:hover { background: var(--Danger-500, #eb6f70); }
  &:active { background: var(--Danger-700, #ec2d30); }
  &:disabled { background: var(--Danger-300, #ffccd2); }
`;
```

---

## 수정 2: flex-direction 상속

### 원인
variant merge 시 일부 variant에만 존재하던 HORIZONTAL FRAME이 flatten되면서 layoutMode 정보 손실.

### 해결
flatten된 FRAME의 layoutMode를 부모 노드에 상속.

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/interfaces/core.ts`

```typescript
export interface InternalNode {
  // ...
  /** flatten된 FRAME의 layoutMode를 상속 */
  inheritedLayoutMode?: "HORIZONTAL" | "VERTICAL";
}
```

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/VariantProcessor.ts`

```typescript
// flattenFrame에서 HORIZONTAL layoutMode 상속
if (frame.mergedNode.length > 0) {
  const frameNodeSpec = data.getNodeById(frame.mergedNode[0].id);
  if (frameNodeSpec?.layoutMode === "HORIZONTAL") {
    parent.inheritedLayoutMode = "HORIZONTAL";
  }
}
```

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/StyleProcessor.ts`

```typescript
// inheritedLayoutMode가 HORIZONTAL이면 flex-direction: row 적용
if (node.inheritedLayoutMode === "HORIZONTAL") {
  styles.base["flex-direction"] = "row";
}
```

---

## 수정 3: Slot 자손 필터링

### 원인
slot으로 변환된 INSTANCE의 원본 Figma 자손(SVG 등)이 별도 노드로 렌더링됨.

### 해결
SlotDefinition에 원본 자손 ID 추적, ComponentGenerator에서 slot 자손 필터링.

**수정 파일**: `src/frontend/ui/domain/code-generator/types/architecture.ts`

```typescript
export interface SlotDefinition {
  name: string;
  targetNodeId: string;
  defaultContent?: DesignNode;
  /** slot 노드의 원래 자손 ID들 */
  descendantIds?: string[];
}
```

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/SlotProcessor.ts`

```typescript
static collectOriginalDescendantIds(
  mergedNodes: Array<{ id: string }>,
  data: PreparedDesignData
): string[]
```

**수정 파일**: `src/frontend/ui/domain/code-generator/core/code-emitter/generators/ComponentGenerator.ts`

```typescript
// slot 자손 필터링
const slotDescendantIds = this.collectSlotDescendantIds(node, tree);
for (const child of node.children) {
  if (slotDescendantIds.has(child.id)) {
    continue; // Skip slot descendants
  }
}
```

---

## 수정 4: x좌표 기준 정렬

### 원인
variant merge 후 children 순서가 merge 순서를 따라 Figma 원본과 다름.

### 해결
variant merge 후 children을 x좌표 평균값 기준으로 정렬.

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/VariantProcessor.ts`

```typescript
private sortChildrenByPosition(node: InternalNode, data: PreparedDesignData): void {
  node.children.sort((a, b) => {
    const aX = this.getAverageX(a, data);
    const bX = this.getAverageX(b, data);
    return aX - bX;
  });
  for (const child of node.children) {
    this.sortChildrenByPosition(child, data);
  }
}

private getAverageX(node: InternalNode, data: PreparedDesignData): number {
  // mergedNode들의 x좌표 평균값 반환
}
```

---

## 수정 5: LINE height: 0 처리

### 원인
Figma의 `getCSSAsync()` API가 height: 0인 LINE 노드에 대해 height: 1px 반환.
LINE 노드가 width를 가져 flex 레이아웃에서 공간 차지.

### 해결
원본 Figma 데이터의 absoluteBoundingBox.height가 0이면 `display: none` 적용.

**수정 파일**: `src/frontend/ui/domain/code-generator/core/tree-builder/workers/StyleProcessor.ts`

```typescript
// LINE 노드의 height: 0 처리
if (node.type === "LINE" && node.mergedNode.length > 0) {
  const originalNode = ctx.data.getNodeById(node.mergedNode[0].id);
  if (originalNode?.absoluteBoundingBox?.height === 0) {
    styles.base.display = "none";
  }
}
```

---

## 최종 결과

| 문제 | 수정 전 | 수정 후 |
|------|--------|--------|
| State 스타일 | JS prop 기반 | CSS pseudo-class |
| flex-direction | column | row |
| SVG/Slot | 중복 렌더링 | slot만 렌더링 |
| 요소 순서 | 무작위 | x좌표 순 |
| LINE height: 0 | 공간 차지 | display: none |

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `StyleProcessor.ts` | State-specific 분류, inheritedLayoutMode, LINE height: 0 |
| `EmotionStyleStrategy.ts` | state prop 제외 |
| `VariantProcessor.ts` | layoutMode 상속, x좌표 정렬 |
| `SlotProcessor.ts` | 자손 ID 수집 |
| `ComponentGenerator.ts` | slot 자손 필터링 |
| `core.ts` | inheritedLayoutMode 필드 |
| `architecture.ts` | descendantIds 필드 |

## 테스트

`test/compiler/primaryStatePseudo.test.ts`

```typescript
describe("Primary Button State Pseudo-class 테스트", () => {
  test("State별 배경색이 CSS pseudo-class로 생성되어야 함");
  test("background가 State-specific으로 분류되어 pseudo-class에 포함되어야 함");
  test("state prop이 함수 인자로 전달되지 않아야 함");
});
```

## 관련 이슈

- ISSUE-003: flex-basis와 padding 충돌
- ISSUE-008: 회전된 요소 레이아웃
- ISSUE-032: INSTANCE wrapper 크기 미적용
