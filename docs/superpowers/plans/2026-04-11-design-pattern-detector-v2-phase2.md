# DesignPatternDetector v2 Phase 2 — layoutModeSwitch + conditionalGroup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** variant prop에 의해 컨테이너 자식 구조가 바뀌는 패턴을 감지하고, 삼항/switch-case 코드를 생성

**Architecture:** DesignPatternDetector가 raw 데이터에서 layoutModeSwitch 패턴 감지 → UITreeOptimizer가 해당 컨테이너의 자식들을 conditionalGroup 노드로 변환 → NodeRenderer가 삼항/switch-case JSX 생성

**Tech Stack:** TypeScript, vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `types/types.ts` | Modify | DesignPattern에 layoutModeSwitch 추가, UINode에 conditionalGroup 추가, SemanticNodeKind에 추가 |
| `processors/DesignPatternDetector.ts` | Modify | detectLayoutModeSwitch() 구현 |
| `post-processors/UITreeOptimizer.ts` | Modify | layoutModeSwitch → conditionalGroup 변환 |
| `code-emitter/SemanticIR.ts` | Modify | SemanticNodeKind에 "conditionalGroup" 추가 |
| `code-emitter/react/generators/NodeRenderer.ts` | Modify | conditionalGroup 렌더링 로직 |
| `test/compiler/design-pattern-detector.test.ts` | Modify | layoutModeSwitch 감지 테스트 |
| `test/tree-builder/UITreeOptimizerConditionalGroup.test.ts` | Create | conditionalGroup 변환 테스트 |

---

### Task 1: layoutModeSwitch DesignPattern 타입 + conditionalGroup UINode 타입 추가

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR.ts`

- [ ] **Step 1: DesignPattern에 layoutModeSwitch 추가**

`types.ts`의 DesignPattern 유니온에 추가:

```typescript
  /** Variant prop에 의한 레이아웃 모드 전환 — 같은 컨테이너의 자식 구조가 prop 값에 따라 교체 */
  | {
      type: "layoutModeSwitch";
      /** 자식 구조가 바뀌는 컨테이너의 nodeId */
      containerNodeId: string;
      /** 모드를 제어하는 variant prop 이름 (정규화된 camelCase) */
      prop: string;
      /** prop 값 → 해당 모드에서만 존재하는 자식 이름 목록 */
      branches: Record<string, string[]>;
    };
```

- [ ] **Step 2: UINode에 ConditionalGroupNode 추가**

`types.ts`에서 UINode 관련 타입에 추가:

```typescript
/** 조건 분기 노드 — variant prop 값에 따라 다른 자식 렌더링 */
export interface ConditionalGroupNode extends UINodeBase {
  type: "conditionalGroup";
  /** 분기 기준 prop 이름 */
  prop: string;
  /** prop 값 → 해당 모드에서 렌더링할 자식들 */
  branches: Record<string, UINode[]>;
}
```

UINode 유니온에 `| ConditionalGroupNode` 추가.

- [ ] **Step 3: SemanticNodeKind에 "conditionalGroup" 추가**

`SemanticIR.ts`의 SemanticNodeKind 유니온에 `| "conditionalGroup"` 추가.

SemanticNode 인터페이스에 `branches` 옵셔널 필드 추가:

```typescript
/** conditionalGroup 전용: prop 값 → 자식 배열 */
branches?: Record<string, SemanticNode[]>;
```

- [ ] **Step 4: SemanticIRBuilder에서 branches 전달**

`SemanticIRBuilder.ts`의 `buildNode()`에서 UINode의 `branches`를 SemanticNode로 복사:

```typescript
// 기존 children 처리 아래에 추가:
if ("branches" in n && n.branches) {
  sn.branches = {};
  for (const [key, nodes] of Object.entries(n.branches)) {
    sn.branches[key] = nodes.map((child) => this.buildNode(child, component));
  }
}
```

- [ ] **Step 5: 타입 테스트 업데이트**

`test/compiler/design-pattern-types.test.ts`에 layoutModeSwitch 추가:

```typescript
{ type: "layoutModeSwitch", containerNodeId: "content-1", prop: "iconOnly", branches: { "True": ["Icon"], "False": ["Leading Icon", "텍스트", "Trailing Icon"] } },
```

- [ ] **Step 6: Run tests, commit**

Run: `npx vitest run test/compiler/design-pattern-types.test.ts`
Expected: PASS

```bash
git commit -m "feat: add layoutModeSwitch + conditionalGroup types"
```

---

### Task 2: layoutModeSwitch 감지 구현

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`
- Modify: `test/compiler/design-pattern-detector.test.ts`

