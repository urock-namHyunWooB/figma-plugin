# Layer 3: CodeEmitter

> 전체 파이프라인 개요는 [아키텍처 문서](../0-architecture/pipeline-overview.md)를 참조하세요.

## 이 레이어가 하는 일

Layer 2(TreeManager)가 Figma 데이터를 분석해서 **UITree**(플랫폼 독립 IR)를 만들면, Layer 3이 이를 **실제 코드**로 출력한다.

UITree에는 이미 모든 정보가 들어 있다 — 어떤 노드가 `<button>`인지, 어떤 prop이 어떤 CSS를 제어하는지, 조건부 가시성은 어떤 조건인지. Layer 3은 이 정보를 코드 문자열로 **조립**하는 역할이다.

### 왜 4개 Generator로 분리했는가

React 컴포넌트 파일은 4개 섹션으로 구성된다:

```typescript
// 1. Imports — 어떤 라이브러리/컴포넌트를 쓰는가
import React from "react";
import { css } from "@emotion/react";

// 2. Props interface — 어떤 props를 받는가
export interface ButtonProps { size?: "S" | "M"; }

// 3. Styles — CSS 선언
const buttonCss = css`display: flex;`;

// 4. JSX — 컴포넌트 함수 본문
function Button(props: ButtonProps) { return <button>...</button>; }
```

각 섹션은 UITree의 다른 측면을 소비한다. Imports는 의존성 목록을, Props는 PropDefinition[]을, Styles는 StyleObject를, JSX는 UINode 트리를 본다. 이들은 **독립적으로 생성 가능**하고, 나중에 하나의 파일로 조합된다.

### 왜 StyleStrategy 패턴인가

같은 UITree에서 Emotion CSS-in-JS를 출력할 수도, Tailwind CSS를 출력할 수도 있다. 차이는 **스타일을 어떤 형식으로 선언하고 JSX에 어떻게 바인딩하는가**뿐이다. Strategy 패턴으로 이 부분만 교체 가능하게 했다.

### 왜 Bundler가 필요한가

Figma 컴포넌트는 다른 컴포넌트를 INSTANCE로 참조한다 (예: Button 안의 Icon). `emit()`은 하나의 UITree만 코드로 변환하지만, 실제로는 메인 + 의존성 컴포넌트를 **단일 파일로 번들링**해야 사용자가 바로 복사-붙여넣기할 수 있다. ReactBundler가 import 통합, CSS 변수 충돌 방지, 미참조 의존성 제거를 담당한다.

---

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
- Native HTML prop 충돌 rename (UITree 복사본에서 element별 처리)
- 4개 Generator 조합으로 코드 생성
- Prettier 포맷팅 적용
- 미사용 import 필터링

#### Native Prop Rename

UITree는 플랫폼 독립 IR이므로 원본 prop 이름(`type`, `disabled` 등)을 유지한다.
ReactEmitter는 `emit()` 진입 시 UITree 복사본을 만들어 root element별 충돌 prop을 rename한다:

- `<button>`: `type` → `customType`, `disabled` → `customDisabled` 등
- `<input>`: `placeholder` → `customPlaceholder`, `value` → `customValue` 등
- `<a>`: `href` → `customHref` 등
- `<div>` (container): rename 없음

#### 코드 생성 파이프라인

```
UITree
  │
  ├── 0. renameNativeProps()                 element별 HTML prop 충돌 rename (복사본)
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
- Slot wrapper: TEXT 바인딩과 icon semanticType은 `<span>` (inline), 그 외는 `<div>` 사용
- Slot mockup SVG: wrapper 크기에 맞춤 (width/height: 100%)

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

> **위치**: `layers/tree-manager/post-processors/DynamicStyleDecomposer.ts` (Layer 2→3 순환 의존성 해결을 위해 code-emitter에서 이동됨)

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

### Slot Dependency 필터링

`emitBundled()` 호출 시, 번들링 전에 slot dependency를 제외합니다.

```
filterSlotDependencies(main, deps):
  1. main UITree의 모든 prop에서 slot 타입 → componentId 추출
  2. 해당 componentId를 가진 dependency를 제외 목록에 추가
  3. 이유: slot props는 외부에서 주입받으므로 dependency 코드 불필요
```

### ReactBundler

멀티 컴포넌트를 단일 `.tsx` 파일로 번들링합니다.

#### 번들링 파이프라인

```
Map<id, EmittedCode>  (filterSlotDependencies 적용 후)
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
        └── groupDynamicByProp.ts    # dynamic → prop별 그룹핑

※ DynamicStyleDecomposer는 tree-manager/post-processors/로 이동됨
  (Layer 2→3 순환 의존성 해결)
```
