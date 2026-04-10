# ShadcnStrategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** shadcn/ui 스타일의 React 컴포넌트 코드를 생성하는 `ShadcnStrategy`를 추가한다.

**Architecture:** CSS→Tailwind 변환 로직을 `tailwindUtils.ts`로 추출하여 TailwindStrategy와 ShadcnStrategy가 공유한다. ShadcnStrategy는 `IStyleStrategy`를 구현하며, cva + VariantProps + className + defaultVariants 패턴을 생성한다. PropsGenerator는 shadcn 전략일 때 `VariantProps` 타입 확장과 `className` prop을 추가한다.

**Tech Stack:** TypeScript, vitest, class-variance-authority

**Spec:** `docs/superpowers/specs/2026-04-10-shadcn-strategy-design.md`

---

## File Map

| 파일 | 역할 | 변경 |
|---|---|---|
| `style-strategy/tailwindUtils.ts` | 신규 — CSS→Tailwind 공유 유틸 | CSS_TO_TAILWIND, CSS_TO_PREFIX, PSEUDO_TO_PREFIX, cssPropertyToTailwind, cssObjectToTailwind 등 추출 |
| `style-strategy/TailwindStrategy.ts` | 기존 전략 | 공유 유틸 import로 전환, 내부 중복 메서드 제거 |
| `style-strategy/ShadcnStrategy.ts` | 신규 — IStyleStrategy 구현 | cva+VariantProps+cn+defaultVariants 패턴 생성 |
| `ReactEmitter.ts` | Emitter | StyleStrategyType에 "shadcn" 추가, createStyleStrategy 분기 |
| `generators/PropsGenerator.ts` | Props 인터페이스 | shadcn일 때 VariantProps + className prop 추가 |
| `types/public.ts` | 공개 타입 | StyleStrategyType에 "shadcn" 추가 |
| `App.tsx` | UI | 토글에 Shadcn 옵션 추가 |
| `test/code-emitter/shadcn-strategy.test.ts` | 테스트 | ShadcnStrategy 단위 + 통합 테스트 |

**경로 prefix:** `src/frontend/ui/domain/code-generator2/layers/code-emitter/react`

---

### Task 1: CSS→Tailwind 공유 유틸 추출

**Files:**
- Create: `src/.../style-strategy/tailwindUtils.ts`
- Modify: `src/.../style-strategy/TailwindStrategy.ts`

TailwindStrategy에서 CSS→Tailwind 변환에 필요한 순수 유틸리티를 추출한다. 이 유틸은 TailwindStrategy와 ShadcnStrategy가 공유한다.

- [ ] **Step 1: tailwindUtils.ts 생성**

TailwindStrategy에서 다음을 추출:
- `CSS_TO_TAILWIND` 매핑 테이블 (lines 16-85)
- `CSS_TO_PREFIX` 매핑 (lines 90-118)
- `PSEUDO_TO_PREFIX` 매핑 (lines 123-132)
- `cssPropertyToTailwind(property, value)` 함수 (lines 589-660 → 독립 함수로)
- `cssObjectToTailwind(style)` 함수 (lines 543-569 → 독립 함수로)
- 헬퍼: `kebabToCamel`, `camelToKebab`, `escapeArbitraryValue`, `selectorToArbitraryVariant`, `wrapClassString`, `needsQuoting`

```typescript
// tailwindUtils.ts
import type { PseudoClass } from "../../../../types/types";

export const CSS_TO_TAILWIND: Record<string, Record<string, string>> = { /* 기존 TailwindStrategy에서 복사 */ };
export const CSS_TO_PREFIX: Record<string, string> = { /* 기존 복사 */ };
export const PSEUDO_TO_PREFIX: Partial<Record<PseudoClass, string>> = { /* 기존 복사 */ };

export function cssPropertyToTailwind(property: string, value: string): string { /* 기존 private 메서드를 독립 함수로 */ }
export function cssObjectToTailwind(style: Record<string, string | number>): string[] { /* 기존 private 메서드를 독립 함수로 */ }
export function wrapClassString(str: string): string { /* 기존 복사 */ }
export function needsQuoting(key: string): boolean { /* 기존 복사 */ }
export function escapeArbitraryValue(value: string): string { /* 기존 복사 */ }
export function getDiffStyles(base: Record<string, string | number>, target: Record<string, string | number>): Record<string, string | number> { /* 기존 복사 */ }

// 내부 헬퍼
function kebabToCamel(str: string): string { /* ... */ }
function camelToKebab(str: string): string { /* ... */ }
function selectorToArbitraryVariant(selector: string): string { /* ... */ }
```

