# Dependency Import Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dependency를 인라인 번들 대신 외부 import 문으로 처리하는 옵션 추가

**Architecture:** ReactBundler에 import 모드 분기 추가. App.tsx에서 Bundle/Import 토글 + base path 입력 UI. 옵션은 GeneratorOptions → ReactEmitterOptions → ReactBundler로 전달.

**Tech Stack:** React, TypeScript, Emotion CSS-in-JS, vitest

---

### Task 1: ReactBundler에 import 모드 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactBundler.ts`
- Test: `test/compiler/dependencyBundling.test.ts`

- [ ] **Step 1: 기존 테스트 통과 확인**

Run: `npx vitest run test/compiler/dependencyBundling.test.ts`
Expected: 3 tests PASS

- [ ] **Step 2: import 모드 테스트 작성**

`test/compiler/dependencyBundling.test.ts`에 추가:

```typescript
it("import 모드: dependency 코드 없이 import 문만 생성됨", async () => {
  const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
  const gen = new FigmaCodeGenerator(fixture, {
    styleStrategy: { type: "tailwind" },
    dependencyMode: "import",
    importBasePath: "@/components/",
  });
  const code = await gen.compile();

  // dependency 함수가 인라인되지 않음
  expect(code).not.toMatch(/function\s+Circularcircular\s*\(/);
  expect(code).not.toMatch(/function\s+Iconsicons\s*\(/);

  // import 문이 생성됨
  expect(code).toContain("import { Circularcircular }");
  expect(code).toContain("import { Iconsicons }");
  expect(code).toContain("@/components/");
});

it("import 모드 + 상대경로: ./ prefix로 import 생성됨", async () => {
  const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
  const gen = new FigmaCodeGenerator(fixture, {
    styleStrategy: { type: "tailwind" },
    dependencyMode: "import",
    importBasePath: "./",
  });
  const code = await gen.compile();

  expect(code).toContain("from './Circularcircular'");
  expect(code).toContain("from './Iconsicons'");
});

it("bundle 모드 (기본): 기존 동작 유지", async () => {
  const fixture = JSON.parse(fs.readFileSync(buttonsolidPath, "utf-8"));
  const gen = new FigmaCodeGenerator(fixture, {
    styleStrategy: { type: "tailwind" },
  });
  const code = await gen.compile();

  // dependency가 인라인 번들됨
  expect(code).toMatch(/function\s+Circularcircular\s*\(/);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run test/compiler/dependencyBundling.test.ts`
Expected: 새 테스트 3개 FAIL (`dependencyMode` 옵션이 아직 없음)

- [ ] **Step 4: ReactBundler 타입 + import 모드 구현**

`ReactBundler.ts` 수정:

1. 생성자 옵션에 `dependencyMode`와 `importBasePath` 추가:

```typescript
constructor(options?: {
  declarationStyle?: DeclarationStyle;
  dependencyMode?: "bundle" | "import";
  importBasePath?: string;
}) {
  this.declarationStyle = options?.declarationStyle ?? "function";
  this.dependencyMode = options?.dependencyMode ?? "bundle";
  this.importBasePath = options?.importBasePath ?? "@/components/";
}
```

2. 필드 추가:

```typescript
private readonly dependencyMode: "bundle" | "import";
private readonly importBasePath: string;
```

3. `bundle()` 메서드 시작에 import 모드 분기 추가:

```typescript
bundle(main: EmittedCode, deps: EmittedCode[]): string {
  const uniqueDeps = this.deduplicateByName(deps);
  const referencedDeps = this.filterReferencedDependencies(main, uniqueDeps);

  if (this.dependencyMode === "import") {
    return this.bundleAsImports(main, referencedDeps);
  }

  if (referencedDeps.length === 0) {
    return this.mergeExportDefault(main.code, main.componentName);
  }

  return this.bundleCode(main, referencedDeps);
}
```

4. `bundleAsImports()` 메서드 추가:

```typescript
/**
 * Import 모드: dependency를 외부 import 문으로 대체
 */
private bundleAsImports(main: EmittedCode, deps: EmittedCode[]): string {
  // main 코드에서 기존 import 추출
  const importsByKey = new Map<string, string>();
  const importMatches = main.code.matchAll(
    /^import .+ from ['""](.+)['""]/gm
  );
  for (const match of importMatches) {
    const importLine = match[0];
    const importPath = match[1];
    const isInternalComponent =
      importPath.startsWith("./") || importPath.startsWith("../");
    if (!isInternalComponent) {
      const isTypeOnly = /^import\s+type\s/.test(importLine);
      const key = `${isTypeOnly ? "type:" : ""}${importPath}`;
      importsByKey.set(key, importLine);
    }
  }

  // dependency import 문 생성
  const depImports = deps.map((dep) => {
    const basePath = this.importBasePath.endsWith("/")
      ? this.importBasePath
      : this.importBasePath + "/";
    return `import { ${dep.componentName} } from "${basePath}${dep.componentName}";`;
  });

  // main 코드에서 import 제거
  let mainCode = main.code.replace(/^import .+;?\n/gm, "");
  mainCode = this.mergeExportDefault(mainCode.trim(), main.componentName);

  // cn 함수 추출
  const cnDeclaration = this.extractCnDeclaration(mainCode);
  if (cnDeclaration) {
    mainCode = this.removeCnDeclaration(mainCode).trim();
  }

  // 조합: library imports + dep imports + cn + main
  const parts = [Array.from(importsByKey.values()).join("\n")];
  if (depImports.length > 0) {
    parts.push(depImports.join("\n"));
  }
  if (cnDeclaration) {
    parts.push("", cnDeclaration);
  }
  parts.push("", mainCode);
  return parts.join("\n");
}
```

