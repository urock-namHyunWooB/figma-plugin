# ISSUE-011: 의존 컴포넌트 children이 비어있을 때 I... 노드 삭제 문제

## 상태
**RESOLVED**

## 문제 설명

`Gnb.json`의 의존 컴포넌트들(`Colorgnbhomen` 등)이 아이콘을 렌더링하지 않고 비어있음.

```jsx
// 예상
function Colorgnbhomen(props) {
  return (
    <div>
      <div css={RatioVerticalCss}>...</div>
      <div css={ColorBlankCss}>
        <svg>...</svg> {/* 아이콘 */}
      </div>
    </div>
  );
}

// 실제 (문제)
function Colorgnbhomen(props) {
  return (
    <div>
      {children} {/* 비어있음 */}
    </div>
  );
}
```

## 원인

1. dependencies의 `info.document.children`이 비어있는 경우, `enrichVariantWithInstanceChildren`로 INSTANCE children을 채움
2. 채워진 children의 ID가 `I...` 형태 (3+ segments: `I18:471;11099:10330;9954:6518`)
3. `updateCleanupNodes`가 모든 `I...` 노드를 삭제함

```typescript
// 문제 코드
if (isInstanceChild && !isRootInstance) {
  nodesToRemove.push(node); // 무조건 삭제
}
```

## 해결

원래 children이 비어있었고 enrichment로 채워진 경우에만 I... 노드를 유지:

**1단계: 플래그 설정 (`DependencyManager.ts`)**

```typescript
} else {
  const originalChildrenEmpty =
    !enrichedVariant.info.document.children ||
    enrichedVariant.info.document.children.length === 0;

  enrichedVariant = this.instanceOverrideManager.enrichVariantWithInstanceChildren(
    enrichedVariant,
    instanceNode
  );

  // 원래 children이 비어있었고, enrichment로 채워진 경우 플래그 설정
  if (originalChildrenEmpty) {
    (enrichedVariant as any)._enrichedFromEmptyChildren = true;
  }
}
```

**2단계: 플래그 확인 (`_FinalAstTree.updateCleanupNodes`)**

```typescript
const specData = this.specDataManager.getSpec();
const enrichedFromEmptyChildren =
  (specData as any)._enrichedFromEmptyChildren === true;

// I... 노드 삭제 조건 수정
if (isInstanceChild && !isRootInstance && !enrichedFromEmptyChildren) {
  nodesToRemove.push(node);
}
```

## 결과

| 케이스          | 원래 children | 결과              |
| --------------- | ------------- | ----------------- |
| `error-02.json` | 2개 (있음)    | I... 노드 삭제 ✅ |
| `Gnb.json`      | 0개 (없음)    | I... 노드 유지 ✅ |

## 테스트

`test/compiler/dependencyEmptyChildren.test.ts`