- [ ] **Step 1: 감지 테스트 작성**

```typescript
describe("layoutModeSwitch", () => {
  it("variant prop에 의해 자식 구조가 바뀌면 감지", () => {
    // Buttonsolid 구조 단순화: Icon Only=False → [Leading Icon, 텍스트, Trailing Icon], True → [Icon]
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Icon Only": { type: "VARIANT", variantOptions: ["False", "True"] },
        "Size": { type: "VARIANT", variantOptions: ["Large", "Small"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Icon Only=False, Size=Large",
          children: [{
            id: "content-1", type: "FRAME", name: "Content",
            children: [
              { id: "li-1", type: "FRAME", name: "Leading Icon", children: [] },
              { id: "txt-1", type: "TEXT", name: "텍스트", children: [] },
              { id: "ti-1", type: "FRAME", name: "Trailing Icon", children: [] },
            ],
          }],
        },
        {
          type: "COMPONENT", name: "Icon Only=False, Size=Small",
          children: [{
            id: "content-2", type: "FRAME", name: "Content",
            children: [
              { id: "li-2", type: "FRAME", name: "Leading Icon", children: [] },
              { id: "txt-2", type: "TEXT", name: "텍스트", children: [] },
              { id: "ti-2", type: "FRAME", name: "Trailing Icon", children: [] },
            ],
          }],
        },
        {
          type: "COMPONENT", name: "Icon Only=True, Size=Large",
          children: [{
            id: "content-3", type: "FRAME", name: "Content",
            children: [
              { id: "icon-1", type: "INSTANCE", name: "Icon", children: [] },
            ],
          }],
        },
        {
          type: "COMPONENT", name: "Icon Only=True, Size=Small",
          children: [{
            id: "content-4", type: "FRAME", name: "Content",
            children: [
              { id: "icon-2", type: "INSTANCE", name: "Icon", children: [] },
            ],
          }],
        },
      ],
    } as any;

    const patterns = detector.detect(node, null as any);
    const lms = patterns.find(p => p.type === "layoutModeSwitch");
    expect(lms).toBeDefined();
    expect(lms).toMatchObject({
      type: "layoutModeSwitch",
      prop: "iconOnly",
      branches: {
        "False": expect.arrayContaining(["Leading Icon", "텍스트", "Trailing Icon"]),
        "True": expect.arrayContaining(["Icon"]),
      },
    });
  });

  it("모든 variant에서 자식 구조가 같으면 감지하지 않음", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Size": { type: "VARIANT", variantOptions: ["Large", "Small"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Size=Large",
          children: [{
            id: "c-1", type: "FRAME", name: "Content",
            children: [
              { id: "a-1", type: "TEXT", name: "Label", children: [] },
            ],
          }],
        },
        {
          type: "COMPONENT", name: "Size=Small",
          children: [{
            id: "c-2", type: "FRAME", name: "Content",
            children: [
              { id: "a-2", type: "TEXT", name: "Label", children: [] },
            ],
          }],
        },
      ],
    } as any;

    const patterns = detector.detect(node, null as any);
    expect(patterns.filter(p => p.type === "layoutModeSwitch")).toHaveLength(0);
  });

  it("N분기도 감지 (3개 이상 모드)", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        "Type": { type: "VARIANT", variantOptions: ["Default", "Basic", "Minimal"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Type=Default",
          children: [{
            id: "h-1", type: "FRAME", name: "Header",
            children: [
              { id: "n1", type: "FRAME", name: "Nav", children: [] },
              { id: "t1", type: "TEXT", name: "Title", children: [] },
              { id: "a1", type: "FRAME", name: "Actions", children: [] },
            ],
          }],
        },
        {
          type: "COMPONENT", name: "Type=Basic",
          children: [{
            id: "h-2", type: "FRAME", name: "Header",
            children: [
              { id: "n2", type: "FRAME", name: "Nav", children: [] },
              { id: "t2", type: "TEXT", name: "Title", children: [] },
            ],
          }],
        },
        {
          type: "COMPONENT", name: "Type=Minimal",
          children: [{
            id: "h-3", type: "FRAME", name: "Header",
            children: [
              { id: "n3", type: "FRAME", name: "Nav", children: [] },
            ],
          }],
        },
      ],
    } as any;

    const patterns = detector.detect(node, null as any);
    const lms = patterns.find(p => p.type === "layoutModeSwitch");
    expect(lms).toBeDefined();
    if (lms && lms.type === "layoutModeSwitch") {
      expect(Object.keys(lms.branches)).toHaveLength(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: FAIL — detectLayoutModeSwitch not implemented

- [ ] **Step 3: 감지 알고리즘 구현**

DesignPatternDetector에 추가:

```typescript
/**
 * layoutModeSwitch 감지
 *
 * COMPONENT_SET의 variant들을 분석하여, 같은 이름의 컨테이너가
 * 하나의 variant prop 값에 따라 다른 자식 구성을 가지는지 확인한다.
 *
 * 알고리즘:
 * 1. variant 이름을 파싱하여 prop=value 쌍 추출
 * 2. 각 variant에서 같은 이름의 컨테이너를 찾고 자식 이름 집합 수집
 * 3. 각 variant prop에 대해: 해당 prop의 값이 바뀔 때 자식 집합이 변하는지 확인
 * 4. 다른 prop 값들을 고정했을 때 일관되게 자식이 변하면 → layoutModeSwitch
 */
