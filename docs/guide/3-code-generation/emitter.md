# Layer 2.5 + Layer 3: SemanticIR + CodeEmitter

> 전체 파이프라인 개요는 [아키텍처 문서](../0-architecture/pipeline-overview.md)를 참조하세요.

## 이 레이어들이 하는 일

Layer 2(TreeManager)가 Figma 데이터를 분석해서 **UITree**를 만들면, Layer 2.5(`SemanticIRBuilder`)가 이를 framework-agnostic한 **`SemanticComponent`**(SemanticIR)로 정규화하고, Layer 3(`CodeEmitter`)이 이 IR을 받아 **실제 코드**로 출력한다.

UITree와 SemanticComponent의 차이는 작지만 중요하다:
- `bindings.attrs`에 섞여 있던 일반 속성과 이벤트 핸들러가 `attrs`와 `events`로 분리됨
- `StateVar.setter` 같은 React-specific 명명이 제거되고 `StateDefinition.mutability`로 정규화
- `node.type` → `node.kind`로 이름 변경 (값은 동일, IR boundary 표시)
- 7구역(`props` / `state` / `derived` / `structure` / `attrs` / `events` / `styles`)으로 평탄화

이 정규화 덕분에 React 외에 Vue, Svelte, SwiftUI, Compose 등 다른 emitter도 같은 IR을 받아 자기 framework의 형식으로 풀기만 하면 된다.

### 왜 SemanticIRBuilder를 별도 레이어로?

Layer 2(TreeManager)는 Figma 의미를 추출하는 게 본업이고, 14개 Heuristic이 그 안에서 동작한다. 여기에 framework 종속을 다루는 로직을 추가하면 Heuristic이 React를 알아야 한다.

Layer 2.5는 framework-agnostic 경계를 만든다. Heuristic은 손대지 않고 emitter 직전에 한 번만 정규화하면 되므로 폭발 반경이 작고 future emitter 추가 비용이 줄어든다.

### 왜 4개 Generator + 3개 Renderer로 분리했는가

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

각 섹션은 IR의 다른 측면을 소비한다 — `ImportsGenerator`는 외부 컴포넌트와 useState 필요 여부를, `PropsGenerator`는 `ir.props`를, `StylesGenerator`는 `structure` 트리의 styles를, `JsxGenerator`는 `ir.props/state/derived` 함수 본문 골격을 만든다. 4개는 **독립적으로 생성 가능**하고, 나중에 하나의 파일로 조합된다.

`JsxGenerator`는 한때 1452 LOC였고 그 안에 재귀 노드 렌더링, 조건식 변환, 바인딩 표현식 변환이 모두 들어 있었다. 이를 **3개의 순수 모듈**로 분리했다:

- **`NodeRenderer`** (~1250 LOC) — `SemanticNode` → JSX 재귀. 모든 노드 종류별 렌더 + slot/loop/조건부.
- **`BindingRenderer`** (~20 LOC, pure) — `BindingSource` → JS 표현식 (`{prop:"x"}` → `"x"` 등).
- **`ConditionRenderer`** (~50 LOC, pure) — `ConditionNode` → JS 조건식 (`eq/neq/and/or/not/truthy`).

`JsxGenerator`는 이제 함수 본문 골격(props destructuring, useState 선언, derived 변수)만 만들고 JSX 본문은 `NodeRenderer`에 위임하는 ~215 LOC 오케스트레이터다. 분리 후 단위 테스트가 쉬워졌고, 새 emitter 추가 시 `BindingRenderer`/`ConditionRenderer`는 React 종속이 거의 없어 그대로 재사용 가능하다.

### 왜 StyleStrategy 패턴인가

같은 SemanticComponent에서 Emotion CSS-in-JS를 출력할 수도, Tailwind CSS를 출력할 수도 있다. 차이는 **스타일을 어떤 형식으로 선언하고 JSX에 어떻게 바인딩하는가**뿐이다. Strategy 패턴으로 이 부분만 교체 가능하게 했다.