- [ ] **Step 2: TailwindStrategy를 공유 유틸 import로 전환**

TailwindStrategy.ts에서:
1. 상수 테이블(CSS_TO_TAILWIND, CSS_TO_PREFIX, PSEUDO_TO_PREFIX) 삭제, import로 교체
2. private 메서드 중 추출된 것들(cssPropertyToTailwind, cssObjectToTailwind, wrapClassString, needsQuoting, escapeArbitraryValue, getDiffStyles, kebabToCamel, camelToKebab, selectorToArbitraryVariant) 삭제, import한 함수 호출로 교체
3. TailwindStrategy 고유 메서드(generateDynamicStyleCode, generateStyle, getImports, getJsxStyleAttribute 등)는 그대로 유지

내부에서 `this.cssObjectToTailwind(...)` 호출을 `cssObjectToTailwind(...)` (import한 함수) 호출로 변경.

- [ ] **Step 3: 기존 테스트 회귀 확인**

Run: `npx vitest run test/code-emitter/ test/compiler/`
Expected: ALL PASS (리팩토링이므로 동작 변경 없음)

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/tailwindUtils.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/TailwindStrategy.ts
git commit -m "refactor: extract CSS-to-Tailwind utils for strategy sharing"
```

---

### Task 2: ShadcnStrategy 기본 구현 (base style)

**Files:**
- Create: `src/.../style-strategy/ShadcnStrategy.ts`
- Create: `test/code-emitter/shadcn-strategy.test.ts`

- [ ] **Step 1: 테스트 작성 — base style 생성**

```typescript
import { describe, it, expect } from "vitest";
import { ShadcnStrategy } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/ShadcnStrategy";

