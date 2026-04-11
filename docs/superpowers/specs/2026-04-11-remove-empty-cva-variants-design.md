# Remove Empty CVA Variants

## Problem

TailwindStrategy가 CVA 코드 생성 시 빈 variant 항목을 자동으로 채운다. 예:
```typescript
disable: { true: "", false: "" }  // 모든 값이 빈 문자열
variant: { Primary: "", Assistive: "backdrop-blur-[32px]" }  // 일부만 빈 문자열
```

CVA는 `compoundVariants`에서 참조하는 prop이 `variants`에 선언되지 않아도 동작하고, variant 내 일부 옵션이 누락되어도 동작한다. 빈 문자열 채우기는 불필요하다.

## Root Cause

`TailwindStrategy.ts`의 `generateDynamicStyleCode()`에서 두 곳:
1. **291-301행**: 단독 variant에서 스타일이 없는 옵션을 `""` 로 채움
2. **310-322행**: compoundVariants에서만 쓰이는 prop을 위해 빈 variant 블록 전체 생성

## Solution

두 코드 블록을 제거한다.

### 수정 파일
- `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/TailwindStrategy.ts`

### 예상 결과 (Buttonsolid 기준)
- `disable: { true: "", false: "" }` → variant 선언 제거, compoundVariants에서만 참조
- `variant: { Primary: "", Assistive: "..." }` → `variant: { Assistive: "..." }`
- `loading: { true: "...", false: "" }` → `loading: { true: "..." }`
- `buttonSolidLoadingClasses`의 size variant (전부 빈 값) → variant 블록 제거

### 테스트
- 기존 테스트 스위트 통과 확인
- Buttonsolid CVA 진단 테스트로 빈 variant 제거 확인
