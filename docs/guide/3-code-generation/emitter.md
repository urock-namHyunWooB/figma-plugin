# Layer 3: CodeEmitter

> 전체 파이프라인 개요는 [아키텍처 문서](../0-architecture/pipeline-overview.md)를 참조하세요.

### ICodeEmitter 인터페이스

```typescript
interface ICodeEmitter {
  readonly framework: string;

  /** 단일 UITree → 코드 */
  emit(uiTree: UITree): Promise<EmittedCode>;

  /** 메인 + 의존성 → 개별 코드 */
  emitAll(main: UITree, deps: Map<string, UITree>): Promise<GeneratedResult>;

  /** 메인 + 의존성 → 단일 파일 */
  emitBundled(main: UITree, deps: Map<string, UITree>): Promise<BundledResult>;
}

interface EmittedCode {
  code: string;                          // 생성된 컴포넌트 코드
  componentName: string;                 // 컴포넌트 이름
  fileExtension: string;                 // ".tsx"
  diagnostics?: VariantInconsistency[];  // 디자인 불일치 진단
}

interface BundledResult {
  code: string;                          // 번들된 단일 파일
  diagnostics: VariantInconsistency[];   // 모든 컴포넌트 진단 집계
}
```

### ReactEmitter

#### 책임

- UITree를 React TypeScript 코드로 변환
- 4개 Generator 조합으로 코드 생성
- Prettier 포맷팅 적용
- 미사용 import 필터링

#### 코드 생성 파이프라인

```
UITree
  │
  ├── 1. toComponentName(root.name)          컴포넌트 이름 결정
  │
  ├── 2. generateAllSections()               4개 섹션 병렬 생성
  │      ├── ImportsGenerator.generate()     → import 문
  │      ├── PropsGenerator.generate()       → interface Props { ... }
  │      ├── StylesGenerator.generate()      → const css / className 선언
  │      └── JsxGenerator.generate()         → function Component() { return (...) }
  │
  ├── 3. filterComponentImportsByJsx()       미사용 컴포넌트 import 제거
  │
  └── 4. assembleAndFormat()                 조합 + Prettier
         │
         ▼
      EmittedCode
```

#### 옵션

```typescript
interface ReactEmitterOptions {
  styleStrategy?: "emotion" | "tailwind";  // 기본: "emotion"
  debug?: boolean;                          // data-figma-id 속성 추가
  tailwind?: {
    inlineCn?: boolean;                     // cn 함수 인라인 vs import
    cnImportPath?: string;                  // cn import 경로
  };
}
```

### Generators

#### ImportsGenerator

```typescript
// 출력 예시
import React, { useState } from "react";
import { css } from "@emotion/react";
import { NavigationItem } from "./NavigationItem";
```

- `useState`은 `uiTree.stateVars`가 있을 때만 포함
- 스타일 전략별 import 추가
- 외부 컴포넌트 (type === "component") import 수집

#### PropsGenerator

```typescript
// 출력 예시
export interface ButtonProps {
  size?: "small" | "medium" | "large";       // variant
  disabled?: boolean;                         // boolean
  label: string;                              // string
  children?: React.ReactNode;                 // slot
  items?: Array<{ label: string; }>;          // array slot
  onClick?: (...args: any[]) => void;         // function
}
```

- Variant props → TypeScript union 타입
- Boolean + extras → `boolean | "extra1" | "extra2"`
- Array Slot → `Array<{ itemProps }>` 또는 `Array<React.ReactNode>`

#### StylesGenerator

```typescript
// Emotion 출력 예시
const buttonCss = css`
  display: flex;
  width: 100%;
  padding: 8px;
`;
const buttonCss_sizeStyles: Record<string, any> = {
  "small": css`font-size: 12px;`,
  "large": css`font-size: 16px;`,
};
```

- 변수명 고유성 보장 (충돌 시 `_2`, `_3` 접미사)
- 의존성 루트 유동화 (고정 width/height → `100%`)
- 슬롯 노드: 자식 순회 건너뛰기, 노드 자체 스타일만 포함
- 출력: `{ code, nodeStyleMap: Map<nodeId, variableName> }`

#### JsxGenerator

```typescript
// 출력 예시
function ButtonComponent(props: ButtonComponentProps) {
  const { size = "medium", disabled, label, ...restProps } = props;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button css={[buttonCss, buttonCss_sizeStyles?.[String(size)]]} {...restProps}>
      {label}
    </button>
  );
}

export default ButtonComponent;
```

