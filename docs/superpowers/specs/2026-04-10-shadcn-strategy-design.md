# ShadcnStrategy — shadcn/ui 스타일 코드 생성 전략

> 시리즈: CodeEmitter 사용자 커스터마이징 (3/N)
> 날짜: 2026-04-10

## 목적

shadcn/ui 스타일의 React 컴포넌트 코드를 생성하는 새 StyleStrategy를 추가한다.

## 배경

현재 TailwindStrategy가 이미 `cva`, `cn`을 사용하고 있지만 shadcn/ui의 완전한 패턴(VariantProps 타입, className prop 주입, defaultVariants)을 지원하지 않는다. TailwindStrategy에 모드를 추가하는 대신, 향후 확장성을 위해 독립된 `ShadcnStrategy`를 만든다.

## shadcn/ui 코드 패턴

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium",
  {
    variants: {
      size: {
        large: "px-8 py-4 text-base",
        small: "px-4 py-2 text-xs",
      },
    },
    defaultVariants: {
      size: "large",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ size, className, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ size }), className)} {...props} />
  );
}

export default Button;
```

## 설계

### 새 파일: ShadcnStrategy

`IStyleStrategy` 인터페이스를 구현하는 새 전략 클래스.

**입력**: SemanticComponent의 StyleObject (base, pseudo, dynamic)
**출력**: shadcn/ui 패턴의 코드 (cva + VariantProps + cn + className)

### TailwindStrategy와의 코드 공유

CSS → Tailwind 클래스 변환 로직을 공유 유틸로 추출:
- `CSS_TO_TAILWIND` 매핑 테이블
- `cssValueToTailwind()` 변환 함수들
- pseudo-class prefix 매핑

추출 위치: `style-strategy/tailwindUtils.ts` (신규 파일)

TailwindStrategy와 ShadcnStrategy가 이 유틸을 import하여 사용.

### 현재 Tailwind와의 차이점

| 항목 | TailwindStrategy | ShadcnStrategy |
|---|---|---|
| cva | ✅ | ✅ |
| cn | ✅ | ✅ |
| VariantProps 타입 | ❌ | ✅ — props interface에 추가 |
| className prop | ❌ | ✅ — 외부 className 주입 지원 |
| defaultVariants | ❌ 확인 필요 | ✅ — cva에 defaultVariants 블록 |
| 변수명 패턴 | `xxxCss` | `xxxVariants` (shadcn 관습) |
| import | `cva` | `cva` + `VariantProps` |

### PropsGenerator 변경

shadcn 전략일 때:
- `className?: string` prop 자동 추가
- props interface에 `VariantProps<typeof xxxVariants>` 확장
- native HTML attributes 확장 (예: `React.ButtonHTMLAttributes<HTMLButtonElement>`)

### 옵션

```typescript
export interface ShadcnStrategyOptions {
  /** cn import 경로 (기본: "@/lib/utils") */
  cnImportPath?: string;
}
```

### StyleStrategy 선택 확장

```typescript
export type StyleStrategyType = "emotion" | "tailwind" | "shadcn";
```

UI의 Emotion/Tailwind 토글에 shadcn 옵션 추가.

### 수정 대상 파일

| 파일 | 변경 |
|---|---|
| `style-strategy/tailwindUtils.ts` | 신규 — CSS→Tailwind 공유 유틸 추출 |
| `style-strategy/ShadcnStrategy.ts` | 신규 — IStyleStrategy 구현 |
| `style-strategy/TailwindStrategy.ts` | 공유 유틸 import로 전환 |
| `ReactEmitter.ts` | StyleStrategyType에 "shadcn" 추가, createStyleStrategy 분기 |
| `generators/PropsGenerator.ts` | shadcn일 때 VariantProps + className 추가 |
| `types/public.ts` | StyleStrategyType에 "shadcn" 추가 |
| `FigmaCodeGenerator.ts` | shadcn 옵션 전달 |
| `App.tsx` | 토글에 shadcn 옵션 추가 |

### 테스트 계획

- ShadcnStrategy 단위 테스트: base style → cva 출력
- variant style → cva variants 블록
- defaultVariants 포함 확인
- VariantProps 타입 생성 확인
- className prop 포함 확인
- JSX에 cn(xxxVariants({...}), className) 출력
- 기존 Emotion/Tailwind 테스트 회귀 없음
