# ISSUE-019: COMPONENT_SET variant별 노드 위치 오프셋 문제

## 상태
**RESOLVED**

## 문제 설명

COMPONENT_SET에서 일부 variant에만 존재하는 노드가 잘못된 `top` 값을 가짐. 예를 들어 X3 variant의 `Group21233`이 `top: 144px`로 렌더링됨 (올바른 값은 `top: 0px`).

```
Figma 캔버스:
┌─────────────────────────────────────────┐
│ [X1 variant] (y: 0)                     │
│ [X2 variant] (y: 72)                    │
│ [X3 variant] (y: 144)  ← Group21233 포함 │
└─────────────────────────────────────────┘

잘못된 렌더링:
Group21233 { top: 144px }  ← 캔버스 절대 좌표 사용

올바른 렌더링:
Group21233 { top: 0px }    ← variant 내 상대 좌표
```

## 원인

- `updatePositionStyles()`에서 부모의 `absoluteBoundingBox`를 기준으로 자식 위치 계산
- COMPONENT_SET의 경우, 각 variant가 캔버스에서 다른 y 좌표에 배치됨
- variant-specific 노드(모든 variant에 존재하지 않는 노드)는 해당 variant의 오프셋이 반영되어 잘못된 위치 계산

## 해결

`_TempAstTree.updatePositionStyles()`에서 COMPONENT_SET 루트 처리:

```typescript
// COMPONENT_SET의 루트 자식 노드는 variant별로 다른 위치에 있으므로
// variant-specific 노드(모든 variant에 존재하지 않는 노드)는 0,0 기준
if (parentNode === tempAstTree) {
  const actualRootType = this._specDataManager.getRootNodeType();
  if (actualRootType === "COMPONENT_SET") {
    const allVariants = this._specDataManager.getRenderTree().children;
    const totalVariantCount = allVariants?.length || 0;

    // mergedNode 길이가 전체 variant 수보다 작으면 variant-specific 노드
    if (node.mergedNode && node.mergedNode.length < totalVariantCount) {
      left = 0;
      top = 0;
    }
  }
}
```

## 테스트

`test/compiler/componentSetVariantPosition.test.ts`
