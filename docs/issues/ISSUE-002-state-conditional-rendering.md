# ISSUE-002: CSS 변환 불가능한 State의 조건부 렌더링

## 상태
**RESOLVED** - 2026-02-02

## 문제 설명

CSS pseudo-class로 변환할 수 없는 State 값(Error, Insert, Press 등)이 조건부 렌더링으로 처리되지 않는 문제.

### 재현 케이스
- 테스트: `test/compiler/inputBoxOtp.test.ts`
- 테스트: `test/compiler/inputBoxStandard-visibility.test.ts`
- Fixture: `test/fixtures/any/InputBoxotp.json`
- Fixture: `test/fixtures/any/InputBoxstandard.json`

### 예시
```
InputBoxotp variants:
- State=Normal  → CSS 기본 상태
- State=Press   → CSS 변환 불가 (`:active`와 다른 의미)
- State=Insert  → CSS 변환 불가
- State=Error   → CSS 변환 불가
```

기대 동작:
```tsx
// Error, Insert, Press 상태에서만 보이는 요소
{state === "Error" && <ErrorElement />}
```

실제 동작 (수정 전):
```tsx
// 조건 없이 항상 렌더링됨
<ErrorElement />
```

## 원인 분석

### 1차 원인: State 조건 무시
`VisibilityProcessor.parseVariantCondition()`에서 모든 State 조건을 무시:
```typescript
// 수정 전
if (key.toLowerCase() === "state") continue; // 모든 State 무시
```

### 2차 원인: 조건이 노드에 연결되지 않음
`VisibilityProcessor.resolve()`에서 조건이 `ctx.conditionals` 배열에만 저장되고,
`InternalNode`에 연결되지 않아 `ComponentGenerator`에서 사용되지 않음.

### 3차 원인: 불필요한 조건 적용
Size, Left Icon 등 모든 prop 조건이 visibility에 적용되어,
Text 노드가 `leftIcon === "False" && rightIcon === "True"` 같은 조건에 의해 렌더링되지 않는 문제.

## 해결책

### 1. stateUtils.ts 생성
CSS 변환 가능 여부를 판단하는 유틸리티 분리:
```typescript
// src/.../workers/utils/stateUtils.ts
export function isCssConvertibleState(state: string): boolean;
export function stateToPseudo(state: string): PseudoClass | null | undefined;
```

CSS 변환 가능한 State:
- `hover`, `hovered`, `hovering` → `:hover`
- `active`, `pressed`, `pressing`, `clicked` → `:active`
- `focus`, `focused` → `:focus`
- `disabled`, `inactive` → `:disabled`
- `default`, `normal`, `enabled`, `rest`, `idle` → 기본 상태 (null)
- `selected`, `checked` → `:checked`

### 2. InternalNode에 conditions 필드 추가
```typescript
// interfaces/core.ts
export interface InternalNode {
  // ...
  conditions?: ConditionalRule[];
}
```

### 3. VisibilityProcessor 수정

#### parseVariantCondition (스타일용)
모든 prop 조건 파싱, CSS 변환 가능 State만 제외:
```typescript
if (key.toLowerCase() === "state" && isCssConvertibleState(value)) continue;
```

#### parseStateConditionOnly (visibility용)
State 조건만 파싱, CSS 변환 불가능한 것만:
```typescript
public parseStateConditionOnly(variantName: string): ConditionNode | null {
  // State만 처리, CSS 변환 불가능한 것만 조건으로 반환
}
```

#### resolve()
visibility용으로 State 조건만 사용:
```typescript
const result = instance.resolveVisibility(
  // ...
  instance.parseStateConditionOnly.bind(instance) // State만 파싱
);
if (result.conditionalRule) {
  node.conditions = [result.conditionalRule]; // 노드에 직접 설정
}
```

### 4. NodeConverter 수정
```typescript
return {
  // ...
  conditions: internal.conditions, // DesignNode로 복사
};
```

### 5. ComponentGenerator 수정
JsxExpression 타입 처리 추가:
```typescript
if (ts.isJsxExpression(childJsx)) {
  // 기존 expression과 새 조건을 AND 결합
}
```

## 관련 파일

| 파일 | 변경 내용 |
|------|-----------|
| `utils/stateUtils.ts` | 새 파일 - CSS 변환 가능 여부 판단 |
| `interfaces/core.ts` | InternalNode에 conditions 추가 |
| `StyleProcessor.ts` | stateUtils 사용 |
| `VisibilityProcessor.ts` | parseStateConditionOnly 추가, 노드에 조건 직접 설정 |
| `NodeConverter.ts` | conditions 복사 |
| `ComponentGenerator.ts` | JsxExpression 처리 |

## 회귀 테스트

### inputBoxOtp.test.ts
```typescript
test("CSS 변환 불가능한 State prop이 보존되어야 한다", async () => {
  // state?: State 타입 또는 문자열 리터럴
  expect(code).toMatch(/state\?:\s*(?:State|["'][^"']+["'])/);
  // 동적 스타일 사용
  const hasStateUsage =
    /StateStyles\[state\]/.test(code) ||
    /Css\(state\)/.test(code);
  expect(hasStateUsage).toBe(true);
});

test("State 조건부 visible이 올바르게 처리되어야 한다", async () => {
  // Error, Insert, Press 스타일이 존재
  const hasErrorStyle = /Error:\s*css\(/.test(code);
  expect(hasErrorStyle || hasInsertStyle || hasPressStyle).toBe(true);
});
```

### inputBoxStandard-visibility.test.ts
```typescript
test("CSS 변환 불가능한 state가 복합 조건에서 유지되어야 함", async () => {
  expect(code).toContain('state === "Error"');
  expect(code).toContain('state === "Press"');
});
```

## 관련 커밋

- `ff7332d` - fix(compiler): CSS 변환 불가능한 State의 조건부 렌더링 지원
- `9d79777` - fix(compiler): visibility 조건에 State만 적용
