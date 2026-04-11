# Hoist Shared Child Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 자식이 동일한 visibleCondition을 공유하면, 그 조건을 부모로 끌어올리고 자식에서 제거하여 빈 wrapper div 렌더링을 방지한다.

**Architecture:** UITreeOptimizer에 `hoistSharedChildConditions` 패스를 추가. bottom-up 순회로 자식 공통 조건을 부모에 AND 합성하고 자식에서 제거. ConditionNode 동등성은 JSON.stringify로 비교.

**Tech Stack:** TypeScript, vitest

---

### Task 1: 실패하는 테스트 작성

**Files:**
- Create: `test/tree-builder/UITreeOptimizerHoist.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
import { describe, it, expect } from "vitest";
import { UITreeOptimizer } from "@tree-manager/post-processors/UITreeOptimizer";
import type { UITree, UINode, ConditionNode } from "@/types/types";

function makeContainer(
  id: string,
  children: UINode[],
  visibleCondition?: ConditionNode
): UINode {
  return {
    type: "container" as const,
    id,
    name: id,
    children,
    ...(visibleCondition ? { visibleCondition } : {}),
  };
}

function makeText(
  id: string,
  visibleCondition?: ConditionNode
): UINode {
  return {
    type: "text" as const,
    id,
    name: id,
    textSegments: [{ text: "hello" }],
    ...(visibleCondition ? { visibleCondition } : {}),
  };
}

function makeTree(root: UINode, props: any[] = []): UITree {
  return {
    root: root as any,
    props,
    arraySlotNames: [],
    dependencies: [],
  };
}

describe("UITreeOptimizer.hoistSharedChildConditions", () => {
  const optimizer = new UITreeOptimizer();

  it("모든 자식이 동일한 조건을 가지면 부모로 끌어올리고 자식에서 제거", () => {
    const sharedCondition: ConditionNode = {
      type: "not",
      condition: { type: "truthy", prop: "iconOnly" },
    };

    // leadingIcon && <div> { !iconOnly && <Icons/> } </div>
    const root = makeContainer("root", [
      makeContainer(
        "Leading Icon",
        [makeText("Icons", { ...sharedCondition })],
        { type: "truthy", prop: "leadingIcon" }
      ),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const leadingIcon = (root as any).children[0];
    // 부모 조건: leadingIcon AND !iconOnly
    expect(leadingIcon.visibleCondition).toEqual({
      type: "and",
      conditions: [
        { type: "truthy", prop: "leadingIcon" },
        sharedCondition,
      ],
    });
    // 자식 조건: 제거됨
    expect(leadingIcon.children[0].visibleCondition).toBeUndefined();
  });

  it("부모에 기존 조건이 없으면 공통 조건만 부모에 설정", () => {
    const sharedCondition: ConditionNode = {
      type: "truthy",
      prop: "showContent",
    };

    const root = makeContainer("root", [
      makeContainer("wrapper", [
        makeText("child1", { ...sharedCondition }),
        makeText("child2", { ...sharedCondition }),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const wrapper = (root as any).children[0];
    expect(wrapper.visibleCondition).toEqual(sharedCondition);
    expect(wrapper.children[0].visibleCondition).toBeUndefined();
    expect(wrapper.children[1].visibleCondition).toBeUndefined();
  });

  it("자식 조건이 서로 다르면 끌어올리지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("wrapper", [
        makeText("child1", { type: "truthy", prop: "a" }),
        makeText("child2", { type: "truthy", prop: "b" }),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const wrapper = (root as any).children[0];
    expect(wrapper.visibleCondition).toBeUndefined();
    expect(wrapper.children[0].visibleCondition).toEqual({
      type: "truthy",
      prop: "a",
    });
    expect(wrapper.children[1].visibleCondition).toEqual({
      type: "truthy",
      prop: "b",
    });
  });

  it("일부 자식에만 조건이 있으면 끌어올리지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("wrapper", [
        makeText("child1", { type: "truthy", prop: "a" }),
        makeText("child2"), // 조건 없음
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const wrapper = (root as any).children[0];
    expect(wrapper.visibleCondition).toBeUndefined();
  });

  it("자식이 0개면 아무것도 하지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("empty", []),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const empty = (root as any).children[0];
    expect(empty.visibleCondition).toBeUndefined();
  });

  it("중첩된 트리에서 bottom-up으로 동작", () => {
    const innerCondition: ConditionNode = { type: "truthy", prop: "x" };

    // grandparent > parent > [child1(x), child2(x)]
    const root = makeContainer("root", [
      makeContainer("grandparent", [
        makeContainer("parent", [
          makeText("child1", { ...innerCondition }),
          makeText("child2", { ...innerCondition }),
        ]),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.hoistSharedChildConditions(tree.root as any);

    const parent = (root as any).children[0].children[0];
    expect(parent.visibleCondition).toEqual(innerCondition);
    expect(parent.children[0].visibleCondition).toBeUndefined();
    expect(parent.children[1].visibleCondition).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run test/tree-builder/UITreeOptimizerHoist.test.ts`
