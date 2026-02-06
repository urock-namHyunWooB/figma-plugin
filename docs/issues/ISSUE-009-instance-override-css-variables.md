# ISSUE-009: 인스턴스 오버라이드를 Props로 전달 (CSS 변수 방식)

## 상태
**RESOLVED**

## 문제 설명

Figma에서 동일한 컴포넌트(ColorGuide)의 여러 INSTANCE가 각각 다른 배경색/텍스트를 가지는데, 컴파일 시 하나의 컴포넌트로 생성되어 인스턴스별 오버라이드가 반영되지 않음.

```
Figma 원본:
┌─────────┬─────────┬─────────┐
│ #FFFFFF │ #D6D6D6 │ #B2B2B2 │  ← 각각 다른 배경색
│  "100"  │  "90"   │  "80"   │  ← 각각 다른 텍스트
└─────────┴─────────┴─────────┘

잘못된 렌더링:
┌─────────┬─────────┬─────────┐
│ #FFFFFF │ #FFFFFF │ #FFFFFF │  ← 모두 같은 배경색
│  "100"  │  "100"  │  "100"  │  ← 모두 같은 텍스트
└─────────┴─────────┴─────────┘
```

## 원인

- 의존 컴포넌트(ColorGuide)가 기본 variant 정보만 가지고 있음
- 각 INSTANCE의 오버라이드 정보가 전달되지 않음

## 해결

**1단계: 오버라이드 추출 (`DependencyManager._collectAllOverrideableProps`)**

```typescript
// INSTANCE children vs Variant children 비교
if (instanceChild.fills !== variantChild.fills) {
  overrideProps["rectangle1Bg"] = instanceChild.fills; // #D6D6D6
}
if (instanceChild.characters !== variantChild.characters) {
  overrideProps["aaText"] = instanceChild.characters; // "90"
}
```

**2단계: CSS 변수 적용 (`_FinalAstTree._applyOverrideableCssVariables`)**

```typescript
// Before: background: var(--Neutral-100, #FFF)
// After:  background: var(--rectangle1-bg, var(--Neutral-100, #FFF))

const cssVarName = `--${nodeName}-bg`;
targetNode.style.base.background = `var(${cssVarName}, ${originalBg})`;
```

**3단계: Props 인터페이스 생성 (`GenerateInterface`)**

```typescript
export interface ColorGuideProps {
  rectangle1Bg?: string; // fills 오버라이드
  aaBg?: string; // fills 오버라이드
  aaText?: string | React.ReactNode; // characters 오버라이드
  children?: React.ReactNode;
}
```

**4단계: JSX에서 CSS 변수 설정 (`CreateJsxTree`)**

```jsx
// ColorGuide 컴포넌트 내부
<div
  css={Rectangle1Css}
  style={{ "--rectangle1-bg": rectangle1Bg }}  // CSS 변수로 오버라이드
/>
<span css={AACss}>
  {aaText ?? "100"}  // 기본값과 함께 오버라이드
</span>

// Tokens 컴포넌트에서 사용
<ColorGuide rectangle1Bg="#D6D6D6" aaText="90" />
<ColorGuide rectangle1Bg="#B2B2B2" aaText="80" />
```

## 결과

```css
/* ColorGuide CSS */
const Rectangle1Css = css`
  background: var(--rectangle1-bg, var(--Neutral-100, #FFF));
`;
```

```jsx
// 정확한 인스턴스별 오버라이드 적용
<ColorGuide rectangle1Bg="#FFFFFF" aaText="100" />
<ColorGuide rectangle1Bg="#D6D6D6" aaText="90" />
<ColorGuide rectangle1Bg="#B2B2B2" aaText="80" />
```

## 테스트

`test/compiler/instanceOverrideProps.test.ts`
