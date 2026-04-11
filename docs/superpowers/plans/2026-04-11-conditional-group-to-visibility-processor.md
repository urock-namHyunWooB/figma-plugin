# conditionalGroup을 VisibilityProcessor로 이동 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conditionalGroup 변환을 UITreeOptimizer에서 VisibilityProcessor(StyleProcessor 이전)로 옮겨 스타일 compound 키에서 고정 prop 차원을 자동 제거

**Architecture:** VisibilityProcessor가 visibleCondition 설정 후 layoutModeSwitch annotation을 소비하여 InternalTree에 CONDITIONAL_GROUP 노드 생성. StyleProcessor가 branches를 독립 순회하여 자연스럽게 최적화. UINodeConverter가 InternalNode → ConditionalGroupNode 변환.

**Tech Stack:** TypeScript, vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `types/types.ts` | Modify | InternalNode에 branchProp/branches 필드 추가 |
| `processors/VisibilityProcessor.ts` | Modify | layoutModeSwitch → CONDITIONAL_GROUP 생성 |
| `processors/StyleProcessor.ts` | Modify | branches 순회 추가 |
| `tree-builder/UINodeConverter.ts` | Modify | CONDITIONAL_GROUP → ConditionalGroupNode 변환 |
| `post-processors/UITreeOptimizer.ts` | Modify | transformLayoutModeSwitches 제거 |
| `test/compiler/test-buttonsolid-conditional-group.test.ts` | Modify | compound 키 최적화 검증 추가 |

---

### Task 1: InternalNode에 branchProp/branches 필드 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts`

- [ ] **Step 1: InternalNode 인터페이스에 필드 추가**

InternalNode 인터페이스(types.ts)에 추가:

```typescript
  /** CONDITIONAL_GROUP 전용: 분기 기준 prop 이름 */
  branchProp?: string;
  /** CONDITIONAL_GROUP 전용: prop 값 → 해당 모드의 자식들 */
  branches?: Record<string, InternalNode[]>;
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS (필드 추가만이므로 영향 없음)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add branchProp/branches to InternalNode for CONDITIONAL_GROUP"
```

---

### Task 2: VisibilityProcessor에서 conditionalGroup 생성

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/VisibilityProcessor.ts`

- [ ] **Step 1: applyVisibility()에서 layoutModeSwitch 처리 추가**

`applyVisibility()` 메서드에서, visibleCondition 재귀 적용(`applyVisibilityRecursive`) 호출 후, layoutModeSwitch annotation을 소비하는 패스를 추가:

```typescript
public applyVisibility(root: InternalNode, props: PropDefinition[]): InternalNode {
  // ... 기존 propMap 설정, rootValueDistribution ...
  
  // Alpha mask 패턴 처리
  root = this.processAlphaMasks(root, props);
  
  // 기존 visibleCondition 적용
  const result = this.applyVisibilityRecursive(root, totalVariants)!;
  
  // layoutModeSwitch → CONDITIONAL_GROUP 변환 (NEW)
  return this.transformLayoutModeSwitches(result);
}
```

- [ ] **Step 2: transformLayoutModeSwitches 구현**

UITreeOptimizer에 있던 로직을 VisibilityProcessor로 이동. InternalNode 타입에 맞게 수정:

```typescript
/**
 * layoutModeSwitch annotation이 있는 컨테이너의 조건부 자식들을
 * CONDITIONAL_GROUP InternalNode로 교체한다.
 * 
 * StyleProcessor 이전에 실행되므로, 각 branch의 노드는
 * 해당 branch의 고정 컨텍스트에서 스타일이 처리된다.
 */
