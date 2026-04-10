# 네이밍 규칙 커스터마이징 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 코드 생성의 네이밍 규칙(컴포넌트명 prefix/suffix, 충돌 prop prefix, 스타일 변수 suffix, 스타일 네이밍 전략)을 커스터마이징할 수 있게 한다.

**Architecture:** `NamingOptions` 타입을 `GeneratorOptions`에 정의하여 프레임워크 공통 진입점으로 만들고, `ReactEmitter`가 constructor에서 받아 `EmotionStrategy`, `StylesGenerator`, `renameNativeProps`, `emit()`에 분배한다.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-04-10-naming-customization-design.md`

---

## File Map

| 파일 | 역할 | 변경 |
|---|---|---|
| `src/.../types/public.ts` | 공개 타입 | `NamingOptions` 타입 추가, `GeneratorOptions.naming` 필드 |
| `src/.../code-emitter/react/ReactEmitter.ts` | Emitter 옵션 + 파이프라인 | naming 수신, EmotionStrategy/renameNativeProps에 전달, emit()에서 컴포넌트명 변환 |
| `src/.../code-emitter/react/style-strategy/EmotionStrategy.ts` | 스타일 변수명 생성 | constructor에서 suffix/전략 수신, createPathBasedName/createIdBasedName 분기 |
| `src/.../code-emitter/react/generators/StylesGenerator.ts` | 변수명 고유성 | minimal 전략 인덱스 생성 지원 |
| `src/.../code-generator2/FigmaCodeGenerator.ts` | 옵션 전파 진입점 | `options.naming` → ReactEmitter |
| `src/frontend/ui/App.tsx` | UI | Code 탭에 네이밍 전략 드롭다운 + 텍스트 입력 |
| `test/code-emitter/naming-options.test.ts` | 테스트 | 네이밍 옵션 조합 테스트 |

**경로 prefix:** `src/frontend/ui/domain/code-generator2/layers`

**범위:** 코드 생성 엔진 + UI. TailwindStrategy는 이 플랜 범위 외 (Emotion만 우선).

---

### Task 1: NamingOptions 타입 정의 + GeneratorOptions 확장

**Files:**
- Modify: `src/.../types/public.ts:63-74`

- [ ] **Step 1: NamingOptions 타입과 GeneratorOptions.naming 추가**

`public.ts` 상단 import 영역 뒤, `TailwindOptions` 앞에 추가:

```typescript
export type StyleNamingStrategy = "verbose" | "compact" | "minimal";

export interface NamingOptions {
  /** 컴포넌트명 prefix (기본: "") */
  componentPrefix?: string;
  /** 컴포넌트명 suffix (기본: "") */
  componentSuffix?: string;
  /** native prop 충돌 시 prefix (기본: "custom") */
  conflictPropPrefix?: string;
  /** 스타일 기본 변수 suffix (기본: "Css") */
  styleBaseSuffix?: string;
  /** 스타일 variant 변수 suffix (기본: "Styles") */
  styleVariantSuffix?: string;
  /** 스타일 변수 네이밍 전략 (기본: "verbose") */
  styleNamingStrategy?: StyleNamingStrategy;
}
```

`GeneratorOptions`에 필드 추가:

```typescript
export interface GeneratorOptions {
  styleStrategy?:
    | StyleStrategyType
    | { type: StyleStrategyType; tailwind?: TailwindOptions };
  debug?: boolean;
  declarationStyle?: DeclarationStyle;
  exportStyle?: ExportStyle;
  /** 네이밍 규칙 옵션 */
  naming?: NamingOptions;
}
```

- [ ] **Step 2: 전체 테스트 실행 — 기존 테스트 깨지지 않는지 확인**

Run: `npx vitest run test/code-emitter/`
Expected: ALL PASS (optional 필드 추가이므로)

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/types/public.ts
git commit -m "feat: add NamingOptions type to GeneratorOptions"
```

---

### Task 2: EmotionStrategy에 suffix + 네이밍 전략 옵션 주입

**Files:**
- Modify: `src/.../code-emitter/react/style-strategy/EmotionStrategy.ts:29-30` (constructor)
- Modify: `src/.../code-emitter/react/style-strategy/EmotionStrategy.ts:378-391` (createPathBasedName)
- Modify: `src/.../code-emitter/react/style-strategy/EmotionStrategy.ts:415-423` (createIdBasedName)
- Modify: `src/.../code-emitter/react/style-strategy/EmotionStrategy.ts:174` (variant suffix)
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:480` (EmotionStrategy 생성)
- Create: `test/code-emitter/naming-options.test.ts`

- [ ] **Step 1: 테스트 작성 — suffix + 네이밍 전략**

```typescript
import { describe, it, expect } from "vitest";
import { EmotionStrategy } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy";