private detectLayoutModeSwitch(
  variants: any[],
  propDefs: Record<string, any>,
  patterns: DesignPattern[],
): void {
  if (variants.length < 2) return;

  // 1. variant 이름 파싱 → prop=value map
  const parsedVariants = variants.map((v: any) => ({
    node: v,
    props: this.parseVariantName(v.name),
  }));

  // 2. variant prop 목록 (VARIANT 타입만)
  const variantPropNames = Object.entries(propDefs)
    .filter(([_, def]) => def.type === "VARIANT")
    .map(([key]) => key.split("#")[0].trim());

  // 3. 모든 variant에서 공통 컨테이너 이름 수집
  const containerChildrenMap = this.collectContainerChildren(parsedVariants);

  // 4. 각 컨테이너에 대해, 어떤 prop이 자식 구성을 변경하는지 확인
  for (const [containerName, variantEntries] of containerChildrenMap) {
    for (const propName of variantPropNames) {
      const propValues = [...new Set(parsedVariants.map(v => v.props.get(propName)).filter(Boolean))] as string[];
      if (propValues.length < 2) continue;

      // prop 값별로 자식 이름 집합 수집 (다른 prop 값을 무시하고 그룹핑)
      const branchChildren = new Map<string, Set<string>>();
      for (const entry of variantEntries) {
        const propVal = entry.variantProps.get(propName);
        if (!propVal) continue;
        if (!branchChildren.has(propVal)) branchChildren.set(propVal, new Set());
        for (const childName of entry.childNames) {
          branchChildren.get(propVal)!.add(childName);
        }
      }

      // 모든 분기의 자식 집합이 같으면 → 이 prop은 자식 구성을 변경하지 않음
      const childSets = [...branchChildren.values()].map(s => [...s].sort().join(","));
      if (new Set(childSets).size <= 1) continue;

      // 자식 구성이 다르면 → layoutModeSwitch!
      const branches: Record<string, string[]> = {};
      for (const [val, names] of branchChildren) {
        branches[val] = [...names];
      }

      const normalizedProp = this.normalizePropName(propName);
      const containerNodeId = variantEntries[0]?.containerId ?? containerName;

      patterns.push({
        type: "layoutModeSwitch",
        containerNodeId,
        prop: normalizedProp,
        branches,
      });
      break; // 하나의 컨테이너에 대해 하나의 prop만 감지
    }
  }
}

/** variant 이름 파싱: "Icon Only=False, Size=Large" → Map { "Icon Only" → "False", "Size" → "Large" } */
private parseVariantName(name: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of name.split(",").map(s => s.trim())) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  return map;
}

/** 모든 variant에서 컨테이너별 자식 이름 수집 */
private collectContainerChildren(
  parsedVariants: Array<{ node: any; props: Map<string, string> }>,
): Map<string, Array<{ containerId: string; childNames: string[]; variantProps: Map<string, string> }>> {
  const result = new Map<string, Array<{ containerId: string; childNames: string[]; variantProps: Map<string, string> }>>();

  for (const { node: variant, props } of parsedVariants) {
    this.walkForContainers(variant, props, result);
  }

  return result;
}

