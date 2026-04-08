# Code Emitter Semantic IR — Design

**날짜:** 2026-04-08
**상태:** Design (브레인스토밍 완료, 구현 플랜 작성 전)
**스코프:** Phase 1 (React only). SwiftUI/Compose 등 native emitter는 별도 작업.

## 1. 배경 및 문제

현재 `code-emitter` 레이어는 다음 문제를 가진다:

- **`JsxGenerator.ts`가 1452줄로 비대.** 단일 파일에 props destructuring, state 훅, derived 변수, 노드 렌더링, 조건부 분기, slot/loop 처리, 컴포넌트 map 선언이 모두 들어가 있어 유지보수가 어렵다.
- **React 종속이 깊다.** `useState` 가정, `restProps`, `React.ButtonHTMLAttributes`, JSX 문법이 generator 내부에 직접 박혀 있다. `ICodeEmitter` 인터페이스는 framework-agnostic으로 설계되었지만 (`VueEmitter`, `SvelteEmitter` 주석 존재) 실제로는 다른 프레임워크 추가가 불가능한 상태다.
- **`UITree.bindings.attrs`에 일반 속성과 이벤트가 섞여 있다.** 주석에도 "일반 속성 + 이벤트"라고 명시되어 있어 emitter가 매번 분리해야 한다.
- **`UITree.stateVars.setter` 필드는 React-specific.** Vue ref, Svelte $state 등 다른 상태 모델로 확장할 수 없다.

장기 목표는 React 외에 Vue, Svelte, **그리고 SwiftUI/Jetpack Compose 같은 native UI 프레임워크**까지 출력하는 것이다. 사용자 의도는 "시각적으로 동일" 수준의 변환이며, "근접 변환"이 아니다.

## 2. 목표 (Phase 1)

- `code-emitter` 입력을 framework-agnostic한 새 IR(`SemanticComponent`)로 분리한다.
- `JsxGenerator`를 책임별로 3-4개 모듈로 분해한다.
- 기존 React 출력과 **byte-identical**한 결과를 유지한다 (회귀 0건).
- Layer 2(`TreeManager`, Heuristic 14개, processors, post-processors)는 손대지 않는다.

### Non-Goals

- SwiftUI / Compose / Vue / Svelte emitter 실제 구현. (Phase 2+)
- `derived.expression`을 표현식 트리로 정규화. (의도적인 빚 — §10 참조)
- CSS → SwiftUI/Compose 매핑 어댑터. (Phase 2+)

## 3. 아키텍처

```
Layer 1            Layer 2                    Layer 2.5 (NEW)         Layer 3
DataManager  →  TreeManager (UITree)  →  SemanticIRBuilder  →  ICodeEmitter
                                                                     ├─ ReactEmitter  (Phase 1)
                                                                     ├─ VueEmitter    (future)
                                                                     ├─ SwiftUIEmitter (future)
                                                                     └─ ComposeEmitter (future)
```

- **Layer 2.5**가 새로 들어가는 유일한 레이어. 입력 = 기존 `UITree`, 출력 = 새 `SemanticComponent`.
- **Layer 2는 손대지 않는다.** Heuristic이 Figma 의미를 추출하는 역할에 집중하도록 유지.
- **`ICodeEmitter`의 시그니처가 바뀐다.** `emit(uiTree)` → `emit(ir)`. 모든 emitter가 동일 입력을 가진다.
- **CSS 보존 원칙.** `styles`는 CSS를 그대로 들고 다닌다. CSS → 다른 플랫폼 매핑 손실은 각 emitter 내부의 `StyleAdapter` 책임이다 (IR이 아니다).

호출 예시 (`FigmaCodeGenerator`):
```ts
// 변경 전
const result = await this.codeEmitter.emit(uiTree);

// 변경 후
const ir = SemanticIRBuilder.build(uiTree);
const result = await this.codeEmitter.emit(ir);
```

## 4. 데이터 모델

### 4.1 SemanticComponent

