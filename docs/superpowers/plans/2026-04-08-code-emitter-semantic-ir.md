# Code Emitter SemanticIR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a framework-agnostic `SemanticComponent` IR between `UITree` and `ReactEmitter`, decompose the 1452-line `JsxGenerator` into focused modules, and migrate all call sites — while keeping React output byte-identical.

**Architecture:** New Layer 2.5 (`SemanticIRBuilder`) converts `UITree` → `SemanticComponent`. `JsxGenerator` is split into `JsxGenerator` (orchestrator), `NodeRenderer`, `BindingRenderer`, `ConditionRenderer`. ReactEmitter signature flips at the end of the migration in one atomic step.

**Tech Stack:** TypeScript 5.3, Vitest, Vite 7, React 19. Existing code-generator2 pipeline.

**Reference spec:** `docs/superpowers/specs/2026-04-08-code-emitter-semantic-ir-design.md`

---

## Pre-flight

This work runs in a dedicated worktree. If you are not yet in one:

```bash
git worktree add .claude/worktrees/code-emitter-semantic-ir -b feat/code-emitter-semantic-ir
cd .claude/worktrees/code-emitter-semantic-ir
```

Verify clean state:

```bash
npm run test -- --run test/code-emitter
```

Expected: all existing emitter tests pass before any changes.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR.ts` | Type definitions: `SemanticComponent`, `SemanticNode`, `StateDefinition`, `DerivedDefinition`, `SemanticNodeKind` |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts` | `UITree` → `SemanticComponent` converter (~150 LOC) |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/BindingRenderer.ts` | `BindingSource` → JS expression string (~100 LOC) |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ConditionRenderer.ts` | `ConditionNode` → JS condition string (~150 LOC) |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts` | `SemanticNode` → JSX recursive emit (~600-800 LOC, extracted from JsxGenerator) |
| `test/code-emitter/semantic-ir-builder.test.ts` | ~30-40 unit tests for the builder |
| `test/code-emitter/binding-renderer.test.ts` | Unit tests for `BindingRenderer` |
| `test/code-emitter/condition-renderer.test.ts` | Unit tests for `ConditionRenderer` |
| `test/code-emitter/node-renderer.test.ts` | Smoke tests for the recursive renderer |

### Modified files

| Path | Change |
|---|---|
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/ICodeEmitter.ts` | `emit*` methods take `SemanticComponent` instead of `UITree` |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts` | Internal logic switches to `SemanticComponent`. `renameNativeProps` adapted. `propagateVariantOptions` / `propagateNativeRenames` adapted. |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts` | Becomes ~200 LOC orchestrator. Recursive node logic moved to `NodeRenderer`, condition logic to `ConditionRenderer`, binding logic to `BindingRenderer`. |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/PropsGenerator.ts` | Input type changed to `SemanticComponent`. Reads `ir.structure.kind` instead of `(uiTree.root as any).type`. |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/StylesGenerator.ts` | Input type changed to `SemanticComponent`. Reads `ir.structure` instead of `uiTree.root`. |
| `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ImportsGenerator.ts` | Input type changed. Walks `SemanticNode` instead of `UINode`. |
| `src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts` | Calls `SemanticIRBuilder.build(uiTree)` before each `emit*` invocation. |
| `test/code-emitter/code-emitter.test.ts` | One-line update per test (build IR before emit). |
| `test/code-emitter/code-emitter-review.test.ts` | Same. |
| `test/code-emitter/tailwind-strategy.test.ts` | Same. |
| `test/compiler/newPipeline.test.ts` | Same. |

---

## Migration strategy summary

To keep tests green throughout, the migration uses a **temporary internal scaffold**:

1. Phase 1-2: Build new types + `SemanticIRBuilder` standalone. Existing tests untouched.
2. Phase 3: Inject `SemanticIRBuilder.build()` at the top of `ReactEmitter.emit()` so internal code can switch to IR field-by-field. **External signature unchanged.** Tests remain green.
3. Phase 4-6: Extract `BindingRenderer` / `ConditionRenderer` / `NodeRenderer` from `JsxGenerator`. Each extraction is byte-identical.
4. Phase 7: Migrate `PropsGenerator` / `StylesGenerator` / `ImportsGenerator` to take `SemanticComponent`.
5. Phase 8: **Flip the signature.** Remove the temporary scaffold, update `ICodeEmitter`, `FigmaCodeGenerator`, and 4 test files.
6. Phase 9: Final verification.

Each phase ends with a green test run + commit.

---

## Phase 1: SemanticIR Type Definitions

### Task 1.1: Create `SemanticIR.ts` with all type definitions

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR.ts`

- [ ] **Step 1: Create the file with full type definitions**

```ts
/**
 * SemanticIR
 *
 * Framework-agnostic intermediate representation between UITree (Figma semantics)
 * and the emitter layer (target framework). Each emitter (React, Vue, SwiftUI...)
 * consumes the same SemanticComponent.
 *
 * See: docs/superpowers/specs/2026-04-08-code-emitter-semantic-ir-design.md
 */

import type {
  PropDefinition,
  ArraySlotInfo,
  StyleObject,
  BindingSource,
  ConditionNode,
  TextSegment,
  InstanceOverride,
  ComponentType,
} from "../../types/types";

/** Node kind — same value space as UINodeType, distinct name to mark IR boundary */
export type SemanticNodeKind =
  | "container"
  | "text"
  | "image"
  | "vector"
  | "button"
  | "input"
  | "link"
  | "slot"
  | "component";

/**
 * State definition (framework-agnostic).
 *
 * `setter` field removed: each emitter generates its own
 * (React: useState; Vue: ref; Svelte: $state; SwiftUI: @State).
 */
export interface StateDefinition {
  name: string;
  initialValue: string;
  /** "mutable" — Phase 1 always mutable; "computed" reserved for future Heuristic upgrades */
  mutability: "mutable" | "computed";
}

/**
 * Derived (computed) variable.
 *
 * FIXME(future): expression is a JS string — needs ExpressionNode IR
 * when adding non-JS targets (SwiftUI/Compose).
 * See spec §10.1 Known Future Debt.
 */
export interface DerivedDefinition {
  name: string;
  expression: string;
}

/**
 * Single semantic node (one element in the component tree).
 *
 * `attrs` and `events` are split (UITree's bindings.attrs mixed both).
 * `styles` carries CSS as-is — platform-specific style adapters live in each emitter.
 */
export interface SemanticNode {
  id: string;
  kind: SemanticNodeKind;
  name?: string;

  attrs?: Record<string, BindingSource>;
  events?: Record<string, BindingSource>;
  styles?: StyleObject;
  content?: BindingSource | TextSegment[];
  visibleCondition?: ConditionNode;
  children?: SemanticNode[];

  // kind-specific fields (passed through from UINode)
  vectorSvg?: string;
  variantSvgs?: Record<string, string>;
  refId?: string;
  overrideProps?: Record<string, string>;
  overrideMeta?: InstanceOverride[];
  instanceScale?: number;
  loop?: { dataProp: string; keyField?: string };
  childrenSlot?: string;
  semanticType?: string;
}

/**
 * Top-level component IR. Output of SemanticIRBuilder, input of every emitter.
 */
