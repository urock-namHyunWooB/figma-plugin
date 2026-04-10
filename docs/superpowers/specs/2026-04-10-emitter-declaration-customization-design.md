# CodeEmitter 컴포넌트 선언 방식 커스터마이징

> 시리즈: CodeEmitter 사용자 커스터마이징 (1/N)
> 날짜: 2026-04-10

## 목적

사용자가 생성되는 React 컴포넌트의 선언 형태와 export 방식을 플러그인 UI에서 선택할 수 있게 한다.

## 배경

현재 `JsxGenerator.ts:123-131`에서 컴포넌트 선언이 `function` + `export default`로 하드코딩되어 있다. 실무에서는 팀/프로젝트마다 선호하는 패턴이 다르므로, 이를 사용자가 선택할 수 있어야 한다.

## 설계

### 2축 독립 옵션

컴포넌트 선언을 2개의 독립된 축으로 분리한다:

**축 1 — `declarationStyle`**

| 값 | 출력 형태 |
|---|---|
| `"function"` (기본) | `function Button(props: ButtonProps) { ... }` |
| `"arrow"` | `const Button = (props: ButtonProps) => { ... };` |
| `"arrow-fc"` | `const Button: React.FC<ButtonProps> = (props) => { ... };` |

**축 2 — `exportStyle`**

| 값 | 출력 형태 |
|---|---|
| `"default"` (기본) | 선언 하단에 `export default Button` |
| `"inline-default"` | 선언 앞에 `export default` 결합 |
| `"named"` | 선언 앞에 `export` 결합 |

**무효 조합**: `arrow` 또는 `arrow-fc` + `inline-default` → `default`로 폴백. arrow function에는 `export default const ...` 문법이 존재하지 않는다.

### 조합 결과 전체

| declarationStyle | exportStyle | 출력 |
|---|---|---|
| `function` | `default` | `function Btn(p) { ... }` + `export default Btn` |
| `function` | `inline-default` | `export default function Btn(p) { ... }` |
| `function` | `named` | `export function Btn(p) { ... }` |
| `arrow` | `default` | `const Btn = (p) => { ... };` + `export default Btn` |
| `arrow` | `named` | `export const Btn = (p) => { ... };` |
| `arrow-fc` | `default` | `const Btn: React.FC<Props> = (p) => { ... };` + `export default Btn` |
| `arrow-fc` | `named` | `export const Btn: React.FC<Props> = (p) => { ... };` |

### 타입 정의

```typescript
export type DeclarationStyle = "function" | "arrow" | "arrow-fc";
export type ExportStyle = "default" | "inline-default" | "named";

export interface ReactEmitterOptions {
  styleStrategy?: StyleStrategyType;
  debug?: boolean;
  tailwind?: { inlineCn?: boolean; cnImportPath?: string };
  declarationStyle?: DeclarationStyle;   // 기본: "function"
  exportStyle?: ExportStyle;             // 기본: "default"
}
```

### 구현 구조

body(props destructuring, state, derived, JSX)는 선언 방식과 무관하게 동일하다. 헬퍼 함수 `wrapComponent`가 3개의 독립 조각(헤더, 푸터, export 라인)을 조합한다.

```
wrapComponent(name, propsType, body, options)
  ├─ 헤더: declarationStyle에 따라 함수/화살표/FC 시그니처
  ├─ 푸터: function → "}" / arrow → "};"
  └─ export: inline이면 헤더 앞에 결합, 아니면 별도 줄
```

분기가 조합 수(7)가 아니라 축 수(3+3)에 비례하므로 확장에 유리하다.

## 수정 대상 파일

| 파일 | 변경 내용 |
|---|---|
| `ReactEmitter.ts:57-64` | `ReactEmitterOptions`에 `declarationStyle`, `exportStyle` 추가 |
| `ReactEmitter.ts:73-78` | constructor에서 기본값 설정 |
| `JsxGenerator.ts:123-131` | 하드코딩 템플릿 → `wrapComponent` 헬퍼 호출 |
| `JsxGenerator.ts` (신규 함수) | `wrapComponent` 헬퍼 추가 |
| `ReactBundler.ts:233-260` | 의존 컴포넌트에 `declarationStyle`만 적용 (export 없음 — 파일 내부 헬퍼) |

## UI

플러그인 설정 패널에 드롭다운 2개 추가:

- **선언 방식**: function / arrow / arrow (React.FC)
- **Export**: export default / export default (inline) / named export

`inline-default` 선택 시 축 1이 arrow 계열이면 비활성화(disabled) 처리.

## 프리셋과의 관계

이 옵션은 향후 프리셋 시스템의 구성 요소가 된다. 프리셋 선택 시 이 값들이 자동 설정되고, 사용자가 개별 오버라이드할 수 있다.

## 테스트 계획

- 7가지 유효 조합 각각에 대해 생성 코드 스냅샷 테스트
- 무효 조합(`arrow` + `inline-default`) 폴백 동작 테스트
- `ReactBundler` 의존 컴포넌트에 옵션 전파 테스트
- 기존 테스트: 기본값(`function` + `default`)이므로 변경 없이 통과해야 함
