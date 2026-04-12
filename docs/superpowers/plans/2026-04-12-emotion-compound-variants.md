# Emotion Compound Variants 배열 패턴 전환 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emotion 생성 코드의 compound 스타일을 `"Large+true"` 문자열 concat Record에서 MUI/CVA 스타일의 `compoundVariants` 배열 + `.find()` 매칭으로 전환.

**Architecture:** EmotionStrategy.generateDynamicCode()에서 compound prop 분기를 배열 리터럴 생성으로 변경. NodeRenderer.buildDynamicStyleRef()에서 lookup 코드를 `.find()` 매칭으로 변경. 내부 IR(DecomposedResult)은 변경하지 않음.

**Tech Stack:** TypeScript, Emotion, vitest

---

### Task 1: EmotionStrategy — compound prop 배열 생성

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy.ts:169-199`

- [ ] **Step 1: generateDynamicCode() 내 compound 분기 변경**

현재 코드 (line 190-198):
```ts
} else {
    // variant/compound prop → Record 방식
    const entries = this.buildVariantEntries(valueMap);
    const varName = `${baseVarName}_${safePropName}${this.variantSuffix}`;
    if (entries.length > 0) {
      codeParts.push(`const ${varName}: Record<string, SerializedStyles> = {\n${entries.join("\n")}\n};`);
    } else {
      codeParts.push(`const ${varName}: Record<string, SerializedStyles> = {};`);
    }
}
```

변경: compound prop(`propName.includes("+")`)일 때 새로운 `buildCompoundVariantEntries()` 메서드 호출. single prop은 기존 Record 방식 유지.

```ts
} else if (propName.includes("+")) {
    // compound prop → compoundVariants 배열
    const propParts = propName.split("+").map(p => p.replace(/[\x00-\x1f\x7f]/g, ""));
    const entries = this.buildCompoundVariantEntries(propParts, valueMap);
    const varName = `${baseVarName}_${safePropName}${this.variantSuffix}`;
    if (entries.length > 0) {
      codeParts.push(`const ${varName} = [\n${entries.join("\n")}\n];`);
    } else {
      codeParts.push(`const ${varName}: Array<{ css: SerializedStyles }> = [];`);
    }
} else {
    // single variant prop → Record 방식 (기존 유지)
    const entries = this.buildVariantEntries(valueMap);
    const varName = `${baseVarName}_${safePropName}${this.variantSuffix}`;
    if (entries.length > 0) {
      codeParts.push(`const ${varName}: Record<string, SerializedStyles> = {\n${entries.join("\n")}\n};`);
    } else {
      codeParts.push(`const ${varName}: Record<string, SerializedStyles> = {};`);
    }
}
```

- [ ] **Step 2: buildCompoundVariantEntries() 메서드 추가**

EmotionStrategy 클래스에 새 private 메서드 추가 (buildVariantEntries 아래):

```ts
/**
 * compound prop에 대한 compoundVariants 배열 엔트리 생성.
 * 예: [{ size: "Large", iconOnly: true, css: css`...` }]
 */
