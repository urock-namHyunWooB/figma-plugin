# ISSUE-027: SLOT prop 조건부 스타일 누락 문제

## 상태
**RESOLVED**

## 문제 설명

SLOT prop의 존재 여부에 따른 조건부 스타일이 렌더링되지 않음. Headerroot 컴포넌트에서 `rightIcon` slot의 유무에 따라 다른 padding, gap, justify-content, align-items가 적용되어야 하는데 모두 무시됨.

```typescript
// 기대: rightIcon이 있을 때와 없을 때 다른 레이아웃
interface HeaderrootProps {
  leftIcon?: React.ReactNode;
  text?: React.ReactNode;
  rightIcon?: React.ReactNode;  // optional slot
}

// 문제: rightIcon 유무와 관계없이 동일한 스타일 적용
<div css={HeaderrootCss}>  {/* padding, gap 등이 누락됨 */}
  {leftIcon}
  {text}
  {rightIcon}
</div>
```

## 원인

1. **`_FinalAstTree.ts`의 `_removeSlotPropsDynamicStyles` 함수**
   - SLOT 변환 시 해당 prop과 연관된 모든 dynamic styles를 완전히 삭제
   - Boolean prop에서 SLOT으로 변환될 때 조건부 스타일이 제거됨

2. **Emotion CSS 템플릿 리터럴의 객체 보간 문제**
   - JavaScript 객체를 CSS 템플릿 리터럴에 직접 보간하면 `[object Object]`로 변환됨

## 해결

**SLOT prop에 대한 별도 CSS 변수 생성 패턴**:

1. `_FinalAstTree.ts`: `_removeSlotPropsDynamicStyles` → `_convertSlotPropsDynamicStyles`로 변경
   - 조건을 삭제하지 않고 변환: `props.X === "True"` → `props.X != null`

2. `GenerateStyles.ts`: SLOT prop용 별도 CSS 변수 생성
   - `${ComponentName}With${PropName}Css`, `${ComponentName}Without${PropName}Css` 생성

3. `EmotionStrategy.ts`: CSS 배열로 조건부 스타일 조합
   - `css={[baseCss, prop != null ? withPropCss : withoutPropCss]}`

```typescript
private _convertSlotCondition(cond: DynamicStyleCondition): DynamicStyleCondition {
  if (cond.value === "True") {
    return { ...cond, comparison: "!=", value: "null" };
  } else if (cond.value === "False") {
    return { ...cond, comparison: "==", value: "null" };
  }
  return cond;
}
```

## 결과

```typescript
// 생성된 코드
const HeaderrootCss = css`
  display: flex;
  flex-direction: row;
`;

const HeaderrootWithRightIconCss = css`
  padding: 16px 24px;
  justify-content: center;
  align-items: flex-start;
  gap: 245px;
`;

const HeaderrootWithoutRightIconCss = css`
  padding: 16px 301px 16px 24px;
  align-items: center;
`;

// JSX에서 CSS 배열로 조건부 스타일 적용
function Headerroot({ leftIcon, text, rightIcon }: HeaderrootProps) {
  return (
    <div css={[
      HeaderrootCss,
      rightIcon != null
        ? HeaderrootWithRightIconCss
        : HeaderrootWithoutRightIconCss,
    ]}>
      {leftIcon}
      {text}
      {rightIcon}
    </div>
  );
}
```

## 테스트

`test/compiler/slotDynamicStyles.test.ts`