CSS 자체는 `StyleObject`에 그대로 보존되고 (가장 표현력이 풍부), platform 특화 매핑(SwiftUI modifier, Compose Modifier 등)은 미래 각 emitter 내부의 `StyleAdapter`가 책임진다 — IR이 아니라.

### 왜 Bundler가 필요한가

Figma 컴포넌트는 다른 컴포넌트를 INSTANCE로 참조한다 (예: Button 안의 Icon). `emit()`은 하나의 SemanticComponent만 코드로 변환하지만, 실제로는 메인 + 의존성 컴포넌트를 **단일 파일로 번들링**해야 사용자가 바로 복사-붙여넣기할 수 있다. ReactBundler가 import 통합, CSS 변수 충돌 방지, 미참조 의존성 제거를 담당한다.

---

### SemanticIR 타입 (Layer 2.5 출력)

```typescript
// Top-level component IR
interface SemanticComponent {
  name: string;
  props: PropDefinition[];           // UITree.props 그대로
  state: StateDefinition[];          // setter 제거됨
  derived: DerivedDefinition[];      // expression은 JS string fallback (Known Debt)
  arraySlots?: ArraySlotInfo[];
  structure: SemanticNode;           // 노드 트리
  componentType?: ComponentType;
  isDependency?: boolean;
}

// 노드 (모든 platform이 동일한 입력)
interface SemanticNode {
  id: string;
  kind: "container" | "text" | "image" | "vector"
      | "button" | "input" | "link" | "slot" | "component";
  name?: string;

  attrs?:   Record<string, BindingSource>;   // type, href, placeholder, value, aria-* ...
  events?:  Record<string, BindingSource>;   // onClick, onChange, onInput, onFocus ...
  styles?:  StyleObject;                     // CSS 그대로 (base/dynamic/pseudo/media/itemVariant)
  styleBindings?: Record<string, BindingSource>;  // 동적 인라인 스타일
  content?: BindingSource | TextSegment[];
  textContent?: BindingSource;               // CSS-보존 텍스트 치환
  visibleCondition?: ConditionNode;
  children?: SemanticNode[];

  // kind-specific (passed through)
  vectorSvg?: string;
  refId?: string;
  loop?: { dataProp: string; keyField?: string };
  // ...
}

interface StateDefinition {
  name: string;
  initialValue: string;
  mutability: "mutable" | "computed";   // emitter가 useState/ref/$state 알아서 생성
}
```

### ICodeEmitter 인터페이스

```typescript
interface ICodeEmitter {
  readonly framework: string;

  /** 단일 SemanticComponent → 코드 */
  emit(ir: SemanticComponent): Promise<EmittedCode>;

  /** 메인 + 의존성 → 개별 코드 */
  emitAll(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<GeneratedResult>;

  /** 메인 + 의존성 → 단일 파일 */
  emitBundled(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<BundledResult>;
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

`FigmaCodeGenerator`가 `treeManager.build()`로 UITree를 받은 후 `SemanticIRBuilder.build(renameNativeProps(uiTree))`를 호출해서 IR을 만들고 emitter에 전달한다.

### ReactEmitter

#### 책임

- SemanticComponent를 React TypeScript 코드로 변환
- 4개 Generator 조합으로 코드 생성
- Prettier 포맷팅 적용
- 미사용 import 필터링
- Bundling 시 dependency 격리 (`propagateVariantOptions`/`propagateNativeRenames`이 IR을 mutate하지 않도록 shallow clone)

#### Native Prop Rename

SemanticComponent는 framework-agnostic IR이므로 원본 prop 이름(`type`, `disabled` 등)을 유지한다.
`renameNativeProps`는 `react/ReactEmitter.ts`에 export된 free function으로, `FigmaCodeGenerator`가
`SemanticIRBuilder.build()` **이전에** UITree에 대해 호출한다 (rename된 UITree를 IR로 변환).
root element가 native tag일 때 충돌 prop을 rename한다:

- `<button>`: `type` → `customType`, `disabled` → `customDisabled` 등
- `<input>`: `placeholder` → `customPlaceholder`, `value` → `customValue` 등
- `<a>`: `href` → `customHref` 등
- `<div>` (container): rename 없음

**nativeAttribute 플래그**: PropBase에 `nativeAttribute?: boolean` 필드가 존재한다. 이 플래그가 `true`인 prop은 의도적으로 native HTML attribute와 동일한 이름을 사용하는 것이므로, `renameNativeProps()`에서 rename을 스킵한다. 예: InputHeuristic의 `transformPlaceholderProp()`이 생성한 `placeholder`, `value`, `onChange` prop은 `<input>` 태그의 native attribute로 직접 사용되어야 하므로 `nativeAttribute: true`로 설정된다.

**책임 분리**: native HTML prop 충돌 rename은 React-specific하므로 `react/` 폴더 안에 산다. Layer 2의 StyleProcessor는 `normalizePropName()`으로 prop 이름 정규화만 하고 rename 로직(`isNativePropConflict`)은 포함하지 않는다. Vue/Svelte/SwiftUI emitter는 자기 충돌 규칙을 자체적으로 갖는다.

#### 코드 생성 파이프라인

```
UITree (Layer 2 출력)
  │
  ├── (FigmaCodeGenerator)
  │     renameNativeProps(uiTree)            element별 HTML prop 충돌 rename
  │     SemanticIRBuilder.build(renamed)     framework-agnostic IR 생성
  │     ↓