export interface SemanticComponent {
  name: string;
  props: PropDefinition[];
  state: StateDefinition[];
  derived: DerivedDefinition[];
  arraySlots?: ArraySlotInfo[];
  structure: SemanticNode;
  componentType?: ComponentType;
  isDependency?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR.ts
git commit -m "feat(code-emitter): add SemanticIR type definitions

framework-agnostic IR between UITree and emitter layer.
references spec docs/superpowers/specs/2026-04-08-code-emitter-semantic-ir-design.md"
```

---

## Phase 2: SemanticIRBuilder (TDD)

### Task 2.1: Create test file with kind mapping tests

**Files:**
- Create: `test/code-emitter/semantic-ir-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
import type { UITree, UINode } from "@frontend/ui/domain/code-generator2/types/types";

function makeTree(root: UINode, extra: Partial<UITree> = {}): UITree {
  return { root, props: [], ...extra };
}

describe("SemanticIRBuilder", () => {
  describe("kind mapping", () => {
    const kinds: Array<UINode["type"]> = [
      "container", "text", "image", "vector",
      "button", "input", "link", "slot", "component",
    ];

    for (const kind of kinds) {
      it(`maps UINodeType "${kind}" to SemanticNodeKind "${kind}"`, () => {
        const node = { id: "n1", name: "x", type: kind, children: [] } as unknown as UINode;
        const ir = SemanticIRBuilder.build(makeTree(node));
        expect(ir.structure.kind).toBe(kind);
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/code-emitter/semantic-ir-builder.test.ts`
Expected: FAIL — `Cannot find module '.../SemanticIRBuilder'`.

- [ ] **Step 3: Create `SemanticIRBuilder.ts` with minimal kind mapping**

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts`

```ts
/**
 * SemanticIRBuilder
 *
 * Layer 2.5: UITree -> SemanticComponent.
 * See: docs/superpowers/specs/2026-04-08-code-emitter-semantic-ir-design.md
 */

import type { UITree, UINode, BindingSource, StateVar } from "../../types/types";
import type {
  SemanticComponent,
  SemanticNode,
  StateDefinition,
} from "./SemanticIR";
import { toComponentName } from "../../utils/nameUtils";

/** Explicit set of binding keys treated as event handlers (rest go to attrs). */
export const EVENT_KEYS: ReadonlySet<string> = new Set([
  "onClick", "onChange", "onInput", "onFocus", "onBlur",
  "onKeyDown", "onKeyUp", "onSubmit", "onMouseEnter", "onMouseLeave",
]);

export class SemanticIRBuilder {
  static build(uiTree: UITree): SemanticComponent {
    return {
      name: toComponentName(uiTree.root.name),
      props: uiTree.props,
      state: this.normalizeState(uiTree.stateVars),
      // FIXME(future): expression is a JS string — needs ExpressionNode IR
      //                when adding non-JS targets (SwiftUI/Compose).
      //                See spec §10.1 Known Future Debt.
      derived: uiTree.derivedVars ?? [],
      arraySlots: uiTree.arraySlots,
      structure: this.buildNode(uiTree.root),
      componentType: uiTree.componentType,
      isDependency: uiTree.isDependency,
    };
  }

  private static buildNode(n: UINode): SemanticNode {
    const node: SemanticNode = {
      id: n.id,
      kind: n.type as SemanticNode["kind"],
      name: n.name,
    };
    return node;
  }

  private static normalizeState(stateVars?: StateVar[]): StateDefinition[] {
    return (stateVars ?? []).map((sv) => ({
      name: sv.name,
      initialValue: sv.initialValue,
      mutability: "mutable",
    }));
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run test/code-emitter/semantic-ir-builder.test.ts`
Expected: PASS — 9 kind mapping tests.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts test/code-emitter/semantic-ir-builder.test.ts
git commit -m "feat(code-emitter): SemanticIRBuilder skeleton + kind mapping tests"
```

### Task 2.2: Event/attrs split

**Files:**
- Modify: `test/code-emitter/semantic-ir-builder.test.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts`

- [ ] **Step 1: Add failing tests for event/attrs split**

Append inside the top-level `describe`:

```ts
  describe("event/attrs split", () => {
    function nodeWithBindings(attrs: Record<string, BindingSource>): UINode {
      return {
        id: "n1", name: "x", type: "container", children: [],
        bindings: { attrs },
      } as unknown as UINode;
    }

    it("moves onClick to events", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        onClick: { prop: "onClick" },
      })));
      expect(ir.structure.events).toEqual({ onClick: { prop: "onClick" } });
      expect(ir.structure.attrs).toBeUndefined();
    });

    it("keeps non-event keys in attrs", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        type: { prop: "type" },
        placeholder: { prop: "placeholder" },
      })));
      expect(ir.structure.attrs).toEqual({
        type: { prop: "type" },
        placeholder: { prop: "placeholder" },
      });
      expect(ir.structure.events).toBeUndefined();
    });

    it("splits mixed attrs and events", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        type: { prop: "type" },
        onChange: { prop: "onChange" },
        onClick: { prop: "onClick" },
      })));
      expect(ir.structure.attrs).toEqual({ type: { prop: "type" } });
      expect(ir.structure.events).toEqual({
        onChange: { prop: "onChange" },
        onClick: { prop: "onClick" },
      });
    });

    it("leaves unknown on* keys in attrs", () => {
      const ir = SemanticIRBuilder.build(makeTree(nodeWithBindings({
        onCustomThing: { prop: "x" },
      })));
      expect(ir.structure.attrs).toEqual({ onCustomThing: { prop: "x" } });
      expect(ir.structure.events).toBeUndefined();
    });

    it("undefined bindings yields undefined attrs/events", () => {
      const node = { id: "n1", name: "x", type: "container", children: [] } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.attrs).toBeUndefined();
      expect(ir.structure.events).toBeUndefined();
    });
  });
```

(Add `BindingSource` to the import line at the top of the test file.)

- [ ] **Step 2: Run — should fail**

Run: `npx vitest run test/code-emitter/semantic-ir-builder.test.ts`
Expected: 5 new failures.

- [ ] **Step 3: Update `buildNode` to split attrs/events**

In `SemanticIRBuilder.ts`, replace `buildNode`:

```ts
  private static buildNode(n: UINode): SemanticNode {
    const { attrs, events } = this.splitAttrsAndEvents(n.bindings?.attrs);
    return {
      id: n.id,
      kind: n.type as SemanticNode["kind"],
      name: n.name,
      attrs,
      events,
    };
  }

  private static splitAttrsAndEvents(
    bindings?: Record<string, BindingSource>
  ): { attrs?: Record<string, BindingSource>; events?: Record<string, BindingSource> } {
    if (!bindings) return {};
    const attrs: Record<string, BindingSource> = {};
    const events: Record<string, BindingSource> = {};
    for (const [k, v] of Object.entries(bindings)) {
      if (EVENT_KEYS.has(k)) events[k] = v;
      else attrs[k] = v;
    }
    return {
      attrs: Object.keys(attrs).length ? attrs : undefined,
      events: Object.keys(events).length ? events : undefined,
    };
  }
```

- [ ] **Step 4: Run — should pass**

Expected: all 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts
git commit -m "feat(code-emitter): SemanticIRBuilder splits attrs and events"
```

### Task 2.3: State normalization

- [ ] **Step 1: Add failing tests**

Append to test file:

