# ISSUE-003: flex-basis: 0과 padding 충돌

## 상태
**RESOLVED**

## 문제 설명

Figma의 `getCSSAsync()`가 `flex: 1 0 0` (flex-basis: 0)을 반환하면, padding이 있는 형제 요소들의 크기가 불균등해지는 문제.

```
Figma 원본:
┌─────────────────────────────────────────┐
│ Cell1 (480px)      │ Cell2 (480px)      │
│ padding-left: 479px│ padding: 0         │
└─────────────────────────────────────────┘

잘못된 렌더링 (flex: 1 0 0):
┌─────────────────────────────────────────┐
│ Cell1 (719px)           │ Cell2 (241px) │
└─────────────────────────────────────────┘
```

## 원인

- CSS flex에서 `flex-basis: 0`이면 모든 공간이 균등 분배됨
- 하지만 padding은 content box에 추가되어 최종 크기에 영향
- 결과적으로 padding 차이만큼 크기가 불균등해짐

## 해결

`_TempAstTree.updateFlexWithPadding()`에서 `flex-basis: 0`을 실제 Figma 크기로 수정:

```typescript
// Before: flex: 1 0 0
// After:  flex: 1 0 480px

const match = flexValue.match(/^(\d+)\s+(\d+)\s+0$/);
if (match) {
  const [, flexGrow, flexShrink] = match;
  const width = nodeSpec?.absoluteBoundingBox?.width;
  base["flex"] = `${flexGrow} ${flexShrink} ${width}px`;
}
```

## 테스트

`test/compiler/flexPaddingFix.test.ts`