```ts
interface SemanticComponent {
  name: string;                      // 컴포넌트명 (PascalCase)
  props: PropDefinition[];           // UITree.props 그대로 (이미 framework-agnostic)
  state: StateDefinition[];          // setter 제거됨
  derived: DerivedDefinition[];      // Phase 1: string fallback. Phase 2+: ExpressionNode
  arraySlots?: ArraySlotInfo[];      // UITree.arraySlots 그대로 통과
  structure: SemanticNode;           // 노드 트리 (root)
  componentType?: ComponentType;
  isDependency?: boolean;
}
```

### 4.2 SemanticNode

```ts
interface SemanticNode {
  id: string;
  kind: "container" | "text" | "image" | "vector"
      | "button" | "input" | "link" | "slot" | "component";
  name?: string;

  // 7구역 분리 (각 노드)
  attrs?:   Record<string, BindingSource>;   // type, href, placeholder, value, aria-* ...
  events?:  Record<string, BindingSource>;   // onClick, onChange, onInput, onFocus ...
  styles?:  StyleObject;                     // CSS 그대로 (base/dynamic/pseudo/media/itemVariant)
  content?: BindingSource | TextSegment[];   // text/slot 노드의 내용
  visibleCondition?: ConditionNode;
  children?: SemanticNode[];

  // kind별 부가 데이터 (UITree에서 그대로 통과)
  vectorSvg?: string;
  variantSvgs?: Record<string, string>;
  refId?: string;                            // component kind
  overrideProps?: Record<string, string>;
  overrideMeta?: InstanceOverride[];
  instanceScale?: number;
  loop?: { dataProp: string; keyField?: string };
  childrenSlot?: string;
  semanticType?: string;                     // Heuristic이 판별한 세부 역할
}
```

### 4.3 StateDefinition

```ts
interface StateDefinition {
  name: string;
  initialValue: string;
  mutability: "mutable" | "computed";   // setter 필드 제거 — emitter가 알아서 useState/ref/$state
}
```

### 4.4 DerivedDefinition

```ts
interface DerivedDefinition {
  name: string;
  expression: string;   // Phase 1: JS 표현식 문자열. Phase 2+: ExpressionNode 트리.
}
```

> ⚠️ **Known Future Debt** — §10 참조.

### 4.5 EVENT_KEYS (이벤트 분리 기준)

`SemanticIRBuilder`가 한 곳에서만 사용하는 명시적 집합:

```ts
const EVENT_KEYS = new Set([
  "onClick", "onChange", "onInput", "onFocus", "onBlur",
  "onKeyDown", "onKeyUp", "onSubmit", "onMouseEnter", "onMouseLeave",
  // 필요 시 확장
]);
```

`EVENT_KEYS`에 없는 `on*` 키 (예: `onCustomThing`)는 `attrs`에 남는다 — 의도된 동작.

## 5. SemanticIRBuilder (Layer 2.5)

**위치:** `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts`

**역할:** UITree → SemanticComponent 단순 변환. 핵심 변환은 3개뿐.

### 5.1 변환 규칙

1. **`bindings.attrs` → `attrs` + `events` 분리** (`EVENT_KEYS` 기준)
2. **`StateVar` → `StateDefinition`** (`setter` 필드 제거, `mutability: "mutable"`)
3. **`UINode.type` → `SemanticNode.kind`** (값은 동일, 이름만 변경)

**나머지는 전부 reference 통과**: `props`, `styles`, `content`, `children`, `visibleCondition`, `refId`, `loop`, `vectorSvg`, `arraySlots`, `componentType`, `isDependency`.

### 5.2 Mutation 방지

`SemanticIRBuilder`는 입력 `UITree`를 mutate하지 않는다. `props`, `styles`, `bindings.style` 등은 reference로 통과되며 (얕은 복사 비용 회피), 새 객체로 감싸는 것은 `events`/`attrs` 분리된 결과와 `StateDefinition` 객체 정도다.

### 5.3 코드 골격

