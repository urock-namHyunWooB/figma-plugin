# ISSUE-006: SVG 아이콘 색상이 State별로 다름

## 상태
**RESOLVED**

## 문제 설명

Figma에서 `State=Disabled`일 때 아이콘 색이 연한 회색(#CACACA), `State=Default`일 때 진한 회색(#4B4B4B)인데, 컴파일된 코드에서는 항상 같은 색으로 렌더링됨.

```tsx
// 문제: 모든 State에서 아이콘 색이 같음
<path fill="#CACACA" ... />
```

## 원인

- 각 variant의 SVG에 하드코딩된 fill 색상 사용
- State에 따라 동적으로 변경되지 않음

## 해결

1. SVG `fill` 속성을 `currentColor`로 변환 (`SvgToJsx._createJsxAttributes()`):

```typescript
if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = "currentColor";
}
```

2. 부모 요소에 CSS `color` 속성 추가 (`_FinalAstTree.updateSvgFillToColor()`):

```typescript
// mergedNode에서 각 variant의 자식 SVG fill 색상 추출
// Default variant → base color
// Disabled variant → :disabled pseudo color
astTree.style.base = { ...astTree.style.base, color: "#4B4B4B" };
astTree.style.pseudo[":disabled"] = { color: "#CACACA" };
```

## 결과

```css
button {
  color: #4b4b4b; /* 기본 아이콘 색 */
}
button:disabled {
  color: #cacaca; /* Disabled 아이콘 색 */
}
```

## 테스트

`test/compiler/ghost-analysis.test.ts`