주요 기능:
- Props 구조 분해 + 기본값
- 조건부 렌더링: `{isOpen && (<div>...</div>)}`
- 슬롯 바인딩: `{slotProp && (<div css={styles}>{slotProp}</div>)}`
- 배열 슬롯: `{items.map((item, index) => <Item key={index} {...item} />)}`
- SVG → JSX 변환 (kebab-case → camelCase, class → className)
- 텍스트 세그먼트 스타일 분리, `\n` → `<br />`

### StyleStrategy 패턴

#### IStyleStrategy 인터페이스

```typescript
interface IStyleStrategy {
  name: string;
  getImports(): string[];
  generateStyle(nodeId, nodeName, style, parentPath?): StyleResult;
  getJsxStyleAttribute(styleVarName, hasConditional): JsxStyleAttribute;
  generateConditionalStyle(baseStyle, conditions): string;
  generatePseudoStyle(pseudoClass, style): string;
}
```

#### EmotionStrategy

```typescript
// 스타일 선언
const buttonCss = css`
  display: flex;
  &:hover { background: #e0e0e0; }
  @media (max-width: 768px) { width: 100%; }
`;
const buttonCss_sizeStyles: Record<string, any> = {
  "small": css`font-size: 12px;`,
};

// JSX 속성
css={buttonCss}
css={[buttonCss, buttonCss_sizeStyles?.[String(size)]]}
```

#### TailwindStrategy

```typescript
// 스타일 선언 (CVA 사용)
const buttonClasses = cva("flex w-full p-2 rounded-lg", {
  variants: {
    size: {
      "small": "text-[length:12px]",
      "large": "text-[length:16px]",
    },
  },
});

// JSX 속성
className="flex w-full p-2"
className={buttonClasses({ size, disabled })}
```

- CSS → Tailwind 매핑: `display: flex` → `flex`, `width: 100px` → `w-[100px]`
- 반응형: `(max-width: 767px)` → `max-md:`, `(min-width: 1280px)` → `xl:`
- CVA (Class Variance Authority)로 variant 생성

### DynamicStyleDecomposer

복합 AND 조건(`size=M AND active=true`)에서 각 CSS 속성의 "소유 prop"을 결정합니다.

```
Step 1: 단일 prop vs 다중 prop 분리
Step 2: 다중 prop → [prop 값] × [스타일] 매트릭스
Step 3: CSS 속성별 controlling prop 탐색
  ├── Level 1: 단일 prop 일관성
  ├── Level 2: 복합 prop (style+tone) 일관성
  └── Level 3: 최적 적합도
Step 4: CSS 속성 → 소유 prop 할당
Step 5: 균일 속성 제거 (모든 variant 동일 = 비제어)
```

**진단 출력**: variant 그룹 내 CSS 속성 불일치 시 `VariantInconsistency` 보고
→ UI에서 "디자인 불일치: Button color가 size=M에서 일관되지 않음" 표시 가능

### ReactBundler

멀티 컴포넌트를 단일 `.tsx` 파일로 번들링합니다.

#### 번들링 파이프라인

```
Map<id, EmittedCode>
  │
  ├── 1. 이름 중복 제거 (deduplicateByName)
  ├── 2. 미참조 의존성 필터링 (filterReferencedDependencies)
  ├── 3. 이름 충돌 해결 → "_" 접두사 리네이밍
  ├── 4. Import 추출 + 통합 (React/라이브러리만 유지)
  ├── 5. 의존성 코드 정리:
  │      - import 제거
  │      - CSS 변수 접두사 (btnCss → Button_btnCss)
  │      - cn 함수 중복 제거
  │      - export default → const 화살표 함수
  │      - export 키워드 제거
  ├── 6. <button> 루트 중화 (HTML 중첩 방지)
  │
  └── BundledResult { code, diagnostics }
```

### 디렉토리 구조

```
layers/code-emitter/
├── ICodeEmitter.ts                  # 인터페이스 (확장 가능: Vue, Svelte)
├── index.ts
│
└── react/
    ├── ReactEmitter.ts              # ICodeEmitter 구현
    ├── ReactBundler.ts              # 멀티 컴포넌트 번들링
    │
    ├── generators/
    │   ├── index.ts
    │   ├── ImportsGenerator.ts      # import 문 생성
    │   ├── PropsGenerator.ts        # Props interface 생성
    │   ├── StylesGenerator.ts       # 스타일 선언 생성
    │   └── JsxGenerator.ts         # JSX + 함수 컴포넌트 생성
    │
    └── style-strategy/
        ├── index.ts
        ├── IStyleStrategy.ts        # 스타일 전략 인터페이스
        ├── EmotionStrategy.ts       # Emotion CSS-in-JS
        ├── TailwindStrategy.ts      # Tailwind CSS + CVA
        └── DynamicStyleDecomposer.ts # 다중 prop 스타일 분해 + 진단
```
