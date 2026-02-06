# ISSUE-028: SVG 아이콘 색상이 거의 흰색으로 렌더링되는 문제

## 상태
**RESOLVED**

## 문제 설명

SVG 아이콘이 검은색 대신 거의 흰색(`rgb(230, 237, 243)`)으로 렌더링됨.

```
Figma 원본: 검은색 SVG 아이콘 (#000000)
잘못된 렌더링: 거의 흰색 (rgb(230, 237, 243))
```

브라우저 DevTools 확인 결과:
```html
<svg fill="currentColor" ...>
  <path fill="currentColor"/>
</svg>
```

**문제 원인**: `fill="currentColor"`는 부모 요소의 `color` CSS 속성 값을 사용하는데, 부모에 `color`가 없으면 브라우저 기본값(User Agent Stylesheet)을 사용함.

## 원인

**`SvgToJsx.ts`에서 모든 fill 속성을 `currentColor`로 변환**:

```typescript
if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = "currentColor";  // 모든 색상을 currentColor로 변환
}
```

**렌더링 문제**:
1. SVG의 `fill="currentColor"` 설정됨
2. 부모 컴포넌트에 `color` CSS 속성 없음
3. 브라우저가 기본 색상 적용 → `rgb(230, 237, 243)` (거의 흰색)

이 로직은 **이슈 #6 (State별 SVG 아이콘 색상 다름)**를 해결하기 위해 추가된 것이었지만:
- State별로 다른 아이콘 색상이 필요한 경우: 부모에 `color` CSS 추가
- State별로 같은 아이콘 색상인 경우: 부모에 `color` CSS 없음 → 렌더링 문제 발생

## 해결

**원본 fill 색상을 유지하도록 수정**:

```typescript
if (attrName === "fill" && attrValue === "currentColor") {
  finalValue = "currentColor";
} else if (attrName === "fill" && this._isColorValue(attrValue)) {
  finalValue = attrValue;  // 원본 색상 유지
}
```

**핵심 변경사항**:
1. `fill="currentColor"`인 경우만 그대로 유지
2. 다른 색상 값(`#000000`, `rgb(0,0,0)` 등)은 원본 그대로 유지
3. 부모에 `color` CSS가 없어도 올바르게 렌더링됨

## 결과

```tsx
// 생성된 코드
<svg viewBox="0 0 24 24" fill="none">
  <path d="M..." fill="#000000"/>  {/* 원본 색상 유지 */}
</svg>
```

| 항목 | 기존 | 수정 후 | 상태 |
|------|------|---------|------|
| SVG fill | `currentColor` → `rgb(230, 237, 243)` | `#000000` | ✓ |
| 부모 color CSS | 필요 (없으면 렌더링 문제) | 불필요 | ✓ |
| 아이콘 색상 | 거의 흰색 | 검은색 | ✓ |

## 테스트

`test/compiler/svgToJsx.test.ts`