```ts
class SemanticIRBuilder {
  static build(uiTree: UITree): SemanticComponent {
    return {
      name: toComponentName(uiTree.root.name),
      props: uiTree.props,
      state: this.normalizeState(uiTree.stateVars),
      // FIXME(future): expression is a JS string — needs ExpressionNode IR
      //                when adding non-JS targets (SwiftUI/Compose).
      //                See spec §10 Known Future Debt.
      derived: uiTree.derivedVars ?? [],
      arraySlots: uiTree.arraySlots,
      structure: this.buildNode(uiTree.root),
      componentType: uiTree.componentType,
      isDependency: uiTree.isDependency,
    };
  }

  private static buildNode(n: UINode): SemanticNode { /* ... */ }
  private static splitAttrsAndEvents(bindings?: Record<string, BindingSource>) { /* ... */ }
  private static normalizeState(stateVars?: StateVar[]): StateDefinition[] { /* ... */ }
}
```

대략 **100-150줄** 안에 끝난다.

## 6. ReactEmitter 변경

### 6.1 시그니처 변경

```ts
// 기존
emit(uiTree: UITree): Promise<EmittedCode>
emitAll(main: UITree, deps: Map<string, UITree>): Promise<GeneratedResult>
emitBundled(main: UITree, deps: Map<string, UITree>): Promise<BundledResult>

// 변경 후
emit(ir: SemanticComponent): Promise<EmittedCode>
emitAll(main: SemanticComponent, deps: Map<string, SemanticComponent>): Promise<GeneratedResult>
emitBundled(main: SemanticComponent, deps: Map<string, SemanticComponent>): Promise<BundledResult>
```

### 6.2 JsxGenerator 분해

현재 1452줄을 책임별로 분리:

```
react/generators/
├── JsxGenerator.ts          (오케스트레이터, ~200줄)
│   ├── propsDestructuring
│   ├── stateHooks 선언 (useState)
│   ├── derivedVars 선언
│   └── NodeRenderer 호출
├── NodeRenderer.ts          (~600-800줄)
│   └── SemanticNode → JSX 재귀
├── BindingRenderer.ts       (~100줄)
│   └── BindingSource → "{props.x}" 표현식
└── ConditionRenderer.ts     (~150줄)
    └── ConditionNode → "x === \"a\"" JS 식
```

### 6.3 React-specific 로직 위치

다음은 **`ReactEmitter` 안에 그대로** 둔다 (React 외엔 의미 없음):

- `renameNativeProps` — button/input/link의 attr 충돌 해결
- `useState` 훅 선언 (`StateDefinition.mutability === "mutable"` → `useState`)
- `restProps`, `extends React.ButtonHTMLAttributes...`
- bundling 로직 (`propagateVariantOptions`, `propagateNativeRenames`)

이들은 입력으로 `SemanticComponent`를 받지만 출력은 React 종속이라 외부로 끌어낼 필요 없다.

### 6.4 거의 무변경

- `PropsGenerator` — 입력 타입만 `UITree` → `SemanticComponent`
- `StylesGenerator` — 입력 타입만 변경
- `ImportsGenerator` — 입력 타입만 변경

## 7. 마이그레이션 전략

**빅뱅 마이그레이션 (한 PR 안에서).** 호출처가 5곳뿐이고 facade(`FigmaCodeGenerator`)가 이미 잘 박혀 있어서 점진적 호환층은 YAGNI 위반이다.

### 7.1 수정 대상 (5곳)

1. `src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts:112, 126, 144` (3 호출)
2. `test/code-emitter/code-emitter.test.ts`
3. `test/code-emitter/code-emitter-review.test.ts`
4. `test/code-emitter/tailwind-strategy.test.ts`
5. `test/compiler/newPipeline.test.ts`

각 호출처는 다음 패턴으로 한 줄씩 수정:

```ts
// 변경 전
const result = await emitter.emit(uiTree);

// 변경 후
const ir = SemanticIRBuilder.build(uiTree);
const result = await emitter.emit(ir);
```

`emitAll`/`emitBundled`도 같은 방식으로 (`Map<string, UITree>` → `Map<string, SemanticComponent>`).

### 7.2 외부 영향 없음