SemanticComponent
  │
  ├── (ReactEmitter.emit)
  │
  ├── 1. ir.name                             컴포넌트 이름
  │
  ├── 2. generateAllSections(ir)             4개 섹션 병렬 생성
  │      ├── ImportsGenerator.generate(ir)        → import 문
  │      │   (ir.state.length → useState import,
  │      │    ir.structure walk → component imports)
  │      ├── PropsGenerator.generate(ir)          → interface Props { ... }
  │      ├── StylesGenerator.generate(ir, ...)    → const css / className 선언
  │      │   (ir.structure walk + nodeStyleMap 반환)
  │      └── JsxGenerator.generate(ir, ...)       → function Component() { return (...) }
  │           ├── propsDestructuring (ir.props 기반)
  │           ├── useState 선언 (ir.state, setterFor() 헬퍼)
  │           ├── derivedVars 선언 (ir.derived)
  │           └── NodeRenderer.generateNode(ctx, ir.structure)
  │                 ├── BindingRenderer.toExpression(BindingSource)
  │                 └── ConditionRenderer.toJs(ConditionNode)
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

- `useState`은 `ir.state.length > 0`일 때만 포함
- 스타일 전략별 import 추가
- 외부 컴포넌트 (`node.kind === "component"`) import 수집

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

#### JsxGenerator (~215 LOC, 오케스트레이터)

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

`JsxGenerator`는 함수 본문 골격만 만들고 JSX 본문은 `NodeRenderer`에 위임한다:

- Props 구조 분해 + 기본값 (`ir.props` 기반)
- `useState` 선언 (`ir.state`, `setterFor(name)` 헬퍼로 setter 이름 생성)
- 파생 변수 선언 (`ir.derived`)
- `NodeRendererContext` 생성 후 `NodeRenderer.generateNode(ctx, ir.structure, ...)` 호출
- 컴포넌트 함수 + export 조합

#### NodeRenderer (~1250 LOC)

`SemanticNode` → JSX 재귀 변환. `NodeRendererContext`로 공유 상태(slotProps, booleanProps, nodeStyleMap, arraySlots 등)를 받아 동작한다.

주요 기능:
- 노드 종류별 (kind) 렌더 분기 (text/component/vector/container/button/input/link)
- 조건부 렌더링: `{isOpen && (<div>...</div>)}` (`ConditionRenderer.toJs` 활용)
- 슬롯 바인딩: `{slotProp && (<div css={styles}>{slotProp}</div>)}`
  - **예외**: `node.attrs`에 placeholder가 설정된 노드는 slot으로 렌더링하지 않고 `<input>` 태그로 렌더링
