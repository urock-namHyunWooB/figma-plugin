# ISSUE-010: 외부 컴포넌트 wrapper에 CSS 클래스 적용

## 상태
**RESOLVED**

## 문제 설명

외부 컴포넌트(INSTANCE)를 감싸는 wrapper div에 인라인 스타일이 사용되어 코드가 지저분함.

```jsx
// 인라인 스타일 (지저분)
<div style={{ height: "88px", flex: "1 0 104.72px", width: "104.72px" }}>
  <ColorGuide ... />
</div>
```

## 원인

- `CreateJsxTree._wrapWithLayoutDiv`에서 항상 인라인 스타일 사용
- 이미 생성된 CSS 클래스(`ColorguideCss`)가 활용되지 않음

## 해결

`CreateJsxTree._wrapWithLayoutDiv`에서 CSS 클래스 우선 사용:

```typescript
private _wrapWithLayoutDiv(node, componentElement, layoutStyles) {
  const cssVarName = node.generatedNames?.cssVarName;

  if (cssVarName) {
    // CSS 클래스가 있으면 css prop 사용
    const cssAttr = factory.createJsxAttribute("css", cssVarName);
    return wrapWithDiv(cssAttr, componentElement);
  } else {
    // 없으면 인라인 스타일 fallback
    const styleAttr = factory.createJsxAttribute("style", layoutStyles);
    return wrapWithDiv(styleAttr, componentElement);
  }
}
```

## 결과

```jsx
// CSS 클래스 사용 (깔끔)
<div css={ColorguideCss}>
  <ColorGuide rectangle1Bg="#D6D6D6" aaText="90" />
</div>
```

```css
const ColorguideCss = css`
  display: flex;
  height: 88px;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1 0 104.72px;
`;
```

## 테스트

`test/compiler/instanceOverrideProps.test.ts`, `test/compiler/layoutRegression.test.ts`
