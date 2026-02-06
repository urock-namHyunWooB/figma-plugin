# ISSUE-021: TestPage에서 HTML 속성과 충돌하는 Prop 이름 처리

## 상태
**RESOLVED**

## 문제 설명

Figma variant prop 이름이 HTML 속성과 충돌하여 컴포넌트가 올바르게 렌더링되지 않음. 예: `name` prop이 HTML `name` 속성으로 인식됨.

```
Figma Variant:
- name: "ONiON X1" | "ONiON X2" | "ONiON X3"

컴파일된 Props:
{ customName: "ONiON X1" }  ← 컴파일러가 name을 customName으로 변환

TestPage에서 전달:
{ name: "ONiON X1" }        ← 변환 안 됨 → props 불일치
```

## 원인

- 컴파일러(`PropsManager`)는 HTML 속성과 충돌하는 prop 이름을 `customXxx` 형태로 변환
- TestPage의 `parseVariantProps()`는 이 변환을 수행하지 않음
- 결과적으로 컴포넌트에 전달되는 props와 기대하는 props가 불일치

## 해결

`TestPage.tsx`에 동일한 prop 이름 변환 로직 추가:

```typescript
const CONFLICTING_HTML_ATTRS = [
  "disabled", "type", "value", "name", "id", "hidden",
  "checked", "selected", "required", "readOnly",
  "placeholder", "autoFocus", "autoComplete",
];

function renameConflictingPropName(propName: string): string {
  const lowerPropName = propName.toLowerCase();
  if (CONFLICTING_HTML_ATTRS.some((attr) => attr.toLowerCase() === lowerPropName)) {
    return `custom${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
  }
  return propName;
}

// parseVariantProps에서 사용
camelKey = renameConflictingPropName(camelKey);
```

## 결과

```typescript
// TestPage에서 올바른 props 전달
parseVariantProps("name=ONiON X1")
// → { customName: "ONiON X1" }  ← 컴파일러와 일치

// 컴포넌트 정상 렌더링
<ColorbrandLogo customName="ONiON X1" />
<ColorbrandLogo customName="ONiON X2" />
<ColorbrandLogo customName="ONiON X3" />
```