`App.tsx`, `TestPage.tsx`, `useCompilerDebug.ts`는 `FigmaCodeGenerator`만 사용하므로 변경 불필요.

### 7.3 작업 순서 (한 PR 안에서)

1. `SemanticIR` 타입 정의 + `SemanticIRBuilder` 작성 + 단위 테스트
2. `JsxGenerator` 분해 (NodeRenderer / BindingRenderer / ConditionRenderer 추출)
3. `ReactEmitter` 시그니처 변경 + 내부 IR 기준으로 동작
4. `FigmaCodeGenerator` + 테스트 5곳 한 줄씩 수정
5. 모든 fixture 회귀 테스트 통과 확인

## 8. 테스트 전략

### 8.1 회귀 — 기존 출력 byte-identical

- 기존 4개 emitter 테스트(`code-emitter.test.ts`, `code-emitter-review.test.ts`, `tailwind-strategy.test.ts`, `newPipeline.test.ts`)는 호출 한 줄만 바뀐다.
- 출력 코드가 한 글자라도 다르면 회귀 — 원인 추적 후 IR 또는 emitter 수정 (출력 변경 금지).
- `npm run test` 전체 통과 (Heuristic 14개, post-processors 등 영향 없음 확인).
- `npm run test:browser` (Playwright 시각 회귀) 통과.

### 8.2 신규 단위 테스트

#### `SemanticIRBuilder.test.ts` (가장 중요, 30-40 케이스)

**구조 통과 검증 (모든 노드 종류)**
- 9개 `UINodeType` 각각 (`container`/`text`/`image`/`vector`/`button`/`input`/`link`/`slot`/`component`)이 `kind`로 정확히 매핑
- 각 종류별 부가 데이터 통과: `vectorSvg`, `variantSvgs`, `refId`, `overrideProps`, `overrideMeta`, `instanceScale`, `loop`, `childrenSlot`, `semanticType`

**스타일 통과 검증**
- `StyleObject.base` 통과 (값 동일, reference 동일)
- `StyleObject.dynamic` 배열 통과 + 내부 `condition`/`pseudo` 보존
- `StyleObject.pseudo` 통과
- `StyleObject.mediaQueries` 통과
- `StyleObject.itemVariant` 통과 (loop 컴포넌트)

**바인딩 통과 검증**
- `bindings.style` (CSS prop → BindingSource) 통과
- `bindings.content` 통과
- `BindingSource` 3가지 종류 (`prop`/`ref`/`expr`) 모두

**조건 통과 검증**
- `visibleCondition`의 모든 `ConditionNode` 종류 (`eq`/`neq`/`truthy`/`and`/`or`/`not`)
- 중첩 condition (and 안에 not 안에 eq) 그대로 보존

**컴포넌트 메타 통과 검증**
- `arraySlots` 통과
- `componentType` 통과
- `isDependency` 통과

**Mutation 방지 (가장 중요)**
- `SemanticIRBuilder.build(uiTree)` 호출 후 원본 `uiTree`가 변하지 않음 (`structuredClone(uiTree)` 비교)
- `props`/`styles`/`bindings.style` 등이 reference equality로 통과

**경계 조건**
- 빈 `props`/`state`/`derived`/`arraySlots`
- `bindings`가 `undefined`인 노드
- `children: []`인 컨테이너
- 깊이 5단계 이상 중첩 트리
- `bindings.attrs`만 있고 events 키가 없는 경우 (events 필드는 `undefined`)
- `bindings.attrs`에 events 키만 있고 일반 attrs가 없는 경우 (attrs 필드는 `undefined`)

**Event 분리 엣지 케이스**
- `EVENT_KEYS`에 없는 `on*` (예: `onCustomThing`) → `attrs`에 남음 (의도된 동작)
- 표준 이벤트 키 대소문자 정확성 (`onClick`이 정식)
- `onClick`이 nested component 노드에 있을 때도 분리

**State normalize 검증**
- `StateVar.setter` 필드가 `StateDefinition`에서 사라짐
- `initialValue: "false"` → `mutability: "mutable"`
- `stateVars`가 `undefined`인 경우 빈 배열

