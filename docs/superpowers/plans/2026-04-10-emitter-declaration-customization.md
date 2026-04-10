# CodeEmitter 컴포넌트 선언 방식 커스터마이징 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 React 컴포넌트 선언 형태(function/arrow/arrow-fc)와 export 방식(default/inline-default/named)을 선택할 수 있게 한다.

**Architecture:** `ReactEmitterOptions`에 `declarationStyle`과 `exportStyle` 2개 축을 추가하고, `JsxGenerator`의 하드코딩 템플릿을 `wrapComponent` 헬퍼로 교체한다. `ReactBundler`의 dependency 변환도 옵션을 따르게 한다. 옵션은 `GeneratorOptions` → `ReactEmitter` → `JsxGenerator`로 전파된다.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-04-10-emitter-declaration-customization-design.md`

---

## File Map

| 파일 | 역할 | 변경 |
|---|---|---|
| `src/.../code-emitter/react/ReactEmitter.ts` | Emitter 옵션 정의 + 파이프라인 | 타입 추가, constructor 기본값, JsxGenerator 호출에 옵션 전달 |
| `src/.../code-emitter/react/generators/JsxGenerator.ts` | 컴포넌트 코드 조립 | `wrapComponent` 헬퍼 추가, `generate()` 템플릿 교체 |
| `src/.../code-emitter/react/ReactBundler.ts` | 번들링 시 dep 변환 | `convertToArrowFunction` → 옵션 기반 변환 |
| `src/.../code-generator2/types/public.ts` | 공개 옵션 타입 | `declarationStyle`, `exportStyle` 추가 |
| `src/.../code-generator2/FigmaCodeGenerator.ts` | 옵션 전파 진입점 | 새 옵션을 ReactEmitter에 전달 |
| `test/code-emitter/declaration-style.test.ts` | 신규 테스트 | 7가지 유효 조합 + 무효 조합 폴백 테스트 |

**경로 prefix:** `src/frontend/ui/domain/code-generator2/layers`

**범위 참고:** 이 플랜은 코드 생성 엔진(백엔드) 변경만 다룬다. 플러그인 UI에 드롭다운 2개를 추가하는 작업은 별도 플랜으로 분리한다.

---

### Task 1: wrapComponent 헬퍼 테스트 작성

**Files:**
- Create: `test/code-emitter/declaration-style.test.ts`

- [ ] **Step 1: 테스트 파일 생성 — 7가지 유효 조합 + 무효 조합 폴백**

```typescript
import { describe, it, expect } from "vitest";
import { wrapComponent, type DeclarationStyle, type ExportStyle } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator";

const sampleBody = `  const { size, ...restProps } = props;

  return (
    <button {...restProps}>{size}</button>
  );`;