describe("ShadcnStrategy", () => {
  describe("base style generation", () => {
    it("generates cva with base Tailwind classes", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex", padding: "12px", borderRadius: "8px" },
      }, ["Root", "Button"]);
      expect(result.code).toContain("cva(");
      expect(result.code).toContain("flex");
      expect(result.code).toContain("p-[12px]");
      expect(result.code).toContain("rounded-[8px]");
      expect(result.variableName).toContain("Variants");
    });

    it("uses Variants suffix for variable names", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "button", {
        base: { display: "flex" },
      }, ["Root", "Button"]);
      expect(result.variableName).toBe("buttonVariants");
    });

    it("returns empty for no styles", () => {
      const strategy = new ShadcnStrategy();
      const result = strategy.generateStyle("n1", "empty", { base: {} });
      expect(result.isEmpty).toBe(true);
    });
  });

  describe("imports", () => {
    it("includes cva and VariantProps imports", () => {
      const strategy = new ShadcnStrategy();
      const imports = strategy.getImports();
      expect(imports.some(i => i.includes("cva"))).toBe(true);
      expect(imports.some(i => i.includes("VariantProps"))).toBe(true);
    });

    it("includes cn import", () => {
      const strategy = new ShadcnStrategy();
      const imports = strategy.getImports();
      expect(imports.some(i => i.includes("cn"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: ShadcnStrategy 기본 구현**

```typescript
// ShadcnStrategy.ts
import type { StyleObject, PseudoClass } from "../../../../types/types";
import type { IStyleStrategy, StyleResult, JsxStyleAttribute } from "./IStyleStrategy";
import { cssObjectToTailwind, wrapClassString, PSEUDO_TO_PREFIX, getDiffStyles } from "./tailwindUtils";

export interface ShadcnStrategyOptions {
  cnImportPath?: string;
}

export class ShadcnStrategy implements IStyleStrategy {
  readonly name = "shadcn";
  private readonly cnImportPath: string;
  readonly cvaVariables = new Set<string>();

  constructor(options?: ShadcnStrategyOptions) {
    this.cnImportPath = options?.cnImportPath ?? "@/lib/utils";
  }

  getImports(): string[] {
    return [
      'import { cva, type VariantProps } from "class-variance-authority";',
      `import { cn } from "${this.cnImportPath}";`,
    ];
  }

  generateStyle(
    nodeId: string,
    nodeName: string,
    style: StyleObject,
    parentPath?: string[]
  ): StyleResult {
    const variableName = this.createVariableName(nodeId, nodeName, parentPath);

    // base classes
    const baseClasses = cssObjectToTailwind(style.base);

    // pseudo classes
    const pseudoClasses: string[] = [];
    if (style.pseudo) {
      for (const [pseudo, styles] of Object.entries(style.pseudo)) {
        const prefix = PSEUDO_TO_PREFIX[pseudo as PseudoClass];
        if (!prefix) continue;
        const diffStyles = getDiffStyles(style.base, styles);
        if (Object.keys(diffStyles).length === 0) continue;
        const classes = cssObjectToTailwind(diffStyles);
        for (const cls of classes) pseudoClasses.push(`${prefix}${cls}`);
      }
    }

    const allClasses = [...baseClasses, ...pseudoClasses];
    if (allClasses.length === 0 && (!style.dynamic || style.dynamic.length === 0)) {
      return { variableName, code: "", isEmpty: true };
    }

    const baseStr = allClasses.join(" ");

    // 항상 cva()로 감싸기 (variant 없어도 — shadcn 패턴의 일관성)
    const code = `const ${variableName} = cva(${wrapClassString(baseStr)});`;
    this.cvaVariables.add(variableName);

    return { variableName, code, isEmpty: false, nodeId };
  }

  getJsxStyleAttribute(
    styleVariableName: string,
    hasConditionalStyles: boolean
  ): JsxStyleAttribute {
    if (hasConditionalStyles) {
      return {
        attributeName: "className",
        valueCode: `{cn(${styleVariableName}(), className)}`,
      };
    }
    return {
      attributeName: "className",
      valueCode: `{cn(${styleVariableName}(), className)}`,
    };
  }

  generateConditionalStyle(
    baseStyle: string,
    conditions: Array<{ condition: string; style: string }>
  ): string {
    const conditionStrs = conditions
      .map(({ condition, style }) => `  ${condition} && "${style}",`)
      .join("\n");
    return `const conditionalClasses = cn(\n${conditionStrs}\n);`;
  }

  generatePseudoStyle(
    pseudoClass: PseudoClass,
    style: Record<string, string | number>
  ): string {
    const prefix = PSEUDO_TO_PREFIX[pseudoClass] || "";
    const classes = cssObjectToTailwind(style);
    return classes.map((cls) => `${prefix}${cls}`).join(" ");
  }

  private createVariableName(
    _nodeId: string,
    nodeName: string,
    parentPath?: string[]
  ): string {
    if (parentPath && parentPath.length > 0) {
      const last = parentPath[parentPath.length - 1];
      const name = this.toCamelCase(last);
      const safeName = /^[0-9]/.test(name) ? `_${name}` : name;
      return `${safeName}Variants`;
    }
    const name = this.toCamelCase(nodeName) || "unnamed";
    return /^[0-9]/.test(name) ? `_${name}Variants` : `${name}Variants`;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).filter(Boolean)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  }
}
```

- [ ] **Step 3: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/code-emitter/shadcn-strategy.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/ShadcnStrategy.ts test/code-emitter/shadcn-strategy.test.ts
git commit -m "feat: add ShadcnStrategy with base style generation"
```

---

### Task 3: ShadcnStrategy variant + defaultVariants 지원

**Files:**
- Modify: `src/.../style-strategy/ShadcnStrategy.ts`
- Modify: `test/code-emitter/shadcn-strategy.test.ts`

- [ ] **Step 1: variant 테스트 추가**

```typescript
describe("variant styles", () => {
  it("generates cva with variants block", () => {
    const strategy = new ShadcnStrategy();
    const result = strategy.generateStyle("n1", "button", {
      base: { display: "flex", padding: "12px" },
      dynamic: [
        { condition: { type: "eq", prop: "size", value: "large" }, style: { padding: "16px" } },
        { condition: { type: "eq", prop: "size", value: "small" }, style: { padding: "8px" } },
      ],
    }, ["Root", "Button"]);
    expect(result.code).toContain("variants:");
    expect(result.code).toContain("size:");
    expect(result.code).toContain("large:");
    expect(result.code).toContain("small:");
  });

  it("generates defaultVariants block", () => {
    const strategy = new ShadcnStrategy();
    strategy.setVariantOptions(new Map([["size", ["large", "small"]]]));
    strategy.setDefaultVariants(new Map([["size", "large"]]));
    const result = strategy.generateStyle("n1", "button", {
      base: { display: "flex" },
      dynamic: [
        { condition: { type: "eq", prop: "size", value: "large" }, style: { padding: "16px" } },
        { condition: { type: "eq", prop: "size", value: "small" }, style: { padding: "8px" } },
      ],
    }, ["Root", "Button"]);
    expect(result.code).toContain("defaultVariants:");
    expect(result.code).toContain('size: "large"');
  });
});
```

- [ ] **Step 2: ShadcnStrategy에 variant/defaultVariants 로직 추가**

TailwindStrategy의 `generateDynamicStyleCode` 로직을 참고하되, ShadcnStrategy 고유의 `defaultVariants` 블록을 추가한다.

`generateStyle`의 dynamic 처리를 추가:
- `groupDynamicByProp`으로 variant 그룹핑
- cva의 `variants` 블록 생성
- `defaultVariants` 블록 생성 (prop default value 기반)
- `compoundVariants` 블록 생성 (compound prop 지원)

필드 추가:
```typescript
private variantOptions = new Map<string, string[]>();
private defaultVariantValues = new Map<string, string>();

setVariantOptions(options: Map<string, string[]>): void {
  this.variantOptions = options;
}

setDefaultVariants(defaults: Map<string, string>): void {
  this.defaultVariantValues = defaults;
}
```

- [ ] **Step 3: 테스트 실행**

Run: `npx vitest run test/code-emitter/shadcn-strategy.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/ShadcnStrategy.ts test/code-emitter/shadcn-strategy.test.ts
git commit -m "feat: add variant and defaultVariants support to ShadcnStrategy"
```

---

### Task 4: ReactEmitter + PropsGenerator에 shadcn 전략 연결

**Files:**
- Modify: `src/.../code-emitter/react/ReactEmitter.ts:55,474-482`
- Modify: `src/.../code-emitter/react/generators/PropsGenerator.ts:31-59`
- Modify: `src/.../code-generator2/types/public.ts`

- [ ] **Step 1: StyleStrategyType에 "shadcn" 추가**

`ReactEmitter.ts:55`:
```typescript
export type StyleStrategyType = "emotion" | "tailwind" | "shadcn";
```

- [ ] **Step 2: createStyleStrategy에 shadcn 분기 추가**

```typescript
private createStyleStrategy(): IStyleStrategy {
  switch (this.options.styleStrategy) {
    case "tailwind":
      return new TailwindStrategy(this.options.tailwind);
    case "shadcn":
      return new ShadcnStrategy(this.options.shadcn);
    case "emotion":
    default:
      return new EmotionStrategy(this.options.naming ? { ... } : undefined);
  }
}
```

`ReactEmitterOptions`에 `shadcn?` 추가:
```typescript
shadcn?: { cnImportPath?: string };
```

Import 추가:
```typescript
import { ShadcnStrategy } from "./style-strategy/ShadcnStrategy";
```

- [ ] **Step 3: PropsGenerator에서 shadcn용 VariantProps + className 추가**

`PropsGenerator.generate()`에 `strategyName` 파라미터 추가:

```typescript
static generate(ir: SemanticComponent, componentName: string, strategyName?: string): string {
```

shadcn일 때 추가 동작:
- props에 `className?: string` 자동 추가 (이미 없으면)
- interface에 `VariantProps<typeof xxxVariants>` extends 추가

ReactEmitter에서 PropsGenerator 호출 시 strategy name 전달:
```typescript
const propsInterface = PropsGenerator.generate(ir, componentName, this.styleStrategy.name);
```

- [ ] **Step 4: public.ts 업데이트**

`GeneratorOptions`의 `styleStrategy` 타입에 "shadcn"이 `StyleStrategyType`에 포함되므로 자동 반영.

`ShadcnOptions` 타입 추가 (필요 시):
```typescript
export interface ShadcnOptions {
  cnImportPath?: string;
}
```

- [ ] **Step 5: 통합 테스트 추가**

```typescript
describe("ReactEmitter with shadcn strategy", () => {
  it("generates shadcn-style code with cva and VariantProps", async () => {
    const dm = new DataManager(taptapButton as any);
    const tb = new TreeBuilder(dm);
    const uiTree = tb.build((taptapButton as any).info.document);
    const emitter = new ReactEmitter({ styleStrategy: "shadcn" });
    const ir = SemanticIRBuilder.build(renameNativeProps(uiTree));
    const result = await emitter.emit(ir);
    expect(result.code).toContain('import { cva, type VariantProps }');
    expect(result.code).toContain('import { cn }');
    expect(result.code).toContain("Variants");
    expect(result.code).toContain("className");
  });
});
```

- [ ] **Step 6: 테스트 실행**

Run: `npx vitest run test/code-emitter/`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/PropsGenerator.ts src/frontend/ui/domain/code-generator2/types/public.ts test/code-emitter/shadcn-strategy.test.ts
git commit -m "feat: wire ShadcnStrategy through ReactEmitter and PropsGenerator"
```

---

### Task 5: UI에 Shadcn 옵션 추가

**Files:**
- Modify: `src/frontend/ui/App.tsx`

- [ ] **Step 1: Emotion/Tailwind 토글에 Shadcn 추가**

Code 탭의 스타일 토글에 세 번째 버튼 추가:

```tsx
<div css={styleToggleStyle}>
  <button
    css={[styleButtonStyle, styleStrategy === "emotion" && styleButtonActiveStyle]}
    onClick={() => setStyleStrategy("emotion")}
  >
    Emotion
  </button>
  <button
    css={[styleButtonStyle, styleStrategy === "tailwind" && styleButtonActiveStyle]}
    onClick={() => setStyleStrategy("tailwind")}
  >
    Tailwind
  </button>
  <button
    css={[styleButtonStyle, styleStrategy === "shadcn" && styleButtonActiveStyle]}
    onClick={() => setStyleStrategy("shadcn")}
  >
    Shadcn
  </button>
</div>
```

`styleStrategy` state 타입을 `StyleStrategyType`으로 (이미 `"emotion" | "tailwind"` — `"shadcn"` 추가에 맞게).

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat(ui): add Shadcn option to style strategy toggle"
```

---

### Task 6: FigmaCodeGenerator 전파 + 전체 회귀 테스트

**Files:**
- Modify: `src/.../code-generator2/FigmaCodeGenerator.ts`

- [ ] **Step 1: FigmaCodeGenerator에서 shadcn 옵션 전달**

`styleStrategy` 파싱 로직에서 "shadcn" 처리 추가. `ReactEmitter`에 `shadcn` 옵션 전달.

- [ ] **Step 2: 전체 테스트**

Run: `npm run test`
Expected: 기존 동작과 동일 (기본값은 emotion이므로)

- [ ] **Step 3: 빌드 + tsc**

Run: `npm run build && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts
git commit -m "feat: propagate shadcn strategy through FigmaCodeGenerator"
```