- 배열 슬롯: `{items.map((item, index) => <Item key={index} {...item} />)}`
- `generateInputElement()`: search-input 및 placeholder semanticType 노드를 `<input>` 태그로 렌더링
- SVG → JSX 변환 (kebab-case → camelCase, class → className)
- 텍스트 세그먼트 스타일 분리, `\n` → `<br />`
- Slot wrapper: TEXT 바인딩과 icon semanticType은 `<span>` (inline), 그 외는 `<div>` 사용
- Slot mockup SVG: wrapper 크기에 맞춤 (width/height: 100%)
- `node.attrs`와 `node.events`를 attribute 생성 시 합쳐서 처리 (React는 둘 다 JSX 속성)

#### BindingRenderer (~20 LOC, pure)

`BindingSource` 유니온을 JS 표현식 문자열로 변환하는 순수 함수.

```typescript
BindingRenderer.toExpression({ prop: "size" })          // → "size"
BindingRenderer.toExpression({ ref: "Constants.MAX" })  // → "Constants.MAX"
BindingRenderer.toExpression({ expr: "checked && !x" }) // → "checked && !x"
```

#### ConditionRenderer (~50 LOC, pure)

`ConditionNode` 트리를 JS 조건식으로 변환하는 순수 함수. 6개 variant 모두 지원 (`eq`/`neq`/`truthy`/`not`/`and`/`or`). `resolveProp` 콜백으로 prop rename 매핑 처리 (`size` → `customSize` 등).

```typescript
ConditionRenderer.toJs({ type: "eq", prop: "size", value: "lg" })
// → 'size === "lg"'

ConditionRenderer.toJs({
  type: "and",
  conditions: [
    { type: "not", condition: { type: "truthy", prop: "disabled" } },
    { type: "eq", prop: "state", value: "Hover" },
  ],
})
// → '(!(disabled)) && (state === "Hover")'
```

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
├── SemanticIR.ts                    # Layer 2.5 타입 (SemanticComponent, SemanticNode 등)
├── SemanticIRBuilder.ts             # Layer 2.5: UITree → SemanticComponent 변환
├── ICodeEmitter.ts                  # emit(ir: SemanticComponent) 인터페이스
├── index.ts
│
└── react/
    ├── ReactEmitter.ts              # ICodeEmitter 구현 (renameNativeProps free function 포함)
    ├── ReactBundler.ts              # 멀티 컴포넌트 번들링
    │
    ├── generators/
    │   ├── index.ts
    │   ├── ImportsGenerator.ts      # import 문 생성 (ir 소비)
    │   ├── PropsGenerator.ts        # Props interface 생성 (ir 소비)
    │   ├── StylesGenerator.ts       # 스타일 선언 생성 (ir.structure walk)
    │   ├── JsxGenerator.ts          # 함수 본문 오케스트레이터 (~215 LOC)
    │   ├── NodeRenderer.ts          # SemanticNode → JSX 재귀 (~1250 LOC)
    │   ├── BindingRenderer.ts       # BindingSource → JS 표현식 (pure)
    │   └── ConditionRenderer.ts     # ConditionNode → JS 조건식 (pure)
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

## Known Future Debt

### `derived.expression`이 JS 문자열

`DerivedDefinition.expression`은 현재 JS 표현식 문자열이다 (`"checked ? \"On\" : \"Off\""` 등).
React는 본문에 그대로 삽입하면 동작하지만, SwiftUI/Compose 같은 non-JS 타겟은 이 문자열을
파싱해서 각 언어의 AST로 변환해야 한다. 단순 삼항은 매핑 가능하지만 복잡한 표현식
(`arr.filter(x => x.id === selected).length > 0` 등)은 JS 파서가 필요하다.

**갚는 시점:** SwiftUI 또는 Compose emitter 작업 시작 시점.

**갚는 방법:** `ExpressionNode` 트리 IR 도입 (`{ kind: "ternary", cond, then, else }` 등).

기록 위치: 이 문서, `SemanticIR.ts`의 JSDoc, `SemanticIRBuilder.ts`의 FIXME 주석 (3중 기록).