private transformLayoutModeSwitches(node: InternalNode): InternalNode {
  // 재귀: 자식 먼저
  const children = node.children.map(c => this.transformLayoutModeSwitches(c));
  node = { ...node, children };
  
  // layoutModeSwitch annotation 확인
  const lms = node.metadata?.designPatterns?.find(
    (p: any) => p.type === "layoutModeSwitch"
  );
  if (!lms) return node;
  
  const { prop, branches } = lms as { prop: string; branches: Record<string, string[]> };
  
  // UITreeOptimizer에서 가져온 매칭 로직 (mergedNodes 이름 매칭 포함)
  const matchesBranchName = (child: InternalNode, branchName: string): boolean => {
    if (child.name === branchName) return true;
    if (Array.isArray(child.mergedNodes)) {
      return child.mergedNodes.some((m) => m.name === branchName);
    }
    return false;
  };
  
  const allBranchChildNames = new Set<string>();
  for (const names of Object.values(branches)) {
    for (const name of names) allBranchChildNames.add(name);
  }
  
  const childMatchesBranch = (child: InternalNode): boolean => {
    for (const name of allBranchChildNames) {
      if (matchesBranchName(child, name)) return true;
    }
    return false;
  };
  
  // 분기 대상 자식 분리
  const branchedChildren: InternalNode[] = [];
  for (const child of node.children) {
    if (childMatchesBranch(child)) {
      branchedChildren.push(child);
    }
  }
  
  if (branchedChildren.length === 0) return node;
  
  // branches 그룹핑 + 분기 prop 관련 조건 재귀 제거
  const groupedBranches: Record<string, InternalNode[]> = {};
  for (const [value, names] of Object.entries(branches)) {
    groupedBranches[value] = [];
    for (const name of names) {
      const child = branchedChildren.find(c => matchesBranchName(c, name));
      if (child) {
        this.stripPropFromTree(child, prop);
        groupedBranches[value].push(child);
      }
    }
  }
  
  // CONDITIONAL_GROUP InternalNode 생성
  const conditionalGroup: InternalNode = {
    type: "CONDITIONAL_GROUP",
    id: `${node.id}_cg`,
    name: `${prop}_switch`,
    parent: node,
    children: [],
    branchProp: prop,
    branches: groupedBranches,
  };
  
  // children 교체: 공통 자식 유지 + conditionalGroup 삽입
  const newChildren: InternalNode[] = [];
  let cgInserted = false;
  for (const child of node.children) {
    if (childMatchesBranch(child)) {
      if (!cgInserted) {
        newChildren.push(conditionalGroup);
        cgInserted = true;
      }
    } else {
      newChildren.push(child);
    }
  }
  
  return { ...node, children: newChildren };
}
```

- [ ] **Step 3: stripPropFromTree/stripPropFromCondition 구현**

UITreeOptimizer에서 이동:

```typescript
/** 노드와 하위 트리에서 특정 prop 관련 visibleCondition을 재귀 제거 */
private stripPropFromTree(node: InternalNode, propName: string): void {
  node.visibleCondition = this.stripPropFromCondition(node.visibleCondition, propName);
  for (const child of node.children ?? []) {
    this.stripPropFromTree(child, propName);
  }
}

/** ConditionNode에서 특정 prop 관련 조건만 제거 */
private stripPropFromCondition(
  condition: ConditionNode | undefined,
  propName: string,
): ConditionNode | undefined {
  if (!condition) return undefined;

  const refsProp = (c: ConditionNode): boolean => {
    if ("prop" in c && c.prop === propName) return true;
    if (c.type === "not") return refsProp(c.condition);
    if (c.type === "and") return c.conditions.some(refsProp);
    if (c.type === "or") return c.conditions.some(refsProp);
    return false;
  };

  if (!refsProp(condition)) return condition;

  if (condition.type === "and") {
    const remaining = condition.conditions.filter(c => !refsProp(c));
    if (remaining.length === 0) return undefined;
    if (remaining.length === 1) return remaining[0];
    return { type: "and", conditions: remaining };
  }

  if (condition.type === "or") {
    const remaining = condition.conditions.filter(c => !refsProp(c));
    if (remaining.length === 0) return undefined;
    if (remaining.length === 1) return remaining[0];
    return { type: "or", conditions: remaining };
  }

  return undefined;
}
```

- [ ] **Step 4: 전체 테스트 실행**

Run: `npx vitest run`
Expected: conditionalGroup이 이제 VisibilityProcessor에서 생성되므로, 기존 테스트가 통과해야 함. UITreeOptimizer의 transformLayoutModeSwitches와 중복 실행될 수 있으므로, Task 3에서 제거 후 최종 검증.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: move conditionalGroup creation to VisibilityProcessor"
```

---

### Task 3: UITreeOptimizer에서 conditionalGroup 로직 제거

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts`

- [ ] **Step 1: transformLayoutModeSwitches 호출 제거**

`optimizeMain()`과 `optimizeDependency()`에서 `this.transformLayoutModeSwitches(tree.root)` 호출 삭제.

- [ ] **Step 2: 관련 메서드 삭제**

삭제 대상:
- `transformLayoutModeSwitches()`
- `stripPropFromTree()`
- `stripPropFromCondition()`

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS — VisibilityProcessor가 동일 역할을 수행하므로

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove conditionalGroup logic from UITreeOptimizer"
```

---

### Task 4: StyleProcessor — branches 순회 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/StyleProcessor.ts`

- [ ] **Step 1: applyVariantStyles에서 branches 순회**

