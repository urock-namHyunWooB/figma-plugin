# ISSUE-007: Pseudo-class 순서 및 :disabled 상태 처리

## 상태
**RESOLVED**

## 문제 설명

1. **`:disabled` 버튼도 `:hover` 효과 적용됨**: disabled 상태에서 마우스 올리면 배경색 변경
2. **`:active`가 `:hover`에 덮어씌워짐**: 클릭해도 hover 색상만 보임

## 원인

```css
/* 잘못된 순서 */
:active {
  background: #e1e1e1;
}
:hover {
  background: #f5f5f5;
} /* active를 덮어씀 */
```

CSS에서 같은 우선순위면 나중에 정의된 것이 적용. 클릭 시 `:hover`와 `:active`가 동시에 true이므로 `:hover`가 우선됨.

## 해결

`GenerateStyles._pseudoStyleToCssString()`에서:

1. `:hover`, `:active`를 `&:not(:disabled)`로 감싸기
2. pseudo-class 순서 정렬: hover → focus → active → disabled

```typescript
// 순서 정렬
const pseudoOrder = [":hover", ":focus", ":active", ":disabled"];
const sortedEntries = Object.entries(pseudo).sort(...);

// :not(:disabled) 적용
if (hasDisabled && (pseudoClass === ":hover" || pseudoClass === ":active")) {
  finalPseudoClass = `&:not(:disabled)${pseudoClass}`;
}
```

## 결과

```css
&:not(:disabled):hover {
  background: #f5f5f5;
} /* 먼저 */
&:not(:disabled):active {
  background: #e1e1e1;
} /* 나중 - hover를 덮어씀 */
:disabled {
  color: #cacaca;
}
```
