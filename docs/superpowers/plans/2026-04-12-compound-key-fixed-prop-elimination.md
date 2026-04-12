# Compound Key 고정 Prop 제거 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DynamicStyleDecomposer에서 값 종류가 1개뿐인 prop을 compound 키에서 제거하여, conditionalGroup branch 안 스타일 키 최적화.

**Architecture:** `decomposeMultiProp` Step 1(matrix 구성) 직후에 고정 prop 제거 로직 삽입. matrix entry의 propValues에서 고정 prop을 삭제하면, 이후 Step 2~5가 자연스럽게 줄어든 차원으로 동작.

**Tech Stack:** TypeScript, vitest

---

### Task 1: 실패하는 테스트 작성

**Files:**
- Modify: `test/compiler/test-buttonsolid-conditional-group.test.ts`

- [ ] **Step 1: compound 키 검증 테스트 추가**

`test/compiler/test-buttonsolid-conditional-group.test.ts`의 `"분기 안 스타일에서 iconOnly 차원이 제거된다"` 테스트를 수정하여, 생성 코드에서 `iconOnly ? (` 이후 구간의 compound 키에 `iconOnly`가 포함되지 않는지 검증:

```typescript
it("분기 안 스타일에서 iconOnly 차원이 제거된다", async () => {
  const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
  const code = await gen.compile();
  expect(code).toBeDefined();

  // iconOnly 삼항 분기가 존재해야 함
  expect(code).toContain("iconOnly ?");

  // iconOnly 삼항 분기 시작점 찾기
  const ternaryIdx = code!.indexOf("iconOnly ?");
  expect(ternaryIdx).toBeGreaterThan(-1);

  // 분기 이후 코드에서 compound 스타일 키 추출
  const afterTernary = code!.slice(ternaryIdx);

  // 분기 안 compound 키에서 iconOnly가 포함된 lookup이 없어야 함
  // 패턴: `${...iconOnly...}` 형태의 template literal이 스타일 lookup에 사용되면 안 됨
  // 단, 삼항 조건 자체인 "iconOnly ?" 는 제외
  const compoundKeyPattern = /\$\{[^}]*iconOnly[^}]*\}\+|\+\$\{[^}]*iconOnly[^}]*\}/g;
  const compoundKeysInBranch = afterTernary.match(compoundKeyPattern) || [];
  expect(compoundKeysInBranch).toHaveLength(0);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/compiler/test-buttonsolid-conditional-group.test.ts`
Expected: `"분기 안 스타일에서 iconOnly 차원이 제거된다"` 테스트 FAIL. 현재 코드는 branch 안 compound 키에 `iconOnly`를 포함하므로 `compoundKeysInBranch`가 빈 배열이 아님.

- [ ] **Step 3: 커밋**

```bash
git add test/compiler/test-buttonsolid-conditional-group.test.ts
git commit -m "test: assert compound key excludes fixed props in branch"
```

---

### Task 2: 고정 prop 제거 로직 구현

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts:448-459`

- [ ] **Step 1: Step 1과 Step 2 사이에 고정 prop 제거 로직 삽입**

`DynamicStyleDecomposer.ts`의 `decomposeMultiProp` 메서드에서, Step 1(matrix 구성, line 441-447) 직후 ~ Step 2(allProps 수집, line 449-459) 사이에 다음 코드를 삽입:

```typescript
    // Step 1.5: 값 종류가 1개뿐인 고정 prop 제거
    // branch 안에서 branchProp은 모든 entry에서 같은 값 → compound 키에 불필요
    const propDistinctValues = new Map<string, Set<string>>();
    for (const entry of matrix) {
      for (const [propName, propValue] of entry.propValues) {
        if (!propDistinctValues.has(propName)) {
          propDistinctValues.set(propName, new Set());
        }
        propDistinctValues.get(propName)!.add(propValue);
      }
    }
    for (const [propName, values] of propDistinctValues) {
      if (values.size <= 1) {
        for (const entry of matrix) {
          entry.propValues.delete(propName);
        }
      }
    }
```

기존 Step 2 코드(line 449-459)는 그대로 유지. 고정 prop이 propValues에서 삭제됐으므로 allProps에 자연스럽게 포함되지 않음.

- [ ] **Step 2: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/compiler/test-buttonsolid-conditional-group.test.ts`
Expected: 전체 4개 테스트 PASS.

- [ ] **Step 3: 전체 테스트 실행 — 회귀 없음 확인**

Run: `npx vitest run`
Expected: 기존 테스트 전부 PASS. 일반 노드에서는 모든 prop이 2종류 이상이므로 제거되는 prop 없음.

- [ ] **Step 4: 생성 코드 확인**

테스트 통과 후 `/tmp/buttonsolid-full.txt`를 확인하여 branch 안 compound 키가 실제로 줄었는지 눈으로 검증:
- 수정 전: `${variant}+${size}+${iconOnly ? "true" : "false"}+${disable ? "true" : "false"}`
- 수정 후: `iconOnly` 차원이 빠진 형태

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts
git commit -m "feat: eliminate fixed-value props from compound style keys"
```
