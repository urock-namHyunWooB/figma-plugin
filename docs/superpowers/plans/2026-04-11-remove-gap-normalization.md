# Remove Gap Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StyleProcessor의 gap 암묵적 삭제 로직을 제거하여 Buttonsolid gap 누락을 해결하고, 디자인 실수가 diagnostics로 피드백되게 한다.

**Architecture:** `normalizeAcrossVariants` 메서드와 호출부를 제거. Button test의 기대값을 현재 디자인 데이터에 맞게 수정. Buttonsolid gap diagnostic test 정리.

**Tech Stack:** TypeScript, vitest

---

### Task 1: normalizeAcrossVariants 제거

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/StyleProcessor.ts:539-543` (호출부 + 주석)
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/StyleProcessor.ts:664-724` (메서드 본체)

- [ ] **Step 1: 호출부 제거**

line 539-543을 아래로 교체:

```typescript
    // squash prune으로 제거된 wrapper의 레이아웃 오버라이드 적용
    if (node.metadata?.layoutOverrides) {
```

삭제 대상:
- line 539: `// 전체 variant 대상 CSS 노이즈 정규화 (원본 스타일 기준)`
- line 540: `this.normalizeAcrossVariants(node.mergedNodes, variantStyles);`
- line 542-543: squash prune 주석 중 `// normalizeAcrossVariants 이후에 적용해야 원본 children 수 기반 gap 정리에 영향받지 않음`

- [ ] **Step 2: 메서드 본체 삭제**

`normalizeAcrossVariants` 메서드 전체 삭제 (line 665의 JSDoc 주석부터 line 724의 닫는 `}`까지).

- [ ] **Step 3: 기존 테스트 실행**

Run: `npx vitest run test/compiler/test-button-tw.test.ts -v`
Expected: FAIL — "gap은 size 단독으로 할당되어야 한다" 테스트가 실패 (gap에 icon 조건이 포함됨)

- [ ] **Step 4: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/StyleProcessor.ts
git commit -m "refactor: remove normalizeAcrossVariants gap deletion logic

Gap noise from designer mistakes should be surfaced via diagnostics,
not silently corrected by the pipeline."
```

---

### Task 2: Button test 기대값 수정

**Files:**
- Modify: `test/compiler/test-button-tw.test.ts:6-17`

- [ ] **Step 1: "gap은 size 단독" 테스트 수정**

현재 테스트:
```typescript
it("gap은 size 단독으로 할당되어야 한다", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any);
    const { main } = gen.buildUITree();

    const rootDynamic = (main.root as any).styles?.dynamic || [];
    const gapEntries = rootDynamic.filter((d: any) => "gap" in d.style);

    // gap이 size 단독으로 할당됨 (icon과 compound 아님)
    const hasIconCondition = gapEntries.some((d: any) =>
      JSON.stringify(d.condition).includes('"icon"')
    );
    expect(hasIconCondition).toBe(false);

    // size 조건만 있어야 함
    const hasSizeCondition = gapEntries.some((d: any) =>
      JSON.stringify(d.condition).includes('"size"')
    );
    expect(hasSizeCondition).toBe(true);
  });
```

수정 후:
```typescript
it("gap은 디자인 데이터를 정직하게 반영한다", async () => {
    const gen = new FigmaCodeGenerator(ButtonFixture as any);
    const { main } = gen.buildUITree();

    const rootDynamic = (main.root as any).styles?.dynamic || [];
    const gapEntries = rootDynamic.filter((d: any) => "gap" in d.style);

    // gap이 존재해야 함
    expect(gapEntries.length).toBeGreaterThan(0);

    // size 조건이 포함되어야 함
    const hasSizeCondition = gapEntries.some((d: any) =>
      JSON.stringify(d.condition).includes('"size"')
    );
    expect(hasSizeCondition).toBe(true);
  });
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run test/compiler/test-button-tw.test.ts -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add test/compiler/test-button-tw.test.ts
git commit -m "test: update Button gap test to reflect raw design data

Gap condition now honestly reflects design data including designer
noise in Icon=False variants, rather than expecting pre-cleaned output."
```

---

### Task 3: Buttonsolid gap test 정리

**Files:**
- Modify or Delete: `test/compiler/test-buttonsolid-gap.test.ts`

- [ ] **Step 1: diagnostic throw 테스트를 gap 존재 검증으로 교체**

현재 파일은 `throw new Error("DIAG:...")` 형태의 임시 진단 테스트. gap이 실제로 생성되는지 검증하는 테스트로 교체:

```typescript
import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid gap", () => {
  it("Content 노드에 gap이 존재해야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    // Content 노드 찾기 (root의 자식 중)
    const contentNode = (main.root as any).children?.find(
      (c: any) => c.name === "Content"
    );

    // Content 노드의 base 또는 dynamic 스타일에 gap이 있어야 함
    const baseGap = contentNode?.styles?.base?.gap;
    const dynamicGap = (contentNode?.styles?.dynamic || []).some(
      (d: any) => "gap" in d.style
    );

    expect(baseGap || dynamicGap).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run test/compiler/test-buttonsolid-gap.test.ts -v`
Expected: PASS

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: ALL PASS (기존 테스트 회귀 없음)

- [ ] **Step 4: Commit**

```bash
git add test/compiler/test-buttonsolid-gap.test.ts
git commit -m "test: add Buttonsolid Content gap existence test

Replaces diagnostic throw test with proper assertion that gap
is preserved in the generated UITree after removing gap normalization."
```