**Derived 통과**
- `derivedVars` 배열이 string `expression` 그대로 통과 (Phase 1)
- 빈/undefined 케이스

#### `BindingRenderer.test.ts`
- `{ prop: "size" }` → `"size"` (destructured)
- `{ ref: "Foo" }` → `"Foo"`
- `{ expr: "checked && !disabled" }` → `"checked && !disabled"`

#### `ConditionRenderer.test.ts`
- `{ type: "eq", prop: "size", value: "lg" }` → `"size === \"lg\""`
- `{ type: "and", conditions: [...] }` → `"(a) && (b)"`
- `not` / `or` / `truthy` 모두 커버

#### `NodeRenderer.test.ts`
- 단순 `<div>`
- `visibleCondition`이 있는 노드 → `{cond && <X />}`
- `loop`가 있는 노드 → `{items.map(...)}`
- `slot` 노드 → `{children}`

### 8.3 검증 게이트

빅뱅 마이그레이션 안전망:
1. `SemanticIRBuilder` 단위 테스트 통과
2. 기존 4개 emitter 테스트 통과 (출력 byte-identical)
3. `npm run test` 전체 통과
4. `npm run test:browser` 시각 회귀 0건

이 4개 중 하나라도 실패하면 머지 금지.

## 9. 리스크 및 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| 빅뱅 마이그레이션이 fixture 회귀 발생 | 출력 코드가 달라짐 | 회귀 게이트 (§8.3) — 한 글자라도 다르면 머지 금지. fixture 회귀 시 IR/emitter 수정, fixture 수정 금지 |
| `JsxGenerator` 분해 중 누락된 분기 | 일부 케이스 출력 깨짐 | `code-emitter.test.ts`의 fixture 4개 + browser 테스트가 1차 방어선. fixture 추가 검토 |
| `EVENT_KEYS` 집합이 불완전 | 일부 이벤트가 attrs에 잘못 남음 | 단위 테스트에서 검증 + 향후 fixture에서 발견 시 추가 |
| Mutation 발생 시 원본 UITree 손상 | Layer 2 결과 오염 (디버깅 어려움) | mutation 방지 단위 테스트 (§8.2) — `structuredClone` 비교 |
| `derived.expression` string fallback이 잊혀짐 | Phase 2에서 SwiftUI 추가 시 깜짝 발견 | §10 + 코드 FIXME 주석 + 디자인 문서 (이 문서) 3중 기록 |
| `emitBundled`의 `propagateVariantOptions` / `propagateNativeRenames`가 IR을 직접 mutate (reference 통과 때문에 원본 SemanticComponent도 변형) | bundling 전후로 동일 IR 재사용 시 부작용 | 두 함수가 mutate하는 필드(`PropDefinition.options`, `BooleanPropDefinition.extraValues`, `bindings.attrs` 키)는 ReactEmitter가 IR을 받은 직후 얕은 복사로 격리. plan 단계에서 정확한 필드 단위로 처리. |

## 10. Known Future Debt

### 10.1 `derived.expression`이 JavaScript 문자열

**현재 상태:** `DerivedDefinition.expression`은 `string` (JS 표현식). `ReactEmitter`는 본문에 그대로 삽입한다.

**왜 빚인가:** SwiftUI / Jetpack Compose 같은 non-JS 타겟을 추가할 때, 이 문자열을 파싱해서 각 언어의 AST로 변환해야 한다. 단순 삼항(`checked ? "On" : "Off"`)은 매핑 가능하지만, 복잡한 표현식 (`arr.filter(x => x.id === selected).length > 0`)은 JS 파서가 필요하다.

**갚아야 할 시점:** SwiftUI 또는 Compose emitter 작업 시작 시점.

**갚는 방법:** `ExpressionNode` 트리 IR 도입 — 예: `{ kind: "ternary", cond, then, else }`, `{ kind: "binop", op, left, right }`. `SemanticIRBuilder`가 JS 문자열을 파싱해서 트리로 변환 (또는 Heuristic 단계에서 처음부터 트리로 생성).