describe("EmotionStrategy naming options", () => {
  describe("styleBaseSuffix", () => {
    it("uses custom base suffix", () => {
      const strategy = new EmotionStrategy({
        styleBaseSuffix: "Style",
      });
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
      }, ["Root", "Container", "Button"]);
      expect(result.variableName).toContain("Style");
      expect(result.variableName).not.toContain("Css");
    });

    it("defaults to Css when no option", () => {
      const strategy = new EmotionStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
      }, ["Root", "Container", "Button"]);
      expect(result.variableName).toContain("Css");
    });
  });

  describe("styleNamingStrategy", () => {
    it("verbose: uses last 3 path nodes", () => {
      const strategy = new EmotionStrategy({ styleNamingStrategy: "verbose" });
      const result = strategy.generateStyle("n1", "mask", {
        base: { display: "flex" },
      }, ["Root", "Button", "Wrapper", "Mask"]);
      // verbose = 마지막 3개 노드: Button, Wrapper, Mask
      expect(result.variableName).toBe("buttonWrapperMaskCss");
    });

    it("compact: uses last node only", () => {
      const strategy = new EmotionStrategy({ styleNamingStrategy: "compact" });
      const result = strategy.generateStyle("n1", "mask", {
        base: { display: "flex" },
      }, ["Root", "Button", "Wrapper", "Mask"]);
      expect(result.variableName).toBe("maskCss");
    });

    it("minimal: uses index-based name", () => {
      const strategy = new EmotionStrategy({ styleNamingStrategy: "minimal" });
      const r1 = strategy.generateStyle("n1", "mask", {
        base: { display: "flex" },
      }, ["Root", "Mask"]);
      const r2 = strategy.generateStyle("n2", "label", {
        base: { color: "red" },
      }, ["Root", "Label"]);
      expect(r1.variableName).toBe("s1");
      expect(r2.variableName).toBe("s2");
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/code-emitter/naming-options.test.ts`
Expected: FAIL — EmotionStrategy constructor가 옵션을 받지 않음

- [ ] **Step 3: EmotionStrategy에 옵션 추가**

`EmotionStrategy.ts` 상단에 옵션 인터페이스 추가:

```typescript
import type { StyleNamingStrategy } from "../../../../types/public";

export interface EmotionStrategyOptions {
  styleBaseSuffix?: string;
  styleVariantSuffix?: string;
  styleNamingStrategy?: StyleNamingStrategy;
}
```

constructor와 필드 추가:

```typescript
export class EmotionStrategy implements IStyleStrategy {
  readonly name = "emotion";

  private readonly baseSuffix: string;
  private readonly variantSuffix: string;
  private readonly namingStrategy: StyleNamingStrategy;
  private minimalCounter = 0;

  constructor(options?: EmotionStrategyOptions) {
    this.baseSuffix = options?.styleBaseSuffix ?? "Css";
    this.variantSuffix = options?.styleVariantSuffix ?? "Styles";
    this.namingStrategy = options?.styleNamingStrategy ?? "verbose";
  }
```

- [ ] **Step 4: createPathBasedName에 전략 분기 + suffix 적용**

기존 `createPathBasedName` (line 378-391) 교체:

```typescript
  private createPathBasedName(parentPath: string[]): string {
    switch (this.namingStrategy) {
      case "minimal": {
        this.minimalCounter++;
        return `s${this.minimalCounter}`;
      }
      case "compact": {
        const lastNode = parentPath[parentPath.length - 1];
        let name = this.extractLastWord(lastNode);
        if (/^[0-9]/.test(name)) name = "_" + name;
        return `${name}${this.baseSuffix}`;
      }
      case "verbose":
      default: {
        const lastThreeNodes = parentPath.slice(-3);
        const lastWords = lastThreeNodes.map((name) => this.extractLastWord(name));
        let combinedName = this.combinePathToCamelCase(lastWords);
        if (/^[0-9]/.test(combinedName)) combinedName = "_" + combinedName;
        return `${combinedName}${this.baseSuffix}`;
      }
    }
  }
```

- [ ] **Step 5: createIdBasedName에 suffix 적용**

기존 `createIdBasedName` (line 415-423) — `Css` 하드코딩을 교체:

```typescript
  private createIdBasedName(_nodeId: string, nodeName: string): string {
    if (this.namingStrategy === "minimal") {
      this.minimalCounter++;
      return `s${this.minimalCounter}`;
    }
    let nameBase = this.toSafeVariableName(nodeName);
    if (/^[0-9]/.test(nameBase)) nameBase = "_" + nameBase;
    return `${nameBase}${this.baseSuffix}`;
  }
```

- [ ] **Step 6: variant suffix 적용**

`EmotionStrategy.ts` line 174 — `Styles` 하드코딩 교체:

```typescript
// 기존: const varName = `${baseVarName}_${safePropName}Styles`;
const varName = `${baseVarName}_${safePropName}${this.variantSuffix}`;
```

- [ ] **Step 7: ReactEmitter에서 EmotionStrategy에 옵션 전달**

`ReactEmitter.ts:474-481` — `createStyleStrategy()`:

```typescript
  private createStyleStrategy(): IStyleStrategy {
    switch (this.options.styleStrategy) {
      case "tailwind":
        return new TailwindStrategy(this.options.tailwind);
      case "emotion":
      default:
        return new EmotionStrategy(this.options.naming ? {
          styleBaseSuffix: this.options.naming.styleBaseSuffix,
          styleVariantSuffix: this.options.naming.styleVariantSuffix,
          styleNamingStrategy: this.options.naming.styleNamingStrategy,
        } : undefined);
    }
  }
```

`ReactEmitterOptions`에 naming 추가:

```typescript
export interface ReactEmitterOptions {
  styleStrategy?: StyleStrategyType;
  debug?: boolean;
  tailwind?: { inlineCn?: boolean; cnImportPath?: string };
  declarationStyle?: DeclarationStyle;
  exportStyle?: ExportStyle;
  naming?: NamingOptions;
}
```

Import 추가:

```typescript
import type { NamingOptions } from "../../../types/public";
```

- [ ] **Step 8: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/code-emitter/naming-options.test.ts`
Expected: ALL PASS

- [ ] **Step 9: 기존 테스트 회귀 확인**

Run: `npx vitest run test/code-emitter/`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts test/code-emitter/naming-options.test.ts
git commit -m "feat: add style naming strategy and suffix customization to EmotionStrategy"
```

---

### Task 3: renameNativeProps 충돌 prop prefix 커스터마이징

**Files:**
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:516-542` (renameNativeProps)
- Modify: `test/code-emitter/naming-options.test.ts`

- [ ] **Step 1: 테스트 추가**

`test/code-emitter/naming-options.test.ts`에 추가:

```typescript
import { renameNativeProps } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";

describe("renameNativeProps conflictPropPrefix", () => {
  const makeTree = (propName: string) => ({
    root: { type: "button", children: [] },
    props: [{ name: propName, type: "variant", sourceKey: propName, defaultValue: "submit" }],
    name: "Btn",
  });

  it("uses 'custom' prefix by default", () => {
    const result = renameNativeProps(makeTree("type") as any);
    expect(result.props[0].name).toBe("customType");
  });

  it("uses custom prefix when provided", () => {
    const result = renameNativeProps(makeTree("type") as any, "fig");
    expect(result.props[0].name).toBe("figType");
  });

  it("uses custom prefix 'ds'", () => {
    const result = renameNativeProps(makeTree("type") as any, "ds");
    expect(result.props[0].name).toBe("dsType");
  });

  it("does not rename when no conflict", () => {
    const result = renameNativeProps(makeTree("size") as any, "fig");
    expect(result.props[0].name).toBe("size");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/code-emitter/naming-options.test.ts`
Expected: FAIL — `renameNativeProps`가 두 번째 인수를 받지 않음

- [ ] **Step 3: renameNativeProps에 prefix 파라미터 추가**

`ReactEmitter.ts:516` — 함수 시그니처 변경:

```typescript
export function renameNativeProps(uiTree: UITree, conflictPrefix = "custom"): UITree {
```

Line 525 — `"custom"` 하드코딩 → 파라미터 사용:

```typescript
// 기존: renameMap.set(prop.name, "custom" + prop.name.charAt(0).toUpperCase() + prop.name.slice(1));
renameMap.set(prop.name, conflictPrefix + prop.name.charAt(0).toUpperCase() + prop.name.slice(1));
```

- [ ] **Step 4: FigmaCodeGenerator에서 prefix 전달**

`FigmaCodeGenerator.ts` — `renameNativeProps` 호출부 전부에 prefix 전달:

```typescript
const conflictPrefix = this.namingOptions?.conflictPropPrefix ?? "custom";

// emit 경로에서:
const mainIR = SemanticIRBuilder.build(renameNativeProps(main, conflictPrefix));
// dep 경로에서:
depIRs.set(id, SemanticIRBuilder.build(renameNativeProps(dep, conflictPrefix)));
```

`FigmaCodeGenerator` constructor에 naming 저장:

```typescript
private readonly namingOptions?: NamingOptions;

constructor(spec: FigmaNodeData, options: GeneratorOptions = {}) {
  // ... 기존 코드 ...
  this.namingOptions = options.naming;
  // ...
}
```

`FigmaCodeGenerator.ts`에서 ReactEmitter 생성 시 naming 전달:

```typescript
this.codeEmitter = new ReactEmitter({
  styleStrategy,
  debug: options.debug ?? false,
  tailwind: tailwindOptions,
  declarationStyle: options.declarationStyle,
  exportStyle: options.exportStyle,
  naming: options.naming,
});
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/code-emitter/naming-options.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts test/code-emitter/naming-options.test.ts
git commit -m "feat: customizable conflict prop prefix in renameNativeProps"
```

---

### Task 4: 컴포넌트명 prefix/suffix 적용

**Files:**
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:103-104` (emit 메서드)
- Modify: `test/code-emitter/naming-options.test.ts`

- [ ] **Step 1: 테스트 추가**

```typescript
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { ReactEmitter, renameNativeProps } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
import taptapButton from "../fixtures/button/taptapButton.json";

describe("component name prefix/suffix", () => {
  async function emitWithNaming(naming: NamingOptions) {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter({ naming });
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    return emitter.emit(ir);
  }

  it("adds suffix to component name", async () => {
    const result = await emitWithNaming({ componentSuffix: "Component" });
    expect(result.componentName).toBe("PrimaryComponent");
    expect(result.code).toContain("PrimaryComponentProps");
    expect(result.code).toContain("function PrimaryComponent(");
  });

  it("adds prefix to component name", async () => {
    const result = await emitWithNaming({ componentPrefix: "UI" });
    expect(result.componentName).toBe("UIPrimary");
    expect(result.code).toContain("UIPrimaryProps");
  });

  it("no prefix/suffix by default", async () => {
    const result = await emitWithNaming({});
    expect(result.componentName).toBe("Primary");
  });
});
```

Import `NamingOptions`:

```typescript
import type { NamingOptions } from "@frontend/ui/domain/code-generator2/types/public";
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/code-emitter/naming-options.test.ts`
Expected: FAIL

- [ ] **Step 3: emit()에서 컴포넌트명에 prefix/suffix 적용**

`ReactEmitter.ts:103-104` 변경:

```typescript
  async emit(ir: SemanticComponent): Promise<EmittedCode> {
    const prefix = this.options.naming?.componentPrefix ?? "";
    const suffix = this.options.naming?.componentSuffix ?? "";
    const componentName = `${prefix}${ir.name}${suffix}`;
    const sections = this.generateAllSections(ir, componentName);
    const code = await this.assembleAndFormat(sections);

    return {
      code,
      componentName,
      fileExtension: ".tsx",
      diagnostics: sections.diagnostics,
    };
  }
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/code-emitter/naming-options.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `npx vitest run test/code-emitter/`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts test/code-emitter/naming-options.test.ts
git commit -m "feat: component name prefix/suffix via NamingOptions"
```

---

### Task 5: StylesGenerator minimal 전략 지원

**Files:**
- Modify: `src/.../code-emitter/react/generators/StylesGenerator.ts:298-302`

현재 `StylesGenerator.replaceVariableName`의 variant suffix regex가 `Styles` 하드코딩이다. 커스텀 suffix에도 대응해야 한다.

- [ ] **Step 1: replaceVariableName의 하드코딩 suffix 수정**

`StylesGenerator.ts:273-274` — `Styles` → 일반 패턴으로:

```typescript
// 기존: new RegExp(`\\b${escaped}(_\\w+Styles)\\b`, "g")
// variant suffix가 커스텀 가능하므로 _xxx 패턴 전체를 매칭
code = code.replace(
  new RegExp(`\\b${escaped}(_\\w+(?:Styles|True|False))\\b`, "g"),
  `${newName}$1`
);
```

이 변경은 기존 `_xxxStyles` + `_xxxTrue/False` 패턴을 하나의 regex로 통합한다. 기존 line 278-283의 boolean 전용 치환도 이 regex에 포함되므로 제거 가능하지만, 안전하게 유지해도 무방하다.

실제로는 variant suffix가 `Styles`가 아닐 수 있으므로 더 일반적인 패턴이 필요하다:

```typescript
// 모든 _xxx 접미 패턴 매칭 (variant suffix가 무엇이든)
code = code.replace(
  new RegExp(`\\b${escaped}(_\\w+)\\b`, "g"),
  `${newName}$1`
);

// 그 다음 base 변수명 치환
code = code.replace(
  new RegExp(`\\b${escaped}\\b`, "g"),
  newName
);
```

단, 이렇게 하면 순서가 중요하다. `_xxx` 접미 패턴을 먼저 치환하고, base를 나중에 치환해야 한다 (현재 순서와 동일).

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run test/code-emitter/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/StylesGenerator.ts
git commit -m "feat: generalize StylesGenerator variable name replacement for custom suffixes"
```

---

### Task 6: UI — Code 탭에 네이밍 옵션 추가

**Files:**
- Modify: `src/frontend/ui/App.tsx`

- [ ] **Step 1: state 추가**

기존 `declarationStyle`/`exportStyle` state 아래에:

```typescript
const [styleNamingStrategy, setStyleNamingStrategy] = useState<StyleNamingStrategy>("verbose");
const [conflictPropPrefix, setConflictPropPrefix] = useState("custom");
const [componentPrefix, setComponentPrefix] = useState("");
const [componentSuffix, setComponentSuffix] = useState("");
const [styleBaseSuffix, setStyleBaseSuffix] = useState("Css");
const [styleVariantSuffix, setStyleVariantSuffix] = useState("Styles");
```

Import 추가:

```typescript
import FigmaCodeGenerator, { ..., type NamingOptions, type StyleNamingStrategy } from "@code-generator2";
```

- [ ] **Step 2: FigmaCodeGenerator에 naming 전달**

`new FigmaCodeGenerator(selectionNodeData, { ... })` 호출부 전부에:

```typescript
naming: {
  componentPrefix,
  componentSuffix,
  conflictPropPrefix,
  styleBaseSuffix,
  styleVariantSuffix,
  styleNamingStrategy,
},
```

useEffect 의존성 배열에 6개 state 추가.

- [ ] **Step 3: Code 탭 옵션 바에 UI 추가**

기존 `codeOptionsBarStyle` div 안에 네이밍 전략 드롭다운 추가:

```tsx
<select
  css={optionSelectStyle}
  value={styleNamingStrategy}
  onChange={(e) => setStyleNamingStrategy(e.target.value as StyleNamingStrategy)}
>
  <option value="verbose">Verbose</option>
  <option value="compact">Compact</option>
  <option value="minimal">Minimal</option>
</select>
```

세부 설정 (suffix/prefix) 은 두 번째 행으로 추가:

```tsx
<div css={codeOptionsBarStyle}>
  <input
    css={optionInputStyle}
    value={conflictPropPrefix}
    onChange={(e) => setConflictPropPrefix(e.target.value)}
    placeholder="conflict prefix"
    title="충돌 prop prefix"
  />
  <input
    css={optionInputStyle}
    value={componentPrefix}
    onChange={(e) => setComponentPrefix(e.target.value)}
    placeholder="comp prefix"
    title="컴포넌트 prefix"
  />
  <input
    css={optionInputStyle}
    value={componentSuffix}
    onChange={(e) => setComponentSuffix(e.target.value)}
    placeholder="comp suffix"
    title="컴포넌트 suffix"
  />
  <input
    css={optionInputStyle}
    value={styleBaseSuffix}
    onChange={(e) => {
      if (e.target.value === styleVariantSuffix) return; // 충돌 방지
      setStyleBaseSuffix(e.target.value);
    }}
    placeholder="style suffix"
    title="스타일 변수 suffix"
  />
  <input
    css={optionInputStyle}
    value={styleVariantSuffix}
    onChange={(e) => {
      if (e.target.value === styleBaseSuffix) return; // 충돌 방지
      setStyleVariantSuffix(e.target.value);
    }}
    placeholder="variant suffix"
    title="variant 변수 suffix"
  />
</div>
```

- [ ] **Step 4: optionInputStyle 추가**

```typescript
const optionInputStyle = css`
  padding: 4px 6px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: #ffffff;
  color: #374151;
  width: 100px;
  outline: none;
  &:focus { border-color: #00c2e0; }
  &::placeholder { color: #9ca3af; }
`;
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat(ui): add naming options to Code tab"
```

---

### Task 7: 전체 회귀 테스트

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm run test`
Expected: 기본값 유지이므로 기존 동작과 동일

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 빌드 완료

- [ ] **Step 3: tsc 체크**

Run: `npx tsc --noEmit`
Expected: 타입 에러 0

- [ ] **Step 4: Commit (필요 시)**

회귀가 있었으면 수정 후 커밋. 없으면 스킵.