private walkForContainers(
  node: any,
  variantProps: Map<string, string>,
  result: Map<string, Array<{ containerId: string; childNames: string[]; variantProps: Map<string, string> }>>,
): void {
  const children = node.children ?? [];
  if (children.length > 0) {
    const childNames = children.map((c: any) => c.name as string);
    const containerName = node.name as string;

    if (!result.has(containerName)) result.set(containerName, []);
    result.get(containerName)!.push({
      containerId: node.id,
      childNames,
      variantProps,
    });

    for (const child of children) {
      this.walkForContainers(child, variantProps, result);
    }
  }
}
```

detect() 메서드에 호출 추가 (COMPONENT_SET 분기 내):

```typescript
// Node-level patterns 순회 후, component-level patterns 전에:
this.detectLayoutModeSwitch(variants, propDefs, patterns);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: implement layoutModeSwitch detection in DesignPatternDetector"
```

---

### Task 3: UITreeOptimizer — conditionalGroup 변환

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts`
- Create: `test/tree-builder/UITreeOptimizerConditionalGroup.test.ts`

- [ ] **Step 1: 변환 테스트 작성**

```typescript
import { describe, it, expect } from "vitest";
import { UITreeOptimizer } from "@code-generator2/layers/tree-manager/post-processors/UITreeOptimizer";
import type { UITree, UINode, ConditionNode } from "@code-generator2/types/types";

function makeContainer(id: string, children: UINode[], opts?: {
  visibleCondition?: ConditionNode;
  designPatterns?: any[];
}): UINode {
  return {
    type: "container" as const,
    id, name: id, children,
    ...(opts?.visibleCondition ? { visibleCondition: opts.visibleCondition } : {}),
    ...(opts?.designPatterns ? { metadata: { designPatterns: opts.designPatterns } } : {}),
  };
}

function makeText(id: string, visibleCondition?: ConditionNode): UINode {
  return {
    type: "text" as const, id, name: id,
    textSegments: [{ text: "hello" }],
    ...(visibleCondition ? { visibleCondition } : {}),
  };
}

function makeTree(root: UINode): UITree {
  return { root: root as any, props: [], arraySlotNames: [], dependencies: [] };
}

describe("UITreeOptimizer.transformLayoutModeSwitch", () => {
  const optimizer = new UITreeOptimizer();

  it("layoutModeSwitch annotation이 있는 컨테이너의 자식을 conditionalGroup으로 변환", () => {
    const iconOnlyFalse: ConditionNode = { type: "eq", prop: "iconOnly", value: "False" };
    const iconOnlyTrue: ConditionNode = { type: "eq", prop: "iconOnly", value: "True" };

    const root = makeContainer("root", [
      makeContainer("Content", [
        makeContainer("Leading Icon", [], { visibleCondition: iconOnlyFalse }),
        makeText("텍스트", iconOnlyFalse),
        makeContainer("Trailing Icon", [], { visibleCondition: iconOnlyFalse }),
        makeContainer("Icon", [], { visibleCondition: iconOnlyTrue }),
      ], {
        designPatterns: [{
          type: "layoutModeSwitch",
          containerNodeId: "Content",
          prop: "iconOnly",
          branches: {
            "False": ["Leading Icon", "텍스트", "Trailing Icon"],
            "True": ["Icon"],
          },
        }],
      }),
    ]);

    const tree = makeTree(root);
    optimizer.optimizeMain(tree);

    const content = (root as any).children[0];
    // Content의 자식 중 conditionalGroup이 있어야 함
    const cg = content.children.find((c: any) => c.type === "conditionalGroup");
    expect(cg).toBeDefined();
    expect(cg.prop).toBe("iconOnly");
    expect(Object.keys(cg.branches)).toEqual(expect.arrayContaining(["False", "True"]));
    expect(cg.branches["False"]).toHaveLength(3);
    expect(cg.branches["True"]).toHaveLength(1);
  });

  it("layoutModeSwitch annotation이 없으면 변환하지 않음", () => {
    const root = makeContainer("root", [
      makeContainer("Content", [
        makeText("Label"),
      ]),
    ]);

    const tree = makeTree(root);
    optimizer.optimizeMain(tree);

    const content = (root as any).children[0];
    expect(content.children.every((c: any) => c.type !== "conditionalGroup")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/UITreeOptimizerConditionalGroup.test.ts`
Expected: FAIL

- [ ] **Step 3: UITreeOptimizer에 변환 로직 구현**

`optimizeMain()`에 새 패스 추가 (hoistSharedChildConditions 전에):