```ts
  describe("state normalization", () => {
    it("removes setter field", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { stateVars: [{ name: "open", setter: "setOpen", initialValue: "false" }] }
      ));
      expect(ir.state).toEqual([
        { name: "open", initialValue: "false", mutability: "mutable" },
      ]);
      // setter is gone
      expect((ir.state[0] as any).setter).toBeUndefined();
    });

    it("undefined stateVars becomes empty array", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
      ));
      expect(ir.state).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run — already passes** (normalizeState was already implemented in 2.1)

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts
git commit -m "test(code-emitter): SemanticIRBuilder state normalization"
```

### Task 2.4: Style / bindings.style / bindings.content / visibleCondition pass-through

- [ ] **Step 1: Add failing tests**

Append:

```ts
  describe("pass-through fields", () => {
    it("passes styles by reference (no mutation, identity preserved)", () => {
      const styles = { base: { color: "red" }, dynamic: [] } as any;
      const node = {
        id: "n", name: "x", type: "container", children: [], styles,
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.styles).toBe(styles);
    });

    it("passes content binding", () => {
      const node = {
        id: "n", name: "x", type: "text", children: [],
        bindings: { content: { prop: "label" } },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.content).toEqual({ prop: "label" });
    });

    it("passes visibleCondition unchanged", () => {
      const cond = { type: "eq", prop: "size", value: "lg" } as any;
      const node = {
        id: "n", name: "x", type: "container", children: [],
        visibleCondition: cond,
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.visibleCondition).toBe(cond);
    });
  });
```

- [ ] **Step 2: Update `buildNode` to wire pass-through fields**

Replace `buildNode` in `SemanticIRBuilder.ts`:

```ts
  private static buildNode(n: UINode): SemanticNode {
    const { attrs, events } = this.splitAttrsAndEvents(n.bindings?.attrs);
    const node: SemanticNode = {
      id: n.id,
      kind: n.type as SemanticNode["kind"],
      name: n.name,
      attrs,
      events,
      styles: n.styles,
      content: n.bindings?.content,
      visibleCondition: n.visibleCondition,
      semanticType: n.semanticType,
    };

    // Recurse into children for any node that has them
    if ("children" in n && Array.isArray((n as any).children)) {
      node.children = (n as any).children.map((c: UINode) => this.buildNode(c));
    }

    // Copy kind-specific extras (vector, component, container loop, etc.)
    const anyN = n as any;
    if (anyN.vectorSvg !== undefined) node.vectorSvg = anyN.vectorSvg;
    if (anyN.variantSvgs !== undefined) node.variantSvgs = anyN.variantSvgs;
    if (anyN.refId !== undefined) node.refId = anyN.refId;
    if (anyN.overrideProps !== undefined) node.overrideProps = anyN.overrideProps;
    if (anyN.overrideMeta !== undefined) node.overrideMeta = anyN.overrideMeta;
    if (anyN.instanceScale !== undefined) node.instanceScale = anyN.instanceScale;
    if (anyN.loop !== undefined) node.loop = anyN.loop;
    if (anyN.childrenSlot !== undefined) node.childrenSlot = anyN.childrenSlot;

    return node;
  }
```

Note: `bindings.style` is NOT yet preserved (no `SemanticNode.styleBindings` field). Decide in Step 3 whether to add it.

- [ ] **Step 3: Add `styleBindings?` field if needed**

Check existing usage:

Run: `Grep "bindings\.style" src/frontend/ui/domain/code-generator2/layers/code-emitter`
If JsxGenerator or StylesGenerator references `bindings.style` for inline-style emission, add to `SemanticNode`:

```ts
  styleBindings?: Record<string, BindingSource>;
```

And in `buildNode`:

```ts
    if (n.bindings?.style) node.styleBindings = n.bindings.style;
```

Add a test:

```ts
    it("passes bindings.style as styleBindings", () => {
      const node = {
        id: "n", name: "x", type: "container", children: [],
        bindings: { style: { background: { prop: "bg" } } },
      } as unknown as UINode;
      const ir = SemanticIRBuilder.build(makeTree(node));
      expect(ir.structure.styleBindings).toEqual({ background: { prop: "bg" } });
    });
```

- [ ] **Step 4: Run — should pass**

Expected: all tests in this group pass.

- [ ] **Step 5: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR.ts
git commit -m "feat(code-emitter): SemanticIRBuilder passes styles, bindings, conditions, children"
```

### Task 2.5: Component-level meta pass-through

- [ ] **Step 1: Add tests**

```ts
  describe("component meta", () => {
    it("passes props array by reference", () => {
      const props = [{ name: "size", type: "variant", required: false, sourceKey: "Size", options: ["sm","lg"] }] as any;
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { props }
      ));
      expect(ir.props).toBe(props);
    });

    it("passes arraySlots", () => {
      const arraySlots = [{ parentId: "p", nodeIds: ["a","b"], slotName: "items" }] as any;
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { arraySlots }
      ));
      expect(ir.arraySlots).toBe(arraySlots);
    });

    it("passes componentType and isDependency", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { componentType: "button", isDependency: true }
      ));
      expect(ir.componentType).toBe("button");
      expect(ir.isDependency).toBe(true);
    });

    it("passes derivedVars as derived", () => {
      const dv = [{ name: "state", expression: "checked ? \"On\" : \"Off\"" }];
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
        { derivedVars: dv }
      ));
      expect(ir.derived).toBe(dv);
    });
  });
```

- [ ] **Step 2: Run — should pass** (already implemented)

- [ ] **Step 3: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts
git commit -m "test(code-emitter): SemanticIRBuilder component meta pass-through"
```

### Task 2.6: Mutation prevention

- [ ] **Step 1: Add the test**

```ts
  describe("mutation prevention", () => {
    it("does not mutate the input UITree", () => {
      const uiTree = makeTree(
        {
          id: "n", name: "x", type: "container",
          bindings: { attrs: { onClick: { prop: "onClick" }, type: { prop: "type" } } },
          children: [
            { id: "c1", name: "y", type: "text", children: [] } as any,
          ],
        } as unknown as UINode,
        {
          props: [{ name: "size", type: "variant", required: false, sourceKey: "Size", options: ["sm"] }] as any,
          stateVars: [{ name: "open", setter: "setOpen", initialValue: "false" }],
        }
      );
      const snapshot = JSON.parse(JSON.stringify(uiTree));
      SemanticIRBuilder.build(uiTree);
      expect(JSON.parse(JSON.stringify(uiTree))).toEqual(snapshot);
    });
  });
```

- [ ] **Step 2: Run**

Expected: PASS (no mutation occurs in current implementation).

