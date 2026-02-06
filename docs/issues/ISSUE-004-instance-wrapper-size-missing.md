# ISSUE-004: INSTANCE wrapper 크기 누락

## 상태
**RESOLVED**

## 문제 설명

외부 컴포넌트(INSTANCE)의 wrapper div에 `width/height`가 누락되어, 자식 컴포넌트의 `width: 100%; height: 100%`가 제대로 동작하지 않음.

```jsx
// 문제: wrapper에 크기 없음
<div style={{ position: "absolute", left: "220px", top: "100px" }}>
  <Ghost /> // Ghost CSS: width: 100%, height: 100% → 크기 0
</div>
```

## 원인

- Figma `getCSSAsync()`가 INSTANCE에 width/height를 반환하지 않음
- wrapper div에 크기가 없어서 자식의 100% 스타일이 동작 안 함

## 해결

1. `_FinalAstTree.updateMetaData()`에서 INSTANCE에 `spec` 저장:

```typescript
case "INSTANCE": {
  const instanceSpec = this.specDataManager.getSpecById(node.id);
  if (instanceSpec) {
    node.metaData.spec = instanceSpec;  // absoluteBoundingBox 포함
  }
}
```

2. `CreateJsxTree._createExternalComponentJsx()`에서 wrapper에 크기 적용:

```typescript
const boundingBox = node.metaData?.spec?.absoluteBoundingBox;
if (boundingBox) {
  layoutStyles["width"] = `${boundingBox.width}px`;
  layoutStyles["height"] = `${boundingBox.height}px`;
}
```

## 테스트

`test/compiler/flexPaddingFix.test.ts`