```typescript
optimizeMain(tree: UITree, diagnostics?: VariantInconsistency[]): void {
  this.removeVariantOnlySlots(tree);
  this.transformLayoutModeSwitches(tree.root);  // ← NEW
  this.hoistSharedChildConditions(tree.root);
  this.mergeRedundantDynamicStyles(tree.root);
  this.decomposeDynamicStyles(tree.root, diagnostics);
}
```

변환 메서드:

```typescript
/**
 * layoutModeSwitch annotation이 있는 컨테이너의 조건부 자식들을
 * conditionalGroup 노드로 교체한다.
 *
 * 변환 전: Content의 자식들이 각각 visibleCondition을 가짐
 * 변환 후: conditionalGroup 노드 하나가 branches별로 자식을 그룹핑
 */
private transformLayoutModeSwitches(node: UINode): void {
  if (!("children" in node) || !node.children) return;

  // 재귀: 자식 먼저
  for (const child of node.children) {
    this.transformLayoutModeSwitches(child);
  }

  // layoutModeSwitch annotation 확인
  const lms = (node as any).metadata?.designPatterns?.find(
    (p: any) => p.type === "layoutModeSwitch"
  );
  if (!lms) return;

  const { prop, branches } = lms;

  // branches의 자식 이름들을 하나의 Set으로 합침
  const allBranchChildNames = new Set<string>();
  for (const names of Object.values(branches) as string[][]) {
    for (const name of names) allBranchChildNames.add(name);
  }

  // 조건부 자식 (branches에 포함) vs 공통 자식 (모든 분기에 공통이거나 branches에 미포함) 분리
  const commonChildren: UINode[] = [];
  const branchedChildren: UINode[] = [];

  for (const child of node.children) {
    if (allBranchChildNames.has(child.name)) {
      branchedChildren.push(child);
    } else {
      commonChildren.push(child);
    }
  }

  if (branchedChildren.length === 0) return;

  // branches별로 자식 그룹핑
  const groupedBranches: Record<string, UINode[]> = {};
  for (const [value, names] of Object.entries(branches) as [string, string[]][]) {
    groupedBranches[value] = [];
    for (const name of names) {
      const child = branchedChildren.find(c => c.name === name);
      if (child) {
        // visibleCondition 제거 (conditionalGroup이 대신 분기)
        delete child.visibleCondition;
        groupedBranches[value].push(child);
      }
    }
  }

  // conditionalGroup 노드 생성
  const conditionalGroup: any = {
    type: "conditionalGroup",
    id: `${node.id}_cg`,
    name: `${prop}_switch`,
    prop,
    branches: groupedBranches,
  };

  // 원래 자식을 교체: 공통 자식 + conditionalGroup
  // conditionalGroup의 위치는 첫 번째 조건부 자식이 있던 위치
  const firstBranchedIdx = node.children.findIndex(c => allBranchChildNames.has(c.name));
  const newChildren: UINode[] = [];
  let cgInserted = false;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (allBranchChildNames.has(child.name)) {
      if (!cgInserted) {
        newChildren.push(conditionalGroup);
        cgInserted = true;
      }
      // 조건부 자식은 건너뜀 (conditionalGroup 안으로 이동)
    } else {
      newChildren.push(child);
    }
  }

  node.children = newChildren;
}
```

- [ ] **Step 4: optimizeDependency에도 추가**

```typescript
optimizeDependency(tree: UITree, diagnostics?: VariantInconsistency[]): void {
  this.transformLayoutModeSwitches(tree.root);  // ← NEW
  this.hoistSharedChildConditions(tree.root);
  this.mergeRedundantDynamicStyles(tree.root);
  this.makeRootFlexible(tree);
  this.decomposeDynamicStyles(tree.root, diagnostics);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/tree-builder/UITreeOptimizerConditionalGroup.test.ts`
Expected: PASS

Run: `npx vitest run`
Expected: PASS (기존 테스트에 영향 없어야 함 — annotation이 없는 노드는 변환 안 됨)

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add layoutModeSwitch → conditionalGroup transformation in UITreeOptimizer"
```

---

### Task 4: NodeRenderer — conditionalGroup 렌더링

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts`

- [ ] **Step 1: NodeRenderer에서 conditionalGroup case 추가**

`generateNodeInner()` 또는 그 안의 switch 분기에 추가:

```typescript
// switch (node.kind) 안에 추가:
case "conditionalGroup":
  return this.generateConditionalGroupNode(node, context);
```

- [ ] **Step 2: generateConditionalGroupNode 구현**