**기록 위치:**
1. 이 문서 (§10.1)
2. `SemanticIRBuilder.ts`의 `derived` 처리 코드 위 FIXME 주석 — `// FIXME(future): expression is a JS string — needs ExpressionNode IR when adding non-JS targets (SwiftUI/Compose). See spec §10.1.`
3. `SemanticComponent` 타입 정의 위 JSDoc 주석

### 10.2 `StateDefinition.mutability`가 항상 `"mutable"`

**현재 상태:** `SemanticIRBuilder`가 모든 `StateVar`를 `mutability: "mutable"`로 변환한다. 현재 `UITree.stateVars`는 모두 `useState` 가정이라 `computed`가 존재하지 않는다.

**왜 빚인가:** Vue/SwiftUI에 `computed`/`@StateObject` 같은 파생 상태가 자연스럽게 있고, 이를 활용하면 emit이 더 깔끔하다. 하지만 현재 Heuristic이 이를 구별해서 만들지 않으므로 IR 단에서도 구별 불가능.

**갚아야 할 시점:** Vue/SwiftUI 추가 시점, 또는 Heuristic이 computed 상태를 구별해서 emit하기 시작할 때.

### 10.3 CSS → 다른 플랫폼 매핑 어댑터 없음

**현재 상태:** `styles`는 CSS 그대로. ReactEmitter는 그대로 사용 가능.

**왜 빚인가:** SwiftUI/Compose는 CSS가 없다. 각 emitter 안에 `StyleAdapter`가 필요하다 (예: `padding: "8px 16px"` → SwiftUI `.padding(.horizontal, 16).padding(.vertical, 8)`).

**갚아야 할 시점:** SwiftUI/Compose emitter 작업 시작 시점.

**참고:** 일부 CSS 속성(예: `box-shadow` multiple, `backdrop-filter: blur(...)`, 복잡한 `clip-path`)은 native 정확 매칭이 원래 불가능하다. 이는 IR의 책임이 아닌 emitter의 best-effort 매핑 한계이며, 사전에 사용자에게 공지되어야 한다.

## 11. Phase 2+ 계획 (참고용, 비결정)

- **Phase 2a:** `ExpressionNode` IR 도입 — `derived.expression` 트리화
- **Phase 2b:** `SwiftUIEmitter` + `StyleAdapter` (CSS → SwiftUI modifier 매핑)
- **Phase 2c:** `ComposeEmitter` + `StyleAdapter` (CSS → Compose Modifier 매핑)
- **Phase 2d:** `VueEmitter` (가장 단순 — JS 기반)
- **Phase 2e:** `SvelteEmitter`

각 Phase는 별도 spec + plan.

## 12. 작업량 추정 (Phase 1)

- **신규 파일**:
  - `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR.ts` — 새 타입 정의 (`SemanticComponent`, `SemanticNode`, `StateDefinition`, `DerivedDefinition`). `BindingSource`, `ConditionNode`, `StyleObject`, `PropDefinition`, `ArraySlotInfo`, `TextSegment`, `InstanceOverride`, `ComponentType` 등은 기존 `code-generator2/types/types.ts`에서 import 재사용.
  - `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts` (~150줄)
  - `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts` (~600-800줄, JsxGenerator에서 추출)
  - `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/BindingRenderer.ts` (~100줄)
  - `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ConditionRenderer.ts` (~150줄)
  - `test/code-emitter/semantic-ir-builder.test.ts` (30-40 케이스)
  - `test/code-emitter/binding-renderer.test.ts`
  - `test/code-emitter/condition-renderer.test.ts`
  - `test/code-emitter/node-renderer.test.ts`
- **변경**: `ReactEmitter.ts` (시그니처/타입), `JsxGenerator.ts` (대폭 슬림화 → ~200줄), `FigmaCodeGenerator.ts`, 테스트 4개
- **거의 무변경**: `PropsGenerator`, `StylesGenerator`, `ImportsGenerator`, Heuristic 14개, post-processors

---

**다음 단계:** writing-plans 스킬로 구현 플랜 작성.