private buildCompoundVariantEntries(
  propParts: string[],
  valueMap: Map<string, DecomposedValue>
): string[] {
  const entries: string[] = [];

  for (const [compoundValue, { style, pseudo }] of valueMap) {
    let styleStr = this.objectToStyleString(style);

    if (pseudo) {
      for (const [selector, pseudoStyle] of Object.entries(pseudo)) {
        const pStr = this.objectToStyleString(pseudoStyle as Record<string, string | number>);
        if (pStr) {
          styleStr += `\n\n&${selector} {\n${this.indent(pStr, 2)}\n}`;
        }
      }
    }

    if (!styleStr) continue;

    const values = compoundValue.split("+");
    if (values.length !== propParts.length) continue;

    const conditions = propParts.map((prop, i) => {
      const val = values[i];
      // boolean 값은 리터럴로, 문자열은 quoted
      if (val === "true" || val === "false") return `${prop}: ${val}`;
      return `${prop}: "${val}"`;
    });

    entries.push(`  { ${conditions.join(", ")}, css: css\`\n${this.indent(styleStr, 4)}\n  \` },`);
  }

  return entries;
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy.ts
git commit -m "feat: EmotionStrategy compound prop → compoundVariants 배열 생성"
```

---

### Task 2: NodeRenderer — compound lookup을 .find() 매칭으로 변경

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts:1097-1109`

- [ ] **Step 1: buildDynamicStyleRef() 내 compound 분기 변경**

현재 코드 (line 1098-1109):
```ts
if (prop.includes("+")) {
  const parts = prop.split("+");
  const safeName = parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
  const lookupParts = parts.map((p) =>
    (ctx.slotProps.has(p) || ctx.booleanProps.has(p))
      ? `\${${p} ? "true" : "false"}`
      : `\${${p}}`
  ).join("+");
  return `${styleVarName}_${safeName}Styles?.[\`${lookupParts}\`]`;
}
```

��경:
```ts
if (prop.includes("+")) {
  const parts = prop.split("+");
  const safeName = parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
  const conditions = parts.map((p) => {
    const safeProp = p.replace(/[\x00-\x1f\x7f]/g, "");
    return `v.${safeProp} === ${safeProp}`;
  });
  return `${styleVarName}_${safeName}Styles.find(v => ${conditions.join(" && ")})?.css`;
}
```

boolean prop도 별도 문자열 변환 없이 `v.iconOnly === iconOnly`로 직접 비교. EmotionStrategy에서 배열 entry에 boolean 리터럴(`true`/`false`)을 넣으므로 정확히 매칭됨.

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts
git commit -m "feat: NodeRenderer compound lookup → .find() 매칭"
```

---

### Task 3: 테스트 업데이트 — Btnsbtn compound decompose

**Files:**
- Modify: `test/compiler/test-btnsbtn-decompose.test.ts:116-125`

- [ ] **Step 1: compound 키 형태 assertion 업데이트**

현재 테스트 (line 116-125)는 `"default+filled+red"` 문자열 키를 매칭:
```ts
it("default+filled+red 배경은 compound에 있어야 한다 (base가 아님)", () => {
  const compound = code.match(/stateStyleToneStyles[^=]*=\s*\{([\s\S]*?)\n\};/);
  expect(compound).toBeTruthy();
  expect(compound![1]).toContain("default+filled+red");
  const entry = compound![1].match(/"default\+filled\+red":\s*css`([\s\S]*?)`/);
  expect(entry).toBeTruthy();
  expect(entry![1]).toMatch(/background:.*ff8484/i);
});
```

변경 — 배열 형태 매칭:
```ts
it("default+filled+red 배경은 compound�� 있어야 한다 (base가 아��)", () => {
  // compoundVariants 배열 형태: [{ state: "default", style: "filled", tone: "red", css: css`...` }]
  const compound = code.match(/stateStyleToneStyles\s*=\s*\[([\s\S]*?)\n\];/);
  expect(compound).toBeTruthy();
  // state: "default", style: "filled", tone: "red" 조건이 포함된 entry 확인
  expect(compound![1]).toMatch(/state:\s*"default".*style:\s*"filled".*tone:\s*"red"/s);
  // 해당 entry에 background가 있어야 함
  const entry = compound![1].match(/state:\s*"default".*style:\s*"filled".*tone:\s*"red".*?css:\s*css`([\s\S]*?)`/s);
  expect(entry).toBeTruthy();
  expect(entry![1]).toMatch(/background:.*ff8484/i);
});
```

- [ ] **Step 2: sizeStyles Record 매칭은 변경 불필요 확인**

`sizeStyles`는 single prop이므로 Record 형태가 유지됨. 기존 테스트(line 33-57)는 수정 불필요:
```ts
const sizeStylesMatch = code.match(/sizeStyles[^=]*=\s*\{([\s\S]*?)\n\};/);
```
→ 이 assertion은 그대로 통과해야 함.

- [ ] **Step 3: 테스트 실행**

Run: `npx vitest run test/compiler/test-btnsbtn-decompose.test.ts`
Expected: 전체 PASS

- [ ] **Step 4: Commit**

```bash
git add test/compiler/test-btnsbtn-decompose.test.ts
git commit -m "test: Btnsbtn compound assertion을 배열 패턴으로 업데이트"
```

---

### Task 4: 테스트 검증 — Buttonsolid, button fixtures

**Files:**
- Test: `test/compiler/test-buttonsolid-conditional-group.test.ts`
- Test: `test/compiler/test-buttonsolid-gap.test.ts`
- Test: `test/compiler/caseMaskVisibility.test.ts`
- Test: `test/compiler/dependencyBundling.test.ts`
- Test: `test/compiler/compiler.test.ts`
- Test: `test/compiler/styleStrategy.test.ts`

- [ ] **Step 1: Buttonsolid 관련 테스트 전체 실행**

Run: `npx vitest run test/compiler/test-buttonsolid-conditional-group.test.ts test/compiler/test-buttonsolid-gap.test.ts test/compiler/caseMaskVisibility.test.ts test/compiler/dependencyBundling.test.ts`
Expected: 전체 PASS. 이 테스트들은 compound 키 형태를 직접 assert하지 않으므로 수정 없이 통과해야 함.

- [ ] **Step 2: compiler.test.ts 및 styleStrategy.test.ts 실행**

Run: `npx vitest run test/compiler/compiler.test.ts test/compiler/styleStrategy.test.ts`
Expected: 전체 PASS.

- [ ] **Step 3: 실패 시 — snapshot diff 확인 후 의미적 검증**

스냅샷 실패가 있으면:
1. `npx vitest run <failing-test> 2>&1` 에서 diff 확인
2. 변경된 생성 코드가 Record → 배열 형태로 바뀐 것인지 확인
3. 의미적으로 올바르면 `npx vitest run -u <failing-test>`로 업데이트
4. **diff 내용을 리포트에 포함**

- [ ] **Step 4: 전체 테스트 스위트 실행**

Run: `npx vitest run`
Expected: 전체 PASS

- [ ] **Step 5: Commit (테스트 수정이 있었다면)**

```bash
git add -A test/
git commit -m "test: compound variants 배열 전환에 따른 테스트/스냅샷 업데이트"
```