```typescript
/**
 * conditionalGroup 노드를 삼항 또는 object map 패턴으로 렌더링
 *
 * 2분기: prop === "A" ? <BranchA /> : <BranchB />
 * N분기: {{ A: <BranchA />, B: <BranchB />, C: <BranchC /> }[prop]}
 */
private generateConditionalGroupNode(
  node: SemanticNode,
  context: RenderContext,
): string {
  const branches = node.branches;
  if (!branches) return "";

  const prop = (node as any).prop ?? "mode";
  const entries = Object.entries(branches);

  if (entries.length === 0) return "";

  // 각 branch의 자식 렌더링
  const renderedBranches: Record<string, string> = {};
  for (const [value, children] of entries) {
    const childrenJsx = (children as SemanticNode[])
      .map((child) => this.generateNode(child, context))
      .filter(Boolean)
      .join("\n");

    if ((children as SemanticNode[]).length === 1) {
      renderedBranches[value] = childrenJsx;
    } else {
      renderedBranches[value] = `<>\n${childrenJsx}\n</>`;
    }
  }

  if (entries.length === 2) {
    // 2분기: 삼항 연산자
    const [first, second] = entries;
    const condExpr = `${prop} === ${JSON.stringify(first[0])}`;
    return `{${condExpr} ? (\n${renderedBranches[first[0]]}\n) : (\n${renderedBranches[second[0]]}\n)}`;
  } else {
    // N분기: object map 패턴
    const mapEntries = entries
      .map(([value]) => `${JSON.stringify(value)}: ${renderedBranches[value]}`)
      .join(",\n");
    return `{{\n${mapEntries}\n}[${prop}]}`;
  }
}
```

- [ ] **Step 3: 전체 테스트 실행**

Run: `npx vitest run`

conditionalGroup 노드가 포함된 UITree가 실제로 코드 생성까지 이어지는지 확인.
기존 fixture 중 layoutModeSwitch가 감지되는 것(Buttonsolid 등)의 출력이 변경될 수 있음.

- [ ] **Step 4: 스냅샷 업데이트**

변경된 코드 출력이 올바른지 확인 후:
Run: `npx vitest run -u`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add conditionalGroup rendering in NodeRenderer"
```

---

### Task 5: Buttonsolid 통합 테스트

**Files:**
- Create: `test/compiler/test-buttonsolid-conditional-group.test.ts`

- [ ] **Step 1: Buttonsolid 코드 생성 결과에서 삼항 분기 확인**

```typescript
import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "@code-generator2/FigmaCodeGenerator";
import fs from "fs";
import path from "path";

describe("Buttonsolid conditionalGroup", () => {
  it("iconOnly에 의한 삼항 분기가 생성된다", () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../fixtures/failing/Buttonsolid.json"),
        "utf-8"
      )
    );

    const generator = new FigmaCodeGenerator(fixture, { strategy: "tailwind" });
    const result = generator.generate();
    const code = result.code;

    // 삼항 또는 조건 분기가 있어야 함
    // iconOnly === "True" ? ... : ... 또는 유사 패턴
    expect(code).toMatch(/iconOnly/);
    // 개별 !iconOnly && 반복이 아닌 그룹화된 분기
    // 정확한 패턴은 실제 출력을 보고 조정
  });
});
```

- [ ] **Step 2: 실제 출력 확인 후 assertion 조정**

생성된 코드를 console.log로 출력하여 확인:
- `iconOnly === "True" ? <Icon /> : <>{leadingIcon}{label}{trailingIcon}</>` 같은 패턴이 있는지
- 개별 `!iconOnly &&` 반복이 사라졌는지

assertion을 실제 출력에 맞게 조정.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run test/compiler/test-buttonsolid-conditional-group.test.ts`

```bash
git commit -m "test: add Buttonsolid conditionalGroup integration test"
```

---

### Task 6: 최종 검증 + 스냅샷 정리

**Files:**
- Possibly modify: snapshot files

- [ ] **Step 1: 전체 테스트 실행**

Run: `npx vitest run`

- [ ] **Step 2: 실패하는 스냅샷 diff 확인**

layoutModeSwitch가 감지되는 fixture들(Buttonsolid, Headersub 등)의 UITree와 코드 출력이 변경됨.
변경 내용이 올바른지(conditionalGroup 노드, 삼항 분기) 확인 후 업데이트.

- [ ] **Step 3: 스냅샷 업데이트**

Run: `npx vitest run -u`

- [ ] **Step 4: 최종 확인**

Run: `npx vitest run`
Expected: 모든 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "test: update snapshots for conditionalGroup code generation"
```