- [ ] **Step 3: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts
git commit -m "test(code-emitter): SemanticIRBuilder does not mutate input"
```

### Task 2.7: Edge cases

- [ ] **Step 1: Add boundary tests**

```ts
  describe("edge cases", () => {
    it("handles empty children array", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
      ));
      expect(ir.structure.children).toEqual([]);
    });

    it("handles deeply nested trees", () => {
      const leaf = { id: "leaf", name: "l", type: "text", children: [] } as any;
      const mk = (depth: number, child: any): any =>
        depth === 0 ? child : mk(depth - 1, { id: `n${depth}`, name: "x", type: "container", children: [child] });
      const root = mk(5, leaf);
      const ir = SemanticIRBuilder.build(makeTree(root));
      // Walk to leaf
      let cur: any = ir.structure;
      for (let i = 0; i < 5; i++) cur = cur.children?.[0];
      expect(cur.kind).toBe("text");
    });

    it("handles undefined bindings", () => {
      const ir = SemanticIRBuilder.build(makeTree(
        { id: "n", name: "x", type: "container", children: [] } as unknown as UINode,
      ));
      expect(ir.structure.attrs).toBeUndefined();
      expect(ir.structure.events).toBeUndefined();
      expect(ir.structure.content).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts
git commit -m "test(code-emitter): SemanticIRBuilder edge cases"
```

### Task 2.8: Fixture round-trip smoke test

- [ ] **Step 1: Add a fixture-based smoke test**

```ts
import taptapButton from "../fixtures/button/taptapButton.json";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";

  describe("fixture round-trip", () => {
    it("builds an IR from a real fixture without throwing and preserves component name", () => {
      const dm = new DataManager(taptapButton as any);
      const tb = new TreeBuilder(dm);
      const uiTree = tb.build((taptapButton as any).info.document);

      const ir = SemanticIRBuilder.build(uiTree);

      expect(ir.name).toBeTruthy();
      expect(ir.structure).toBeDefined();
      expect(ir.props).toBe(uiTree.props);
    });
  });
```

- [ ] **Step 2: Run all SemanticIRBuilder tests**

Run: `npx vitest run test/code-emitter/semantic-ir-builder.test.ts`
Expected: PASS, all 30+ tests.

- [ ] **Step 3: Commit**

```bash
git add -u test/code-emitter/semantic-ir-builder.test.ts
git commit -m "test(code-emitter): SemanticIRBuilder fixture round-trip"
```

---

## Phase 3: Internal Scaffold inside ReactEmitter

Goal: Make `ReactEmitter` internally use `SemanticComponent` while keeping the external `emit(uiTree)` signature unchanged. This unblocks gradual refactoring of generators without breaking call sites.

### Task 3.1: Inject SemanticIRBuilder.build at top of emit()

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts`

- [ ] **Step 1: Add import**

At the top of `ReactEmitter.ts`:

```ts
import { SemanticIRBuilder } from "../SemanticIRBuilder";
import type { SemanticComponent } from "../SemanticIR";
```

- [ ] **Step 2: Build IR inside emit() but keep current generators on UITree**

Find `emit(uiTree: UITree)` (around line 92). At the top of the method body, after `renameNativeProps`, add:

```ts
  async emit(uiTree: UITree): Promise<EmittedCode> {
    const renamedTree = this.renameNativeProps(uiTree);
    // Phase 1 scaffold: build the IR alongside. Generators still consume renamedTree.
    // Will become the only input once Phase 7-8 migrates generators and Phase 8 flips the signature.
    const ir = SemanticIRBuilder.build(renamedTree);
    void ir;

    const componentName = toComponentName(renamedTree.root.name);
    const sections = this.generateAllSections(renamedTree, componentName);
    const code = await this.assembleAndFormat(sections);

    return {
      code,
      componentName,
      fileExtension: ".tsx",
      diagnostics: sections.diagnostics,
    };
  }
```

- [ ] **Step 3: Run all emitter tests — output must be byte-identical**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: PASS, no fixture diff.

- [ ] **Step 4: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts
git commit -m "refactor(code-emitter): build SemanticIR inside ReactEmitter (scaffold, no behavior change)"
```

---

## Phase 4: BindingRenderer (TDD extraction)

### Task 4.1: Locate existing binding-to-expression logic

- [ ] **Step 1: Find where BindingSource is rendered to a string in JsxGenerator**

Run: `Grep "\"prop\" in" src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`
Run: `Grep "\\.prop" src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`

Note the locations. There may be 2-3 helper sites that produce expressions like `props.x` or `x` from a `BindingSource`.

- [ ] **Step 2: Document the discovered patterns** in a scratch comment in your editor (do not commit). Identify the canonical transformation:
  - `{ prop: "x" }` → `"x"` (destructured local variable)
  - `{ ref: "Foo" }` → `"Foo"` (literal external reference)
  - `{ expr: "a + b" }` → `"a + b"` (escape hatch)

### Task 4.2: Create BindingRenderer with TDD

**Files:**
- Create: `test/code-emitter/binding-renderer.test.ts`
- Create: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/BindingRenderer.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { BindingRenderer } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/BindingRenderer";

describe("BindingRenderer.toExpression", () => {
  it("renders prop binding as the variable name", () => {
    expect(BindingRenderer.toExpression({ prop: "size" })).toBe("size");
  });

  it("renders ref binding as the literal reference", () => {
    expect(BindingRenderer.toExpression({ ref: "Constants.MAX" })).toBe("Constants.MAX");
  });

  it("renders expr binding as the raw expression", () => {
    expect(BindingRenderer.toExpression({ expr: "checked && !disabled" }))
      .toBe("checked && !disabled");
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run test/code-emitter/binding-renderer.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement BindingRenderer**

```ts
/**
 * BindingRenderer
 *
 * Renders a BindingSource into a JS expression string, suitable for embedding
 * in JSX attribute values, ternary operands, etc.
 *
 * Pure function. No state, no side effects.
 */

import type { BindingSource } from "../../../../types/types";

export class BindingRenderer {
  static toExpression(source: BindingSource): string {
    if ("prop" in source) return source.prop;
    if ("ref" in source) return source.ref;
    if ("expr" in source) return source.expr;
    // Exhaustiveness guard
    const _exhaustive: never = source;
    throw new Error(`Unknown BindingSource: ${JSON.stringify(_exhaustive)}`);
  }
}
```

- [ ] **Step 4: Run — pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/code-emitter/binding-renderer.test.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/BindingRenderer.ts
git commit -m "feat(code-emitter): add BindingRenderer"
```

### Task 4.3: Replace BindingSource → string sites in JsxGenerator with BindingRenderer

- [ ] **Step 1: Find all sites in JsxGenerator that turn BindingSource into a string**

Run: `Grep -n "in source|in binding|\"prop\" in|\"ref\" in|\"expr\" in" src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`

- [ ] **Step 2: Replace each call site with `BindingRenderer.toExpression(...)`**

Add at top:

```ts
import { BindingRenderer } from "./BindingRenderer";
```

For every site that does ad-hoc switching on `"prop" in src` etc. and produces a string, replace with one `BindingRenderer.toExpression(src)` call.

- [ ] **Step 3: Run all emitter tests — output must be byte-identical**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts
git commit -m "refactor(code-emitter): JsxGenerator delegates BindingSource rendering to BindingRenderer"
```

---

## Phase 5: ConditionRenderer (TDD extraction)

### Task 5.1: Create ConditionRenderer with TDD

**Files:**
- Create: `test/code-emitter/condition-renderer.test.ts`
- Create: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ConditionRenderer.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { ConditionRenderer } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ConditionRenderer";

describe("ConditionRenderer.toJs", () => {
  it("eq with string value", () => {
    expect(ConditionRenderer.toJs({ type: "eq", prop: "size", value: "lg" }))
      .toBe('size === "lg"');
  });

  it("eq with boolean value", () => {
    expect(ConditionRenderer.toJs({ type: "eq", prop: "checked", value: true }))
      .toBe("checked === true");
  });

  it("eq with number value", () => {
    expect(ConditionRenderer.toJs({ type: "eq", prop: "count", value: 3 }))
      .toBe("count === 3");
  });

  it("neq", () => {
    expect(ConditionRenderer.toJs({ type: "neq", prop: "size", value: "lg" }))
      .toBe('size !== "lg"');
  });

  it("truthy", () => {
    expect(ConditionRenderer.toJs({ type: "truthy", prop: "leftIcon" }))
      .toBe("leftIcon");
  });

  it("not", () => {
    expect(ConditionRenderer.toJs({ type: "not", condition: { type: "truthy", prop: "x" } }))
      .toBe("!(x)");
  });

  it("and", () => {
    expect(ConditionRenderer.toJs({
      type: "and",
      conditions: [
        { type: "truthy", prop: "a" },
        { type: "eq", prop: "b", value: "1" },
      ],
    })).toBe('(a) && (b === "1")');
  });

  it("or", () => {
    expect(ConditionRenderer.toJs({
      type: "or",
      conditions: [
        { type: "truthy", prop: "a" },
        { type: "truthy", prop: "b" },
      ],
    })).toBe("(a) || (b)");
  });

  it("nested", () => {
    expect(ConditionRenderer.toJs({
      type: "and",
      conditions: [
        { type: "not", condition: { type: "truthy", prop: "disabled" } },
        { type: "eq", prop: "state", value: "Hover" },
      ],
    })).toBe('(!(disabled)) && (state === "Hover")');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement ConditionRenderer**

```ts
/**
 * ConditionRenderer
 *
 * Renders a ConditionNode into a JS condition string. Pure function.
 *
 * Note: parentheses are added per branch to keep precedence safe regardless
 * of nesting. Surface formatting (collapsing redundant parens) is the formatter's job.
 */

import type { ConditionNode } from "../../../../types/types";

export class ConditionRenderer {
  static toJs(node: ConditionNode): string {
    switch (node.type) {
      case "eq":
        return `${node.prop} === ${this.literal(node.value)}`;
      case "neq":
        return `${node.prop} !== ${this.literal(node.value)}`;
      case "truthy":
        return node.prop;
      case "not":
        return `!(${this.toJs(node.condition)})`;
      case "and":
        return node.conditions.map((c) => `(${this.toJs(c)})`).join(" && ");
      case "or":
        return node.conditions.map((c) => `(${this.toJs(c)})`).join(" || ");
      default: {
        const _exhaustive: never = node;
        throw new Error(`Unknown ConditionNode: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  private static literal(value: string | boolean | number): string {
    if (typeof value === "string") return `"${value}"`;
    return String(value);
  }
}
```

- [ ] **Step 4: Run — pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/code-emitter/condition-renderer.test.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ConditionRenderer.ts
git commit -m "feat(code-emitter): add ConditionRenderer"
```

### Task 5.2: Replace JsxGenerator's `conditionToCode` with ConditionRenderer

- [ ] **Step 1: Find `conditionToCode` and any equivalent helpers**

Run: `Grep -n "conditionToCode" src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`

- [ ] **Step 2: Compare output format**

Read the existing implementation. **Critical:** if the existing format differs (e.g., uses different parenthesization), `ConditionRenderer.toJs` MUST be adjusted to match — keeping the output byte-identical is the contract.

If output differs, update `ConditionRenderer.toJs` and add tests for the existing format. Re-run tests until matching.

- [ ] **Step 3: Replace all call sites**

In JsxGenerator, add:

```ts
import { ConditionRenderer } from "./ConditionRenderer";
```

Replace `this.conditionToCode(...)` calls with `ConditionRenderer.toJs(...)`. Delete the now-unused `conditionToCode` method.

- [ ] **Step 4: Run all emitter tests — byte-identical output**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts
git commit -m "refactor(code-emitter): JsxGenerator delegates condition rendering to ConditionRenderer"
```

---

## Phase 6: NodeRenderer extraction

This is a pure refactor. The goal is to move the recursive node rendering logic out of `JsxGenerator` into a dedicated `NodeRenderer`, while keeping `JsxGenerator` as a thin orchestrator.

**Critical constraint:** Output must remain byte-identical. The fixture tests are the safety net.

### Task 6.1: Identify the methods that move to NodeRenderer

- [ ] **Step 1: List the methods in JsxGenerator that take a UINode and return JSX**

Run: `Grep -n "private static generate\\w+Node|private static generateInputElement|private static generateSlotWrapper|private static generateArraySlotMap|private static generateNodeInner" src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`

Expected to find at least:
- `generateNode`
- `generateNodeInner`
- `generateContainerNode`
- `generateTextNode`
- `generateComponentNode`
- `generateVectorNode`
- `generateInputElement`
- `generateSlotWrapper`
- `generateArraySlotMap`
- `getSlotPropFromCondition` (helper)

Document the list. These move to `NodeRenderer`.

### Task 6.2: Create NodeRenderer skeleton

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts`

- [ ] **Step 1: Create the skeleton with shared state**

```ts
/**
 * NodeRenderer
 *
 * Recursive UINode -> JSX rendering. Extracted from JsxGenerator (Phase 1
 * SemanticIR migration). Currently consumes UINode; will switch to SemanticNode
 * after Phase 7-8.
 */

import type {
  UINode, ContainerNode, ButtonNode, InputNode, LinkNode, ComponentNode,
  ConditionNode, ArraySlotInfo, VariantInconsistency,
} from "../../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { BindingRenderer } from "./BindingRenderer";
import { ConditionRenderer } from "./ConditionRenderer";

export interface NodeRendererContext {
  styleStrategy: IStyleStrategy;
  debug: boolean;
  nodeStyleMap: Map<string, string>;
  slotProps: Set<string>;
  booleanProps: Set<string>;
  booleanWithExtras: Set<string>;
  propRenameMap: Map<string, string>;
  arraySlots: Map<string, ArraySlotInfo>;
  availableVarNames: Set<string>;
  componentMapDeclarations: string[];
  collectedDiagnostics: VariantInconsistency[];
}

export class NodeRenderer {
  // Methods will be moved here in Task 6.3.
  // Each method takes (ctx: NodeRendererContext, node: UINode, indent: number, isRoot?: boolean)
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts
git commit -m "feat(code-emitter): NodeRenderer skeleton"
```

### Task 6.3: Move recursive methods from JsxGenerator into NodeRenderer

This is a large mechanical refactor. Do it in one task because the methods reference each other tightly.

- [ ] **Step 1: Move `generateNode`, `generateNodeInner`, and all `generate*Node` / helper methods into `NodeRenderer`**

For each method:
1. Cut from JsxGenerator.
2. Paste into NodeRenderer.
3. Convert from `private static` to `static`.
4. Replace references to `this.X` (where `X` is shared state) with `ctx.X`.
5. Replace references to `this.someMethod(...)` with `NodeRenderer.someMethod(ctx, ...)`.

Methods to move:
- `generateNode(ctx, node, indent, isRoot?)`
- `generateNodeInner(ctx, node, indent, isRoot?)`
- `generateContainerNode(ctx, node, indent, isRoot?)`
- `generateTextNode(ctx, node, indent)`
- `generateComponentNode(ctx, node, indent)`
- `generateVectorNode(ctx, node, indent)`
- `generateInputElement(ctx, node, indent)`
- `generateSlotWrapper(ctx, node, slotProp, indent, extraCondition?)`
- `generateArraySlotMap(ctx, arraySlot, parentNode, indent)`
- `getSlotPropFromCondition(ctx, condition)` (helper — uses `ctx.slotProps`)

- [ ] **Step 2: In `JsxGenerator.generate(...)`, build the context object and call `NodeRenderer.generateNode(ctx, root, 2, true)`**

```ts
import { NodeRenderer, type NodeRendererContext } from "./NodeRenderer";
```

In `JsxGenerator.generate`, replace the JSX body line with:

```ts
    const ctx: NodeRendererContext = {
      styleStrategy,
      debug: options.debug ?? false,
      nodeStyleMap: this.nodeStyleMap,
      slotProps: this.slotProps,
      booleanProps: this.booleanProps,
      booleanWithExtras: this.booleanWithExtras,
      propRenameMap: this.propRenameMap,
      arraySlots: this.arraySlots,
      availableVarNames: this.availableVarNames,
      componentMapDeclarations: this.componentMapDeclarations,
      collectedDiagnostics: this.collectedDiagnostics,
    };
    const jsxBody = NodeRenderer.generateNode(ctx, uiTree.root, 2, true);
```

After the body is generated, copy back any mutated state:

```ts
    // NodeRenderer mutates ctx.componentMapDeclarations and ctx.collectedDiagnostics
    this.componentMapDeclarations = ctx.componentMapDeclarations;
    this.collectedDiagnostics = ctx.collectedDiagnostics;
```

- [ ] **Step 3: Run all emitter + compiler tests**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: PASS, byte-identical output. **If any fixture diff appears, do not proceed — debug the extraction.**

- [ ] **Step 4: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts
git commit -m "refactor(code-emitter): extract NodeRenderer from JsxGenerator"
```

### Task 6.4: Smoke test for NodeRenderer

**Files:**
- Create: `test/code-emitter/node-renderer.test.ts`

- [ ] **Step 1: Write minimal smoke tests**

```ts
import { describe, it, expect } from "vitest";
import { NodeRenderer, type NodeRendererContext } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer";
import { EmotionStrategy } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/EmotionStrategy";
import type { UINode } from "@frontend/ui/domain/code-generator2/types/types";

function ctx(): NodeRendererContext {
  return {
    styleStrategy: new EmotionStrategy(),
    debug: false,
    nodeStyleMap: new Map(),
    slotProps: new Set(),
    booleanProps: new Set(),
    booleanWithExtras: new Set(),
    propRenameMap: new Map(),
    arraySlots: new Map(),
    availableVarNames: new Set(),
    componentMapDeclarations: [],
    collectedDiagnostics: [],
  };
}

describe("NodeRenderer", () => {
  it("renders a simple text node", () => {
    const node = {
      id: "n1", name: "label", type: "text",
      textSegments: [{ text: "Hello" }],
    } as unknown as UINode;
    const out = NodeRenderer.generateNode(ctx(), node, 0, false);
    expect(out).toContain("Hello");
  });

  it("wraps a node with visibleCondition", () => {
    const node = {
      id: "n1", name: "x", type: "container", children: [],
      visibleCondition: { type: "truthy", prop: "show" },
    } as unknown as UINode;
    const out = NodeRenderer.generateNode(ctx(), node, 0, false);
    expect(out).toMatch(/show && \(/);
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run test/code-emitter/node-renderer.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/code-emitter/node-renderer.test.ts
git commit -m "test(code-emitter): NodeRenderer smoke tests"
```

---

## Phase 7: Generator input type migration

Switch `PropsGenerator`, `StylesGenerator`, `ImportsGenerator`, and `NodeRenderer` to consume `SemanticComponent` / `SemanticNode` instead of `UITree` / `UINode`. The internal `ReactEmitter` scaffold (Phase 3) means we already have an IR available — we now wire it through.

### Task 7.1: PropsGenerator → SemanticComponent

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/PropsGenerator.ts`

- [ ] **Step 1: Change input type and field access**

```ts
import type { SemanticComponent } from "../../SemanticIR";

  static generate(ir: SemanticComponent, componentName: string): string {
    const props = ir.props;
    const rootKind = ir.structure.kind;
    const nativeAttrsType = NATIVE_ATTRS_TYPE[rootKind];
    // ...rest unchanged, replace any other uiTree.X with ir.X
  }
```

Search the file for `uiTree.` and replace each with `ir.` (most should map 1:1 since `SemanticComponent` mirrors `UITree`'s public surface).

Update inner helpers to take `ir: SemanticComponent` where they previously took `uiTree: UITree`.

- [ ] **Step 2: Update ReactEmitter to pass IR to PropsGenerator**

In `ReactEmitter.generateAllSections`, change the PropsGenerator call:

```ts
    const propsInterface = PropsGenerator.generate(ir, componentName);
```

You will need to plumb `ir` into `generateAllSections`. For now, build it in `emit()` and pass it down — the scaffold is already building it.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: PASS, byte-identical.

- [ ] **Step 4: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/PropsGenerator.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts
git commit -m "refactor(code-emitter): PropsGenerator consumes SemanticComponent"
```

### Task 7.2: StylesGenerator → SemanticComponent

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/StylesGenerator.ts`

- [ ] **Step 1: Change input type**

```ts
import type { SemanticComponent, SemanticNode } from "../../SemanticIR";

  static generate(
    ir: SemanticComponent,
    componentName: string,
    styleStrategy: IStyleStrategy
  ): StylesGeneratorResult { ... }
```

Replace `uiTree.props` → `ir.props`, `uiTree.root` → `ir.structure`, `uiTree.stateVars` → `ir.state`, `uiTree.isDependency` → `ir.isDependency`. Update internal recursion helpers from `UINode` to `SemanticNode` (the field shapes match for everything StylesGenerator reads).

- [ ] **Step 2: Update ReactEmitter call site**

```ts
    const stylesResult = StylesGenerator.generate(ir, componentName, this.styleStrategy);
```

- [ ] **Step 3: Run tests**

Expected: byte-identical.

- [ ] **Step 4: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/StylesGenerator.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts
git commit -m "refactor(code-emitter): StylesGenerator consumes SemanticComponent"
```

### Task 7.3: ImportsGenerator → SemanticComponent

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ImportsGenerator.ts`

- [ ] **Step 1: Change input type**

```ts
import type { SemanticComponent, SemanticNode } from "../../SemanticIR";

  static generate(ir: SemanticComponent, styleStrategy: IStyleStrategy): string {
    const imports: string[] = [];
    if (ir.state.length) {
      imports.push('import React, { useState } from "react";');
    } else {
      imports.push('import React from "react";');
    }
    imports.push(...styleStrategy.getImports());
    const externalComponents = this.collectExternalComponents(ir.structure);
    for (const component of externalComponents) {
      imports.push(`import { ${component} } from "./${component}";`);
    }
    return imports.join("\n");
  }

  private static collectExternalComponents(node: SemanticNode): Set<string> {
    const components = new Set<string>();
    if (node.kind === "component") {
      const componentName = toComponentName(node.name ?? "");
      components.add(componentName);
    }
    if (node.children) {
      for (const child of node.children) {
        const childComponents = this.collectExternalComponents(child);
        childComponents.forEach((c) => components.add(c));
      }
    }
    return components;
  }
```

- [ ] **Step 2: Update ReactEmitter call site**

```ts
    const rawImports = ImportsGenerator.generate(ir, this.styleStrategy);
```

- [ ] **Step 3: Run tests**

Expected: byte-identical.

- [ ] **Step 4: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ImportsGenerator.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts
git commit -m "refactor(code-emitter): ImportsGenerator consumes SemanticComponent"
```

### Task 7.4: JsxGenerator + NodeRenderer → SemanticComponent / SemanticNode

This is the largest single migration in this phase. The recursive renderer must be updated to read `SemanticNode` fields.

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts`
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts`

- [ ] **Step 1: Update JsxGenerator.generate signature**

```ts
import type { SemanticComponent } from "../../SemanticIR";

  static generate(
    ir: SemanticComponent,
    componentName: string,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions = {}
  ): JsxGenerateResult { ... }
```

Inside, replace:
- `uiTree.props` → `ir.props`
- `uiTree.stateVars` → `ir.state`
- `uiTree.derivedVars` → `ir.derived`
- `uiTree.arraySlots` → `ir.arraySlots`
- `uiTree.root` → `ir.structure`
- Iteration over state vars: `useState(${sv.initialValue})` — note that `StateDefinition` has no `setter`. Derive the setter name inline using a helper at module top:

```ts
function setterFor(stateName: string): string {
  return "set" + stateName.charAt(0).toUpperCase() + stateName.slice(1);
}
```

Then in the generator:

```ts
const stateVarsCode = ir.state.length
  ? ir.state.map((sv) =>
      `  const [${sv.name}, ${setterFor(sv.name)}] = useState(${sv.initialValue});`
    ).join("\n") + "\n"
  : "";
```

This matches what `StateVar.setter` used to contain (per Layer 2 convention — verify against Layer 2's `stateVars` outputs).

- [ ] **Step 2: Update NodeRenderer to take SemanticNode**

Replace all `UINode` types with `SemanticNode`. Replace all `node.type` with `node.kind`. Replace `node.bindings?.attrs` with separate `node.attrs` and `node.events`. Replace `node.bindings?.content` with `node.content`. Replace `node.bindings?.style` with `node.styleBindings`.

For each event handler (e.g., onClick), source it from `node.events?.onClick` instead of `node.bindings?.attrs?.onClick`.

This is the bulk of the file. Take it method-by-method.

- [ ] **Step 3: Update ReactEmitter to pass IR to JsxGenerator**

```ts
    const jsxResult = JsxGenerator.generate(ir, componentName, this.styleStrategy, {
      debug: this.options.debug,
      nodeStyleMap: stylesResult.nodeStyleMap,
    });
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: byte-identical. **This is the highest-risk task — debug aggressively if any diff appears.**

- [ ] **Step 5: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts
git commit -m "refactor(code-emitter): JsxGenerator and NodeRenderer consume SemanticComponent"
```

---

## Phase 8: Flip the public signature

All internal generators now consume `SemanticComponent`. Time to remove the temporary scaffold and update all call sites.

### Task 8.1: Update ICodeEmitter interface

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/ICodeEmitter.ts`

- [ ] **Step 1: Change method signatures**

```ts
import type { SemanticComponent } from "./SemanticIR";

export interface ICodeEmitter {
  readonly framework: string;

  emit(ir: SemanticComponent): Promise<EmittedCode>;

  emitAll(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<GeneratedResult>;

  emitBundled(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<BundledResult>;
}
```

Remove the `import type { UITree, ... } from "../../types/types"` line if no longer needed (`VariantInconsistency` may still be imported separately).

- [ ] **Step 2: TypeScript will surface every mismatch**

Run: `npx tsc --noEmit`

Expected: errors in `ReactEmitter.ts`, `FigmaCodeGenerator.ts`, and the 4 test files. Each one will be fixed in subsequent tasks.

### Task 8.2: ReactEmitter — remove scaffold, accept IR

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts`

- [ ] **Step 1: Update emit() signature and remove scaffold**

```ts
  async emit(ir: SemanticComponent): Promise<EmittedCode> {
    const componentName = ir.name;
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

Remove `renameNativeProps`'s call site here — see Step 2 for what to do with it.

- [ ] **Step 2: Move `renameNativeProps` to operate on `SemanticComponent`**

The current `renameNativeProps` JSON-stringifies `UITree` and string-replaces. The IR equivalent should rename props on the IR. The cleanest path:

1. Detect `nativeAttrs` for `ir.structure.kind`.
2. Find `prop` definitions whose `name` collides with native attrs and lack `nativeAttribute: true`.
3. Build a rename map.
4. Walk `ir.structure` (and rename in `attrs`/`events`/`styleBindings` `BindingSource.prop` references).
5. Rename prop definitions themselves.
6. Return a new `SemanticComponent` (do not mutate the input — `SemanticIRBuilder` makes the IR but downstream may reuse).

Implement this as `private renameNativeProps(ir: SemanticComponent): SemanticComponent` and call it at the top of `emit()`:

```ts
  async emit(ir: SemanticComponent): Promise<EmittedCode> {
    const renamed = this.renameNativeProps(ir);
    const componentName = renamed.name;
    const sections = this.generateAllSections(renamed, componentName);
    const code = await this.assembleAndFormat(sections);
    return { code, componentName, fileExtension: ".tsx", diagnostics: sections.diagnostics };
  }
```

This is the trickiest part of Phase 8. Reference the existing `renameNativeProps` in the file for the rename rules.

- [ ] **Step 3: Update emitAll signature**

```ts
  async emitAll(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<GeneratedResult> {
    const mainCode = await this.emit(main);
    const depCodes = new Map<string, EmittedCode>();
    const emittedCache = new Map<SemanticComponent, EmittedCode>();
    for (const [depId, depIR] of deps) {
      if (!emittedCache.has(depIR)) {
        emittedCache.set(depIR, await this.emit(depIR));
      }
      depCodes.set(depId, emittedCache.get(depIR)!);
    }
    return { main: mainCode, dependencies: depCodes };
  }
```

- [ ] **Step 4: Update emitBundled signature**

```ts
  async emitBundled(
    main: SemanticComponent,
    deps: Map<string, SemanticComponent>
  ): Promise<BundledResult> {
    const filteredDeps = this.filterSlotDependencies(main, deps);
    this.propagateVariantOptions(main, filteredDeps);
    this.propagateNativeRenames(main, filteredDeps);
    const result = await this.emitAll(main, filteredDeps);
    // ...rest unchanged
  }
```

- [ ] **Step 5: Adapt `filterSlotDependencies`, `propagateVariantOptions`, `propagateNativeRenames` to operate on `SemanticComponent`**

Each currently walks `UITree.props` and `UINode` children. The migration is mostly mechanical:
- `prop.type === "slot"` and `componentId` lookup — same on `SemanticComponent.props` (`PropDefinition` is unchanged).
- Walk `SemanticComponent.structure` instead of `uiTree.root`. Use `node.kind === "component"` instead of `node.type === "component"`.
- Bindings: `node.bindings?.attrs` no longer exists. Use `node.attrs` (and `node.events` if any are component bindings).
- `propagateNativeRenames` walks dep `node.kind` — unchanged structurally.

**Caution:** these methods currently mutate `PropDefinition.options` and `BooleanPropDefinition.extraValues` directly. Since `SemanticIRBuilder` passes `props` by reference, mutating IR `props` mutates the underlying objects. To avoid leaking mutation back to `UITree`, **shallow-clone the prop definitions before mutating** in `propagateVariantOptions`:

```ts
// Before mutating, replace dep.props with cloned variant props
dep.props = dep.props.map((p) => {
  if (p.type === "variant") {
    return { ...p, options: [...p.options] };
  }
  if (p.type === "boolean" && (p as any).extraValues?.length) {
    return { ...p, extraValues: [...(p as any).extraValues] };
  }
  return p;
});
```

But `SemanticComponent.props` is typed as `PropDefinition[]`, so reassigning `dep.props` requires that `SemanticComponent` be mutable (it is — interface, not Readonly).

Add tests for this isolation in Phase 9.

- [ ] **Step 6: Run tests**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: tests will fail in the call sites (`FigmaCodeGenerator`, test files) — those are Tasks 8.3-8.4. ReactEmitter itself should compile.

```bash
npx tsc --noEmit
```

Expected: errors only in call sites, not in ReactEmitter or its generators.

- [ ] **Step 7: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/layers/code-emitter/ICodeEmitter.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter.ts
git commit -m "refactor(code-emitter): ReactEmitter accepts SemanticComponent, scaffold removed"
```

### Task 8.3: FigmaCodeGenerator — build IR before emit calls

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts`

- [ ] **Step 1: Add import**

```ts
import { SemanticIRBuilder } from "./layers/code-emitter/SemanticIRBuilder";
```

- [ ] **Step 2: Update `generate()`**

```ts
  async generate(): Promise<GeneratedResult> {
    const { main, dependencies } = this.treeManager.build();
    const mainIR = SemanticIRBuilder.build(main);
    const depIRs = new Map<string, SemanticComponent>();
    for (const [id, dep] of dependencies) {
      depIRs.set(id, SemanticIRBuilder.build(dep));
    }
    return this.codeEmitter.emitAll(mainIR, depIRs);
  }
```

Add the import for `SemanticComponent`:

```ts
import type { SemanticComponent } from "./layers/code-emitter/SemanticIR";
```

- [ ] **Step 3: Update `emitCode()`**

```ts
  async emitCode(uiTree: UITree): Promise<EmittedCode> {
    const ir = SemanticIRBuilder.build(uiTree);
    return this.codeEmitter.emit(ir);
  }
```

- [ ] **Step 4: Update `compileWithDiagnostics()`**

```ts
      const { main, dependencies } = this.treeManager.build(diagnostics);
      const mainIR = SemanticIRBuilder.build(main);
      const depIRs = new Map<string, SemanticComponent>();
      for (const [id, dep] of dependencies) {
        depIRs.set(id, SemanticIRBuilder.build(dep));
      }
      const result = await this.codeEmitter.emitBundled(mainIR, depIRs);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/compiler/newPipeline.test.ts`
Expected: PASS (the test goes through `FigmaCodeGenerator`).

- [ ] **Step 6: Commit**

```bash
git add -u src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts
git commit -m "refactor(code-emitter): FigmaCodeGenerator builds SemanticIR before emit"
```

### Task 8.4: Update emitter test files

**Files:**
- Modify: `test/code-emitter/code-emitter.test.ts`
- Modify: `test/code-emitter/code-emitter-review.test.ts`
- Modify: `test/code-emitter/tailwind-strategy.test.ts`

For each file, repeat:

- [ ] **Step 1: Add import**

```ts
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";
```

- [ ] **Step 2: Insert one IR build line before each `emitter.emit(uiTree)` call**

Replace every:

```ts
    const result = await emitter.emit(uiTree);
```

with:

```ts
    const ir = SemanticIRBuilder.build(uiTree);
    const result = await emitter.emit(ir);
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run test/code-emitter test/compiler/newPipeline.test.ts`
Expected: PASS, all tests, byte-identical output.

- [ ] **Step 4: Commit**

```bash
git add -u test/code-emitter/code-emitter.test.ts test/code-emitter/code-emitter-review.test.ts test/code-emitter/tailwind-strategy.test.ts
git commit -m "test(code-emitter): tests build SemanticIR before calling emit"
```

---

## Phase 9: Verification

### Task 9.1: Full test run

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test`
Expected: PASS, all suites.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Run TypeScript build**

Run: `npx tsc --noEmit`
Expected: no errors.

### Task 9.2: Browser visual regression

- [ ] **Step 1: Run browser tests**

Run: `npm run test:browser`
Expected: PASS, no visual diffs.

If failures occur, investigate before proceeding — the IR migration should not change visual output of any fixture.

### Task 9.3: Mutation isolation regression test

- [ ] **Step 1: Add a regression test confirming `propagateVariantOptions` does not mutate the underlying UITree**

**Files:**
- Modify: `test/code-emitter/code-emitter.test.ts` (or new file)

```ts
it("emitBundled does not mutate the source UITree's prop options", async () => {
  const dm = new DataManager(taptapButton as any);
  const tb = new TreeBuilder(dm);
  const { main, dependencies } = tb.build((taptapButton as any).info.document);

  // Snapshot prop options before
  const snapshot = main.props.map((p) =>
    p.type === "variant" ? { name: p.name, options: [...(p as any).options] } : null
  );

  // Build IR and call emitBundled
  const mainIR = SemanticIRBuilder.build(main);
  const depIRs = new Map<string, any>();
  for (const [id, dep] of dependencies) depIRs.set(id, SemanticIRBuilder.build(dep));

  const emitter = new ReactEmitter();
  await emitter.emitBundled(mainIR, depIRs);

  // After
  const after = main.props.map((p) =>
    p.type === "variant" ? { name: p.name, options: [...(p as any).options] } : null
  );

  expect(after).toEqual(snapshot);
});
```

(Note: this requires `treeBuilder.build` returning `{ main, dependencies }` — adapt if it returns just the root.)

- [ ] **Step 2: Run**

Run: `npx vitest run test/code-emitter/code-emitter.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -u test/code-emitter/code-emitter.test.ts
git commit -m "test(code-emitter): regression — emitBundled does not mutate source UITree"
```

### Task 9.4: JsxGenerator size check

- [ ] **Step 1: Verify JsxGenerator is now substantially smaller**

Run: `wc -l src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/*.ts`

Expected: `JsxGenerator.ts` is now ~200-400 lines (down from 1452). `NodeRenderer.ts` carries the bulk.

If `JsxGenerator.ts` is still very large, identify the remaining large methods and consider whether they belong in NodeRenderer or another module. Do not aggressively over-decompose — the goal was the major refactor, not perfection.

### Task 9.5: Final check + sign-off

- [ ] **Step 1: Re-run full suite one more time**

Run: `npm run test && npm run lint && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Confirm no FIXME/TODO drift**

Run: `Grep "FIXME|TODO" src/frontend/ui/domain/code-generator2/layers/code-emitter`

Expected: only the intentional FIXME in `SemanticIRBuilder.ts` (the `derived.expression` debt). Any other new TODO/FIXME should be either resolved or filed as a follow-up.

- [ ] **Step 3: Final commit if needed**

If any cleanup remained:

```bash
git add -u
git commit -m "chore(code-emitter): final cleanup after SemanticIR migration"
```

---

## Done

At this point:
- `SemanticComponent` IR is in place as Layer 2.5.
- `ReactEmitter` consumes IR; output is byte-identical to before.
- `JsxGenerator` is decomposed into orchestrator + `NodeRenderer` + `BindingRenderer` + `ConditionRenderer`.
- All call sites (`FigmaCodeGenerator` + 4 test files) build IR before invoking the emitter.
- The known future debt (`derived.expression` JS string fallback) is documented in spec §10.1 and as a FIXME in `SemanticIRBuilder.ts`.

The next phase (out of scope for this plan) is implementing additional emitters (Vue, Svelte, SwiftUI, Compose) — each gets its own spec + plan.
