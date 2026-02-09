# Layer 3: ReactEmitter

> **핵심**: DesignTree를 React/TypeScript 코드로 변환합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| DesignTree | React Code | JSX, Props, 스타일 코드 생성 |

---

## 왜 필요한가?

DesignTree는 **플랫폼 독립적**입니다. 이를 실제 실행 가능한 코드로 변환해야 합니다.

```
DesignTree (추상)          React Code (구체)
─────────────────          ──────────────────
type: "container"    →     <div css={styles.root}>
type: "text"         →     <span>{label}</span>
type: "slot"         →     {icon}
```

---

## 아키텍처

```
DesignTree
     │
     ▼
┌─────────────────────────────────────┐
│           ReactEmitter               │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │      ImportsGenerator        │   │  → import 문 생성
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │       PropsGenerator         │   │  → Props interface
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │       StyleGenerator         │   │  → 스타일 코드
│  │  ┌─────────────────────┐    │   │
│  │  │   StyleStrategy     │    │   │     Emotion / Tailwind
│  │  └─────────────────────┘    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │        JsxGenerator          │   │  → JSX 트리
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
     │
     ▼
React Code
```

---

## 하는 일

### 1. Imports 생성 (ImportsGenerator)

필요한 import 문을 수집합니다.

```typescript
// 기본 imports
import React from 'react';

// 스타일 전략에 따른 import
import { css } from '@emotion/react';  // Emotion
// 또는 TailwindCSS는 import 없음

// 외부 컴포넌트
import { Icon } from './Icon';
import { Avatar } from './Avatar';
```

### 2. Props Interface 생성 (PropsGenerator)

TypeScript Props interface를 생성합니다.

```typescript
// DesignTree.props 기반
interface ButtonProps {
  size?: 'large' | 'small';
  label?: string;
  disabled?: boolean;
  icon?: React.ReactNode;  // slot
  onClick?: () => void;    // 이벤트 핸들러 (componentType 기반)
}
```

**타입 매핑**

| PropDefinition.type | TypeScript 타입 |
|--------------------|-----------------|
| variant | union 리터럴 (`'a' \| 'b'`) |
| boolean | `boolean` |
| string | `string` |
| slot | `React.ReactNode` |

### 3. 스타일 생성 (StyleGenerator + StyleStrategy)

DesignNode.styles를 스타일 코드로 변환합니다.

**Emotion 전략**

```typescript
const styles = {
  root: (props: ButtonProps) => css`
    display: flex;
    padding: ${props.size === 'large' ? '12px 24px' : '8px 16px'};

    &:hover {
      background-color: #e0e0e0;
    }

    &:disabled {
      opacity: 0.5;
    }
  `
};
```

**Tailwind 전략**

```typescript
const getClassName = (props: ButtonProps) => cn(
  "flex",
  props.size === 'large' ? 'px-6 py-3' : 'px-4 py-2',
  "hover:bg-gray-200",
  "disabled:opacity-50"
);
```

### 4. JSX 생성 (JsxGenerator)

DesignNode 트리를 JSX로 변환합니다.

```typescript
// DesignNode 트리
root
├── icon (slot, conditional: showIcon)
└── label (text, binding: label)

// 생성된 JSX
<div css={styles.root(props)}>
  {showIcon && icon}
  <span>{label}</span>
</div>
```

**노드 타입별 변환**

| DesignNodeType | JSX 출력 |
|----------------|---------|
| container | `<div>` / `<button>` (componentType 기반) |
| text | `<span>{binding}</span>` |
| slot | `{slotName}` |
| external | `<ComponentName {...props}/>` |
| vector | `<svg>...</svg>` |
| image | `<img src={...}/>` |

---

## 출력

```typescript
interface EmittedCode {
  code: string;           // 전체 컴포넌트 코드
  componentName: string;  // "Button"
  imports: string[];      // import 문 목록
}
```

**예시 출력**

```typescript
import React from 'react';
import { css } from '@emotion/react';

interface ButtonProps {
  size?: 'large' | 'small';
  label?: string;
  showIcon?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}

const Button = ({
  size = 'large',
  label = 'Button',
  showIcon = true,
  icon,
  disabled = false
}: ButtonProps) => {
  return (
    <button
      css={css`
        display: flex;
        align-items: center;
        gap: 8px;
        padding: ${size === 'large' ? '12px 24px' : '8px 16px'};

        &:hover:not(:disabled) {
          background-color: #e0e0e0;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}
      disabled={disabled}
    >
      {showIcon && icon}
      <span>{label}</span>
    </button>
  );
};

export default Button;
```

---

## StyleStrategy 패턴

스타일 출력 방식을 교체할 수 있습니다.

```typescript
interface IStyleStrategy {
  generateStyles(styles: StyleDefinition, props: PropDefinition[]): string;
  getStyleAttribute(nodeId: string): string;  // css={...} 또는 className={...}
  getImports(): string[];
}

// 사용
const strategy = useEmotionStrategy ? new EmotionStrategy() : new TailwindStrategy();
const emitter = new ReactEmitter(strategy);
```

---

## 관련 파일

```
core/code-emitter/
├── ReactEmitter.ts          # 메인 오케스트레이터
├── generators/
│   ├── ImportsGenerator.ts
│   ├── PropsGenerator.ts
│   ├── StyleGenerator.ts
│   └── JsxGenerator.ts
└── style-strategy/
    ├── IStyleStrategy.ts
    ├── EmotionStrategy.ts
    └── TailwindStrategy.ts
```