`applyVariantStyles()` 메서드(재귀 스타일 적용)에서 `node.branches`가 있으면 각 branch의 자식들도 처리:

```typescript
private applyVariantStyles(node: InternalNode): InternalNode {
  // ... 기존 스타일 처리 ...
  
  // children 재귀
  const children = node.children.map(c => this.applyVariantStyles(c));
  
  // branches 재귀 (CONDITIONAL_GROUP)
  let branches = node.branches;
  if (branches) {
    branches = {};
    for (const [key, branchChildren] of Object.entries(node.branches!)) {
      branches[key] = branchChildren.map(c => this.applyVariantStyles(c));
    }
  }
  
  return { ...node, children, ...(branches ? { branches } : {}) };
}
```

`applyPositionStyles`와 `normalizeVectorFills`에도 동일하게 branches 순회 추가.

- [ ] **Step 2: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS — branches 안의 노드에도 스타일이 적용됨

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: StyleProcessor traverses CONDITIONAL_GROUP branches"
```

---

### Task 5: UINodeConverter — CONDITIONAL_GROUP 변환

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/UINodeConverter.ts`

- [ ] **Step 1: UINodeConverter 읽기**

현재 UINodeConverter가 InternalNode → UINode 변환하는 방식을 확인. `convert()` 메서드에서 type별 분기가 있는지, 또는 일괄 변환인지 확인.

- [ ] **Step 2: CONDITIONAL_GROUP 처리 추가**

InternalNode.type === "CONDITIONAL_GROUP"인 경우 ConditionalGroupNode로 변환:

```typescript
if (node.type === "CONDITIONAL_GROUP" && node.branchProp && node.branches) {
  const convertedBranches: Record<string, UINode[]> = {};
  for (const [key, branchChildren] of Object.entries(node.branches)) {
    convertedBranches[key] = branchChildren.map(c => this.convertNode(c));
  }
  return {
    type: "conditionalGroup",
    id: node.id,
    name: node.name,
    prop: node.branchProp,
    branches: convertedBranches,
  } as any;
}
```

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: UINodeConverter handles CONDITIONAL_GROUP → ConditionalGroupNode"
```

---

### Task 6: 통합 테스트 — compound 키 최적화 검증

**Files:**
- Modify: `test/compiler/test-buttonsolid-conditional-group.test.ts`

- [ ] **Step 1: compound 키 차원 축소 검증 추가**

```typescript
it("분기 안 스타일에서 iconOnly 차원이 제거된다", async () => {
  const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
  const code = await gen.compile();
  expect(code).toBeDefined();
  
  // False 분기 안의 스타일 키에 iconOnly가 포함되지 않아야 함
  // Before: `${variant}+${size}+${iconOnly ? "true" : "false"}+${disable ? "true" : "false"}`
  // After:  `${variant}+${size}+${disable ? "true" : "false"}`
  
  // 삼항 분기 안에서 iconOnly 차원이 포함된 compound 키가 없어야 함
  // (삼항 밖의 루트 스타일에서는 iconOnly 참조 가능)
  const ternaryMatch = code!.match(/iconOnly \? \([\s\S]*?\) : \([\s\S]*?\)/);
  if (ternaryMatch) {
    const ternaryBlock = ternaryMatch[0];
    // 분기 안에서 iconOnly를 compound 키로 사용하는 패턴이 없어야 함
    const hasIconOnlyInCompound = /\$\{iconOnly \? "true" : "false"\}/.test(ternaryBlock);
    expect(hasIconOnlyInCompound).toBe(false);
  }
});
```

- [ ] **Step 2: 기존 테스트도 통과 확인**

Run: `npx vitest run test/compiler/test-buttonsolid-conditional-group.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 3: Commit**

```bash
git commit -m "test: add compound key optimization verification for conditionalGroup"
```

---

### Task 7: 스냅샷 업데이트 + 최종 검증

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`

- [ ] **Step 2: 스냅샷 diff 확인**

스냅샷이 깨졌으면 diff를 **수동으로** 확인:
- CONDITIONAL_GROUP 노드가 추가되었는지
- compound 키에서 iconOnly 차원이 줄었는지
- 의도하지 않은 변경이 없는지

**CLAUDE.md 규칙**: diff 내용을 반드시 확인 후에만 업데이트.

- [ ] **Step 3: 스냅샷 업데이트 (검증 후)**

Run: `npx vitest run -u`

- [ ] **Step 4: 최종 확인**

Run: `npx vitest run`
Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "test: update snapshots for conditionalGroup in VisibilityProcessor"
```
