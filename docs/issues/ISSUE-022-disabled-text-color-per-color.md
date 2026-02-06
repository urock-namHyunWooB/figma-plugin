# ISSUE-022: Disabled 상태에서 Color별 텍스트 색상 처리

## 상태
**RESOLVED**

## 문제 설명

Disabled 버튼의 텍스트 색상이 Color variant에 따라 다르게 표시되어야 하는데, 모든 Color에서 동일한 회색(#B2B2B2)으로 렌더링됨.

```
Figma 디자인:
- Primary Disabled: 흰색 텍스트 (#FFF) ← 연한 파란 배경에 흰색 유지
- Light Disabled: 회색 텍스트 (#B2B2B2)
- Neutral Disabled: 회색 텍스트 (#B2B2B2)
- Black Disabled: 회색 텍스트 (#B2B2B2)

잘못된 렌더링:
- 모든 Color의 Disabled: 회색 텍스트 (#B2B2B2) ← Primary도 회색!
```

## 원인

1. `:disabled` pseudo-class는 `<button>` 요소에만 적용되고, 내부 `<span>` 텍스트에는 적용되지 않음
2. 기존 로직은 Disabled 텍스트 색상을 boolean 조건으로만 처리:
   ```typescript
   ${$customDisabled ? { color: "#B2B2B2" } : {}}
   ```
3. Color prop에 따른 분기 처리가 없어서 모든 Color에 같은 회색 적용

## 해결

**`indexedConditional` 패턴 적용**:

Boolean prop(Disabled)과 Index prop(Color)을 조합하여 Color별로 다른 Disabled 텍스트 색상 적용.

**1단계: Figma variant에서 Color별 Disabled 텍스트 색상 추출 (`_FinalAstTree.ts`)**

```typescript
// _applyDisabledStylesFromVariants에서 Color별 disabled 텍스트 색상 추출
const disabledTextColors: Record<string, string> = {};

for (const [variantName, textChild] of Object.entries(variantTextChildren)) {
  const colorMatch = variantName.match(/Color=([^,]+)/i);
  const disabledMatch = variantName.match(/Disabled=True/i);

  if (colorMatch && disabledMatch) {
    const colorValue = colorMatch[1].trim();
    const textColor = textChild?.fills?.[0]?.color;
    if (textColor) {
      disabledTextColors[colorValue] = rgbaToHex(textColor);
    }
  }
}
```

**2단계: TEXT 노드에 indexedConditional 설정**

```typescript
const ADisabledColorStyles = {
  Primary: {},                    // 변경 없음 - 기본 흰색 유지
  Light: { color: "#B2B2B2" },
  Neutral: { color: "#B2B2B2" },
  Black: { color: "#B2B2B2" },
};

node.style.indexedConditional = {
  booleanProp: "customDisabled",
  indexProp: "color",
  styles: ADisabledColorStyles,
};
```

**3단계: 코드 생성 (`GenerateStyles.ts`)**

```typescript
const ACss = (
  $color: NonNullable<LargeProps["color"]>,
  $customDisabled: NonNullable<LargeProps["customDisabled"]>
) => css`
  text-align: center;
  font-family: Pretendard;
  font-size: 16px;
  font-weight: 700;
${AColorStyles[$color]}
${$customDisabled ? ADisabledColorStyles[$color] : {}}
`;
```

## 결과

| Color | Disabled 텍스트 색상 | 상태 |
|-------|---------------------|------|
| Primary | `rgb(255, 255, 255)` (흰색) | ✓ |
| Light | `rgb(178, 178, 178)` (회색) | ✓ |
| Neutral | `rgb(178, 178, 178)` (회색) | ✓ |
| Black | `rgb(178, 178, 178)` (회색) | ✓ |

## 테스트

`test/compiler/disabledTextColor.test.ts`
