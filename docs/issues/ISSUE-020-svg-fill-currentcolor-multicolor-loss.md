# ISSUE-020: SVG fill 색상이 currentColor로 변환되어 다중 색상 손실

## 상태
**RESOLVED**

## 문제 설명

Figma에서 여러 색상을 가진 SVG (예: 파란 배경 + 흰색 텍스트)가 모두 같은 색으로 렌더링됨. 특히 배지 색상이 연하게 보이는 문제.

```
Figma 원본:
┌──────────────┐
│ 🔵 #0050FF   │  ← 파란 배경
│   ⬜ white   │  ← 흰색 텍스트/아이콘
│   ⬛ black   │  ← 검정 텍스트
└──────────────┘

잘못된 렌더링:
모든 path의 fill이 "currentColor"로 변환되어
CSS color 속성 하나로 모든 색상이 제어됨
```

## 원인

`SvgToJsx._createJsxAttributes()`에서 모든 색상 fill 값을 `currentColor`로 변환:

```typescript
// 문제 코드
if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = "currentColor";  // #0050FF, white, black 모두 currentColor로
}
```

이 로직은 단일 색상 아이콘에서 CSS로 색상을 제어하기 위한 것이었으나, 다중 색상 SVG에서는 모든 색상 정보를 잃게 됨.

## 해결

`SvgToJsx._createJsxAttributes()`에서 원본 fill 색상 유지:

```typescript
// 수정: fill 색상을 그대로 유지 (다중 색상 SVG 지원)
const finalValue = attrValue;
// currentColor 변환 로직 제거
```

`_TempAstTree.updateVectorStyles()`에서 SVG 노드의 불필요한 CSS fill/color 제거:

```typescript
if (isSvgRendered) {
  // SVG path에 직접 색상이 있으므로 CSS fill/background 제거
  delete base["fill"];
  delete base["background"];
}
```

## 결과

```jsx
// SVG path들이 원본 색상 유지
<svg viewBox="0 0 94 56" fill="none">
  <path d="M80.25..." fill="#0050FF" />  {/* 파란 배경 */}
  <path d="M232..." fill="white" />      {/* 흰색 텍스트 */}
  <path d="M119..." fill="black" />      {/* 검정 텍스트 */}
</svg>
```

## 테스트

`test/compiler/svgToJsx.test.ts` - "fill 색상 보존" 섹션
`test/compiler/componentSetVariantPosition.test.ts`