- [ ] **Step 5: 옵션 전달 경로 연결**

옵션이 App.tsx → FigmaCodeGenerator → ReactEmitter → ReactBundler로 전달되도록 수정.

**`types/public.ts`** — `GeneratorOptions`에 필드 추가:

```typescript
export interface GeneratorOptions {
  // ... 기존 필드 ...
  /** dependency 모드: bundle (기본, 인라인) 또는 import (외부 import 문) */
  dependencyMode?: "bundle" | "import";
  /** import 모드의 경로 prefix (기본 "@/components/") */
  importBasePath?: string;
}
```

**`ReactEmitter.ts`** — `ReactEmitterOptions`에 필드 추가 + 생성자에서 ReactBundler로 전달:

```typescript
export interface ReactEmitterOptions {
  // ... 기존 필드 ...
  /** dependency 모드 */
  dependencyMode?: "bundle" | "import";
  /** import 경로 prefix */
  importBasePath?: string;
}
```

생성자:

```typescript
this.bundler = new ReactBundler({
  declarationStyle: this.options.declarationStyle,
  dependencyMode: this.options.dependencyMode,
  importBasePath: this.options.importBasePath,
});
```

**`FigmaCodeGenerator.ts`** — 생성자에서 ReactEmitter로 전달:

```typescript
this.codeEmitter = new ReactEmitter({
  // ... 기존 옵션 ...
  dependencyMode: options.dependencyMode,
  importBasePath: options.importBasePath,
});
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run test/compiler/dependencyBundling.test.ts`
Expected: 6 tests PASS (기존 3 + 새 3)

- [ ] **Step 7: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactBundler.ts \
  src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts \
  src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts \
  src/frontend/ui/domain/code-generator2/types/public.ts \
  test/compiler/dependencyBundling.test.ts
git commit -m "feat: dependency import 모드 추가 — ReactBundler 분기 + 옵션 전달 경로"
```

---

### Task 2: App.tsx UI 토글 추가

**Files:**
- Modify: `src/frontend/ui/App.tsx`

- [ ] **Step 1: 상태 추가**

기존 스타일 상태 선언 뒤에 (약 line 356 근처):

```typescript
const [dependencyMode, setDependencyMode] = useState<"bundle" | "import">("bundle");
const [importBasePath, setImportBasePath] = useState("@/components/");
```

- [ ] **Step 2: FigmaCodeGenerator에 옵션 전달**

FigmaCodeGenerator 인스턴스 생성 부분 (약 line 463-471):

```typescript
const codeGenerator = new FigmaCodeGenerator(selectionNodeData, {
  styleStrategy: { type: styleStrategy },
  declarationStyle,
  exportStyle,
  naming: {
    styleNamingStrategy,
    ...(componentNameOverride ? { componentName: componentNameOverride } : {}),
  },
  dependencyMode,
  importBasePath,
});
```

- [ ] **Step 3: Bundle/Import 토글 UI**

스타일 토글(`<div css={styleToggleStyle}>`) 뒤에 추가:

```tsx
<div css={styleToggleStyle}>
  <button
    css={[styleButtonStyle, dependencyMode === "bundle" && styleButtonActiveStyle]}
    onClick={() => setDependencyMode("bundle")}
  >
    Bundle
  </button>
  <button
    css={[styleButtonStyle, dependencyMode === "import" && styleButtonActiveStyle]}
    onClick={() => setDependencyMode("import")}
  >
    Import
  </button>
</div>
{dependencyMode === "import" && (
  <input
    type="text"
    value={importBasePath}
    onChange={(e) => setImportBasePath(e.target.value)}
    placeholder="@/components/"
    css={css`
      padding: 4px 8px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 11px;
      width: 140px;
      color: #374151;
      background: #ffffff;
      &:focus {
        outline: none;
        border-color: #00c2e0;
      }
    `}
  />
)}
```

- [ ] **Step 4: 수동 확인**

Run: `npm run dev`
브라우저에서 Figma 플러그인 UI 열고:
1. Bundle/Import 토글이 스타일 토글 옆에 표시되는지 확인
2. Import 선택 시 경로 입력란 표시되는지 확인
3. Bundle 선택 시 입력란 숨겨지는지 확인
4. Import 모드에서 코드 생성 결과에 import 문이 있는지 확인

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat: Bundle/Import 토글 UI + import 경로 입력 추가"
```

---

### Task 3: 전체 회귀 테스트

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 전부 PASS

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 최종 커밋 (필요 시)**

빌드/테스트에서 발견된 문제가 있으면 수정 후 커밋.