Expected: FAIL — `optimizer.hoistSharedChildConditions is not a function`

---

### Task 2: hoistSharedChildConditions 구현

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts`

- [ ] **Step 1: `hoistSharedChildConditions` 메서드 추가**

`UITreeOptimizer` 클래스의 `pruneUnusedProps` 메서드 바로 위에 추가:

```typescript
  /**
   * 자식 공통 조건 끌어올리기
   *
   * 모든 자식이 동일한 visibleCondition을 공유하면:
   * 1. 그 조건을 부모의 visibleCondition에 AND로 합성
   * 2. 자식들에서 visibleCondition 제거
   *
   * bottom-up 순회하여 가장 깊은 레벨부터 처리.
   * 빈 wrapper div 렌더링을 방지한다.
   */
  hoistSharedChildConditions(node: UINode): void {
    // children이 있는 노드만 처리
    if (!("children" in node) || !node.children || node.children.length === 0) {
      return;
    }

    // bottom-up: 자식부터 처리
    for (const child of node.children) {
      this.hoistSharedChildConditions(child);
    }

    // 모든 자식이 visibleCondition을 가지는지 확인
    const allHaveCondition = node.children.every(
      (child) => child.visibleCondition != null
    );
    if (!allHaveCondition) return;

    // 모든 자식의 조건이 동일한지 확인 (JSON.stringify 비교)
    const firstCondStr = JSON.stringify(node.children[0].visibleCondition);
    const allSame = node.children.every(
      (child) => JSON.stringify(child.visibleCondition) === firstCondStr
    );
    if (!allSame) return;

    // 공통 조건을 부모에 합성
    const sharedCondition = node.children[0].visibleCondition!;
    if (node.visibleCondition) {
      node.visibleCondition = {
        type: "and",
        conditions: [node.visibleCondition, sharedCondition],
      };
    } else {
      node.visibleCondition = sharedCondition;
    }

    // 자식에서 조건 제거
    for (const child of node.children) {
      delete child.visibleCondition;
    }
  }
```

- [ ] **Step 2: 테스트 실행 — 통과 확인**

Run: `npx vitest run test/tree-builder/UITreeOptimizerHoist.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 3: 커밋**

```bash
git add test/tree-builder/UITreeOptimizerHoist.test.ts src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts
git commit -m "feat(optimizer): hoistSharedChildConditions — 자식 공통 조건을 부모로 끌어올려 빈 wrapper div 방지"
```

---

### Task 3: 파이프라인에 패스 등록 + Buttonsolid 검증

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts` (optimizeMain, optimizeDependency)

- [ ] **Step 1: optimizeMain / optimizeDependency에 패스 추가**

`optimizeMain`에서 `removeVariantOnlySlots` 호출 직후, `mergeRedundantDynamicStyles` 직전에 추가:

```typescript
  optimizeMain(tree: UITree, diagnostics?: VariantInconsistency[]): void {
    this.removeVariantOnlySlots(tree);
    this.hoistSharedChildConditions(tree.root);
    this.mergeRedundantDynamicStyles(tree.root);
    this.decomposeDynamicStyles(tree.root, diagnostics);
  }
```

`optimizeDependency`에서 `mergeRedundantDynamicStyles` 직전에 추가:

```typescript
  optimizeDependency(tree: UITree, diagnostics?: VariantInconsistency[]): void {
    this.hoistSharedChildConditions(tree.root);
    this.mergeRedundantDynamicStyles(tree.root);
    this.makeRootFlexible(tree);
    this.decomposeDynamicStyles(tree.root, diagnostics);
  }
```

- [ ] **Step 2: Buttonsolid 컴파일 출력 확인**

Run: `npx vitest run test/compiler/dumpButtonsolid.test.ts`

`/tmp/buttonsolid_output.tsx`에서 확인할 것:
- `{leadingIcon && !iconOnly &&` 패턴으로 조건이 합성되었는지
- 빈 `<div>` 가능성이 제거되었는지

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 스냅샷 변경 가능 — `visibleCondition`이 이동하므로 UITree 스냅샷 업데이트 필요할 수 있음.

- [ ] **Step 4: 스냅샷 업데이트 (필요 시)**

Run: `npx vitest run -u`
변경된 스냅샷을 수동 확인하여 의도한 변경인지 검증.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(optimizer): hoistSharedChildConditions 파이프라인 등록 — 빈 wrapper div 제거"
```

---

### Task 4: 임시 dump 테스트 파일 정리

**Files:**
- Delete: `test/compiler/dumpButtonsolid.test.ts`

- [ ] **Step 1: dump 테스트 파일 삭제**

```bash
rm test/compiler/dumpButtonsolid.test.ts
```

- [ ] **Step 2: 커밋**

```bash
git add test/compiler/dumpButtonsolid.test.ts
git commit -m "chore: dump 테스트 파일 제거"
```
