# ISSUE-030: 숫자로 시작하는 식별자 처리

## 상태
**RESOLVED**

## 문제 설명

Figma 노드 이름이 `063112`처럼 숫자로만 구성된 경우, JavaScript 식별자로 사용할 수 없어 컴파일 에러 발생:

```
SyntaxError: Unexpected number
SyntaxError: Octal literals are not allowed in strict mode
```

생성된 코드:
```typescript
// 잘못된 식별자
const 063112 = "...";  // ❌ SyntaxError

// Record key로 사용된 경우
const styles: Record<"063112", any> = {
  063112: { ... },  // ❌ SyntaxError
};
```

## 원인

`toCamelCase` 함수가 숫자로 시작하는 결과에 대한 처리가 없었음:

```typescript
export function toCamelCase(key: string) {
  const words = key.split(" ").filter(Boolean);
  const first = words[0].toLowerCase();  // "063112"
  const rest = words.slice(1).map(...).join("");

  return first + rest;  // "063112" 반환 → JavaScript 식별자로 사용 불가
}
```

JavaScript 식별자는 숫자로 시작할 수 없음 (ECMAScript spec).

## 해결

**숫자로 시작하면 `_` prefix 추가**

```typescript
export function toCamelCase(key: string) {
  // ... (기존 변환 로직)

  const result = first + rest;

  // 숫자로 시작하면 앞에 _ 추가 (JavaScript 식별자는 숫자로 시작할 수 없음)
  if (/^[0-9]/.test(result)) {
    return "_" + result;
  }

  return result;
}
```

## 결과

```typescript
// 올바른 식별자
const _063112 = "...";  // ✓

const styles: Record<"_063112", any> = {
  _063112: { ... },  // ✓
};
```

**적용 범위**:
- `toCamelCase`: prop 이름, style key 등
- `normalizeComponentName`: 컴포넌트 이름 (이미 처리됨)