describe("wrapComponent", () => {
  it("function + default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "function",
      exportStyle: "default",
    });
    expect(result).toContain("function Button(props: ButtonProps) {");
    expect(result).toContain("export default Button");
    expect(result).not.toContain("export default function");
    expect(result).not.toContain("=>");
  });

  it("function + inline-default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "function",
      exportStyle: "inline-default",
    });
    expect(result).toContain("export default function Button(props: ButtonProps) {");
    expect(result).not.toMatch(/\nexport default Button/);
  });

  it("function + named", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "function",
      exportStyle: "named",
    });
    expect(result).toContain("export function Button(props: ButtonProps) {");
    expect(result).not.toContain("export default");
  });

  it("arrow + default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow",
      exportStyle: "default",
    });
    expect(result).toContain("const Button = (props: ButtonProps) => {");
    expect(result).toContain("export default Button");
    expect(result).toMatch(/\};/); // arrow ends with };
  });

  it("arrow + named", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow",
      exportStyle: "named",
    });
    expect(result).toContain("export const Button = (props: ButtonProps) => {");
    expect(result).not.toContain("export default");
  });

  it("arrow-fc + default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow-fc",
      exportStyle: "default",
    });
    expect(result).toContain("const Button: React.FC<ButtonProps> = (props) => {");
    expect(result).toContain("export default Button");
  });

  it("arrow-fc + named", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow-fc",
      exportStyle: "named",
    });
    expect(result).toContain("export const Button: React.FC<ButtonProps> = (props) => {");
    expect(result).not.toContain("export default");
  });

  it("arrow + inline-default → fallback to default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow",
      exportStyle: "inline-default",
    });
    // inline-default는 arrow에서 불가 → default로 폴백
    expect(result).toContain("const Button = (props: ButtonProps) => {");
    expect(result).toContain("export default Button");
  });

  it("arrow-fc + inline-default → fallback to default", () => {
    const result = wrapComponent("Button", "ButtonProps", sampleBody, {
      declarationStyle: "arrow-fc",
      exportStyle: "inline-default",
    });
    expect(result).toContain("const Button: React.FC<ButtonProps> = (props) => {");
    expect(result).toContain("export default Button");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/code-emitter/declaration-style.test.ts`
Expected: FAIL — `wrapComponent` 및 타입이 아직 존재하지 않음

- [ ] **Step 3: Commit**

```bash
git add test/code-emitter/declaration-style.test.ts
git commit -m "test: add declaration style combination tests (red)"
```

---

### Task 2: 타입 정의 + wrapComponent 헬퍼 구현

**Files:**
- Modify: `src/.../code-emitter/react/generators/JsxGenerator.ts:1-16` (import 영역 + 타입 추가)
- Modify: `src/.../code-emitter/react/generators/JsxGenerator.ts:122-131` (generate 메서드 템플릿 교체)

- [ ] **Step 1: JsxGenerator.ts에 타입과 wrapComponent 함수 추가**

파일 상단 (`setterFor` 함수 앞)에 타입 정의와 헬퍼 함수를 추가:

```typescript
export type DeclarationStyle = "function" | "arrow" | "arrow-fc";
export type ExportStyle = "default" | "inline-default" | "named";

export interface ComponentWrapOptions {
  declarationStyle: DeclarationStyle;
  exportStyle: ExportStyle;
}

/**
 * 컴포넌트 body를 선언 형태 + export 방식으로 감싸기
 *
 * body는 선언 방식과 무관 (props destructuring, hooks, return JSX).
 * 이 함수가 헤더/푸터/export 라인을 조합한다.
 */
export function wrapComponent(
  name: string,
  propsType: string,
  body: string,
  options: ComponentWrapOptions
): string {
  const { declarationStyle } = options;
  // arrow 계열에서 inline-default는 불가 → default로 폴백
  const exportStyle =
    declarationStyle !== "function" && options.exportStyle === "inline-default"
      ? "default"
      : options.exportStyle;

  // export prefix: inline이면 선언 앞에 결합
  const exportPrefix =
    exportStyle === "inline-default"
      ? "export default "
      : exportStyle === "named"
        ? "export "
        : "";

  // 선언 헤더 + 푸터
  let header: string;
  let footer: string;
  switch (declarationStyle) {
    case "function":
      header = `${exportPrefix}function ${name}(props: ${propsType}) {`;
      footer = "}";
      break;
    case "arrow":
      header = `${exportPrefix}const ${name} = (props: ${propsType}) => {`;
      footer = "};";
      break;
    case "arrow-fc":
      header = `${exportPrefix}const ${name}: React.FC<${propsType}> = (props) => {`;
      footer = "};";
      break;
  }

  // 별도 export 라인 (default일 때만)
  const exportLine = exportStyle === "default" ? `\n\nexport default ${name}` : "";

  return `${header}\n${body}\n${footer}${exportLine}`;
}
```

- [ ] **Step 2: JsxGenerator.generate()에서 wrapComponent 사용**

`JsxGeneratorOptions` 인터페이스에 옵션 추가 (기존 `debug`, `nodeStyleMap`, `_restPropsOnInput` 뒤에):

```typescript
interface JsxGeneratorOptions {
  debug?: boolean;
  nodeStyleMap?: Map<string, string>;
  _restPropsOnInput?: boolean;
  declarationStyle?: DeclarationStyle;
  exportStyle?: ExportStyle;
}
```

`generate()` 메서드의 기존 하드코딩 템플릿 (123-131행):

```typescript
    const code = `function ${componentName}(props: ${componentName}Props) {
  const ${propsDestructuring} = props;
${stateVarsCode}${derivedVarsCode}${componentMapCode}
  return (
${jsxBody}
  );
}

export default ${componentName}`;
```

이것을 다음으로 교체:

```typescript
    const body = `  const ${propsDestructuring} = props;
${stateVarsCode}${derivedVarsCode}${componentMapCode}
  return (
${jsxBody}
  );`;

    const code = wrapComponent(componentName, `${componentName}Props`, body, {
      declarationStyle: options.declarationStyle ?? "function",
      exportStyle: options.exportStyle ?? "default",
    });
```

- [ ] **Step 3: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/code-emitter/declaration-style.test.ts`
Expected: 9 tests PASS

- [ ] **Step 4: 기존 테스트 깨지지 않았는지 확인**

Run: `npx vitest run test/code-emitter/`
Expected: 기존 `code-emitter.test.ts` 포함 전체 PASS (기본값이 `function` + `default`이므로)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts
git commit -m "feat: add wrapComponent helper for declaration style customization"
```

---

### Task 3: ReactEmitterOptions에 새 옵션 추가 + JsxGenerator로 전파

**Files:**
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:57-64` (ReactEmitterOptions)
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:73-78` (constructor)
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:369-372` (JsxGenerator.generate 호출)

- [ ] **Step 1: ReactEmitterOptions 확장**

`ReactEmitter.ts:54` 근처, 기존 `StyleStrategyType` 뒤에 import 추가:

```typescript
import { type DeclarationStyle, type ExportStyle } from "./generators/JsxGenerator";
```

`ReactEmitterOptions` (57행)에 필드 추가:

```typescript
export interface ReactEmitterOptions {
  styleStrategy?: StyleStrategyType;
  debug?: boolean;
  tailwind?: { inlineCn?: boolean; cnImportPath?: string };
  declarationStyle?: DeclarationStyle;
  exportStyle?: ExportStyle;
}
```

- [ ] **Step 2: constructor에서 기본값 설정**

`ReactEmitter.ts:73-78` constructor 내부:

```typescript
constructor(options: ReactEmitterOptions = {}) {
  this.options = {
    styleStrategy: options.styleStrategy ?? "emotion",
    debug: options.debug ?? false,
    tailwind: options.tailwind,
    declarationStyle: options.declarationStyle ?? "function",
    exportStyle: options.exportStyle ?? "default",
  };
  // ...
}
```

`options` 타입도 업데이트:

```typescript
private readonly options: ReactEmitterOptions & {
  styleStrategy: StyleStrategyType;
  debug: boolean;
  declarationStyle: DeclarationStyle;
  exportStyle: ExportStyle;
};
```

- [ ] **Step 3: JsxGenerator.generate 호출에 옵션 전달**

`ReactEmitter.ts:369-372` (generateAllSections 내부):

```typescript
const jsxResult = JsxGenerator.generate(ir, componentName, this.styleStrategy, {
  debug: this.options.debug,
  nodeStyleMap: stylesResult.nodeStyleMap,
  declarationStyle: this.options.declarationStyle,
  exportStyle: this.options.exportStyle,
});
```

- [ ] **Step 4: 통합 테스트 작성 — ReactEmitter를 통한 옵션 전파 확인**

`test/code-emitter/declaration-style.test.ts`에 추가:

```typescript
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { ReactEmitter, renameNativeProps } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";

describe("ReactEmitter declaration options", () => {
  async function emitWith(declarationStyle: DeclarationStyle, exportStyle: ExportStyle) {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter({ declarationStyle, exportStyle });
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    return emitter.emit(ir);
  }

  it("arrow + named generates export const arrow", async () => {
    const result = await emitWith("arrow", "named");
    expect(result.code).toContain("export const Primary = (props: PrimaryProps) =>");
    expect(result.code).not.toContain("export default");
  });

  it("function + inline-default generates export default function", async () => {
    const result = await emitWith("function", "inline-default");
    expect(result.code).toContain("export default function Primary(props: PrimaryProps)");
    expect(result.code).not.toMatch(/\nexport default Primary/);
  });

  it("arrow-fc + default generates React.FC with separate export", async () => {
    const result = await emitWith("arrow-fc", "default");
    expect(result.code).toContain("React.FC<PrimaryProps>");
    expect(result.code).toContain("export default Primary");
  });

  it("default options (no args) produce function + export default", async () => {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter();
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    const result = await emitter.emit(ir);
    expect(result.code).toContain("function Primary(props: PrimaryProps)");
    expect(result.code).toContain("export default Primary");
  });
});
```

- [ ] **Step 5: 테스트 실행**

Run: `npx vitest run test/code-emitter/declaration-style.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts test/code-emitter/declaration-style.test.ts
git commit -m "feat: wire declaration/export options through ReactEmitter to JsxGenerator"
```

---

### Task 4: GeneratorOptions 공개 타입에 옵션 추가 + FigmaCodeGenerator 전파

**Files:**
- Modify: `src/.../code-generator2/types/public.ts:60-67`
- Modify: `src/.../code-generator2/FigmaCodeGenerator.ts:105-109`

- [ ] **Step 1: public.ts에 타입 추가**

```typescript
import type { DeclarationStyle, ExportStyle } from "../layers/code-emitter/react/generators/JsxGenerator";

export type { DeclarationStyle, ExportStyle };

export interface GeneratorOptions {
  styleStrategy?:
    | StyleStrategyType
    | { type: StyleStrategyType; tailwind?: TailwindOptions };
  debug?: boolean;
  declarationStyle?: DeclarationStyle;
  exportStyle?: ExportStyle;
}
```

- [ ] **Step 2: FigmaCodeGenerator에서 새 옵션 전달**

`FigmaCodeGenerator.ts:105-109`:

```typescript
this.codeEmitter = new ReactEmitter({
  styleStrategy,
  debug: options.debug ?? false,
  tailwind: tailwindOptions,
  declarationStyle: options.declarationStyle,
  exportStyle: options.exportStyle,
});
```

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run test/code-emitter/`
Expected: 전체 PASS

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/types/public.ts src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts
git commit -m "feat: expose declarationStyle/exportStyle in public GeneratorOptions"
```

---

### Task 5: ReactBundler dependency 변환을 옵션 기반으로 수정

**Files:**
- Modify: `src/.../code-emitter/react/ReactBundler.ts:233-261` (convertToArrowFunction)
- Modify: `src/.../code-emitter/react/ReactBundler.ts:111` (convertToArrowFunction 호출부)
- Modify: `src/.../code-emitter/react/ReactBundler.ts:15` (constructor/옵션)
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:81` (ReactBundler 생성)

현재 `ReactBundler.convertToArrowFunction`은 dependency를 항상 `React.FC` arrow로 변환한다. 이를 사용자가 선택한 `declarationStyle`을 따르도록 변경한다. dependency는 파일 내부 헬퍼이므로 `exportStyle`은 적용하지 않는다.

- [ ] **Step 1: ReactBundler에 declarationStyle 옵션 추가**

```typescript
import { type DeclarationStyle } from "./generators/JsxGenerator";

export class ReactBundler {
  private readonly declarationStyle: DeclarationStyle;

  constructor(options?: { declarationStyle?: DeclarationStyle }) {
    this.declarationStyle = options?.declarationStyle ?? "function";
  }
  // ...
}
```

- [ ] **Step 2: convertToArrowFunction을 convertDeclarationStyle로 리네임 + 로직 변경**

기존 `convertToArrowFunction` (233-261행)을 교체:

```typescript
/**
 * dependency 코드의 선언 형태를 사용자 옵션에 맞춤.
 * dependency는 파일 내부 헬퍼이므로 export를 제거한다.
 */
private convertDeclarationStyle(code: string, componentName: string): string {
  // 먼저 export 관련 키워드 제거 (dependency는 export 불필요)
  code = code.replace(/^export default \w+;?\s*$/gm, "");
  code = code.replace(/^export default\s+/gm, "");
  code = code.replace(/^export\s+(function|const)\s/gm, "$1 ");

  switch (this.declarationStyle) {
    case "arrow":
      return this.toArrowFunction(code, componentName, false);
    case "arrow-fc":
      return this.toArrowFunction(code, componentName, true);
    case "function":
    default:
      // function 선언 그대로 유지 (export만 제거됨)
      return code;
  }
}

private toArrowFunction(code: string, componentName: string, withFc: boolean): string {
  const funcRegex = new RegExp(
    `function\\s+${componentName}\\s*\\(([^)]*)\\)\\s*\\{`
  );
  const match = code.match(funcRegex);
  if (!match) return code; // 이미 arrow거나 매칭 안 됨

  const params = match[1];
  const typeAnnotation = withFc
    ? `const ${componentName}: React.FC<${componentName}Props> = (${params}) => {`
    : `const ${componentName} = (${params}) => {`;

  code = code.replace(funcRegex, typeAnnotation);
  code = this.replaceLastClosingBrace(code, componentName);
  return code;
}
```

- [ ] **Step 3: bundleCode에서 호출 변경**

`ReactBundler.ts:111` 기존:

```typescript
code = this.convertToArrowFunction(code, dep.componentName);
```

변경:

```typescript
code = this.convertDeclarationStyle(code, dep.componentName);
```

- [ ] **Step 4: ReactEmitter에서 ReactBundler에 옵션 전달**

`ReactEmitter.ts:81` 기존:

```typescript
this.bundler = new ReactBundler();
```

변경:

```typescript
this.bundler = new ReactBundler({ declarationStyle: this.options.declarationStyle });
```

- [ ] **Step 5: bundleCode에서 중복 export 제거 로직 정리**

기존 `bundleCode` (112행):

```typescript
code = code.replace(/^export default \w+;?\s*$/gm, "");
code = code.replace(/^export (interface \w+Props)/gm, "$1");
```

`convertDeclarationStyle`이 이미 export를 제거하므로, 첫 줄 제거 (interface export 제거는 유지):

```typescript
code = this.convertDeclarationStyle(code, dep.componentName);
code = code.replace(/^export (interface \w+Props)/gm, "$1");
```

- [ ] **Step 6: 번들 테스트 추가**

`test/code-emitter/declaration-style.test.ts`에 추가:

```typescript
describe("ReactEmitter bundled declaration options", () => {
  async function emitBundledWith(declarationStyle: DeclarationStyle, exportStyle: ExportStyle) {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const { main, dependencies } = tb.buildAll((taptapButton as any).info.document);
    const emitter = new ReactEmitter({ declarationStyle, exportStyle });
    const mainIR = SemanticIRBuilder.build(renameNativeProps(main));
    const depIRs = new Map<string, any>();
    for (const [id, dep] of dependencies) {
      depIRs.set(id, SemanticIRBuilder.build(renameNativeProps(dep)));
    }
    return emitter.emitBundled(mainIR, depIRs);
  }

  it("bundled output uses function for deps when declarationStyle=function", async () => {
    const result = await emitBundledWith("function", "default");
    // main은 export default function, deps는 function (export 없음)
    expect(result.code).toContain("export default function");
  });

  it("bundled output uses arrow for deps when declarationStyle=arrow", async () => {
    const result = await emitBundledWith("arrow", "named");
    // deps가 arrow 형태여야 함
    expect(result.code).not.toContain("React.FC");
    expect(result.code).toContain("=>");
  });
});
```

- [ ] **Step 7: 전체 테스트 실행**

Run: `npx vitest run test/code-emitter/`
Expected: 전체 PASS

- [ ] **Step 8: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactBundler.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts test/code-emitter/declaration-style.test.ts
git commit -m "feat: apply declarationStyle to bundled dependency components"
```

---

### Task 6: 전체 기존 테스트 회귀 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm run test`
Expected: 기존 테스트 전부 PASS. 기본값이 `function` + `default`이므로 기존 동작과 동일해야 한다.

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 완료

- [ ] **Step 3: tsc 체크**

Run: `npx tsc --noEmit`
Expected: 타입 에러 0

- [ ] **Step 4: Commit (필요 시)**

회귀가 있었으면 수정 후 커밋. 없으면 스킵.
