# Component Swap Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect INSTANCE swap variant pattern (variant prop별로 같은 슬롯에 다른 mainComponent를 swap) and add a NodeMatcher signal that uses the detected pattern to merge swapped INSTANCEs in VariantMerger.

**Architecture:** Pattern detection lives entirely in `DesignPatternDetector.detectComponentSwap()` (raw SceneNode → pattern). NodeMatcher signal `ComponentSwap` reads the pre-computed pattern from `metadata.designPatterns` and returns `decisive-match-with-cost` (0.05) — no detection logic in signal. Each swap-member INSTANCE gets its own pattern entry tagged with a shared `swapGroupId`, so pattern annotation reuses existing `nodeId`-based annotation flow without changes.

**Tech Stack:** TypeScript 5.3, Vitest, existing pipeline in `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/`.

**Spec:** `docs/superpowers/specs/2026-04-16-component-swap-detector-design.md`

---

## File Structure

**Create:**
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/ComponentSwap.ts` — new signal class
- `test/tree-builder/match-engine/signals/ComponentSwap.test.ts` — signal unit tests

**Modify:**
- `src/frontend/ui/domain/code-generator2/types/types.ts` — add `componentSwap` variant to `DesignPattern` union
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts` — add `detectComponentSwap()` method and call from COMPONENT_SET branch
- `test/compiler/design-pattern-detector.test.ts` — detector unit tests
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/index.ts` — register new signal

**Untouched (intentionally):**
- `BooleanPositionSwap.ts` — its in-signal pattern detection violates the responsibility split, but is out of scope for this plan (tracked separately in memory `feedback_detector_responsibility.md`).
- `VariantMerger.applyPatternAnnotations` — already handles `nodeId`-based patterns; the new pattern uses `nodeId` so no merger changes needed.

---

## Task 1: Add `componentSwap` to DesignPattern union

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts:99-106`

- [ ] **Step 1: Add union member**

Edit `src/frontend/ui/domain/code-generator2/types/types.ts` to add a new variant after the `exposedInstanceSlot` member of the `DesignPattern` union (just before the closing semicolon at line 106):

```typescript
  | {
      type: "exposedInstanceSlot";
      nodeId: string;
      instanceNodeId: string;
      visibleRef?: string;
    }
  /** variant prop value별로 같은 슬롯의 INSTANCE가 다른 mainComponent를 사용하는 swap 패턴.
   *  같은 swapGroupId를 가진 두 패턴은 서로 매칭 대상 (NodeMatcher의 ComponentSwap signal이 사용). */
  | {
      type: "componentSwap";
      /** 이 패턴이 부착된 swap-member INSTANCE의 nodeId */
      nodeId: string;
      /** 같은 swap 그룹의 INSTANCE들이 공유하는 식별자 (containerNodeId + prop으로 구성) */
      swapGroupId: string;
      /** swap을 결정하는 variant prop 이름 (정규화된 camelCase) */
      prop: string;
      /** 이 INSTANCE가 담당하는 prop value (예: "False", "iOS") */
      propValue: string;
      /** swap이 발생한 컨테이너의 nodeId (디버깅·검증용) */
      containerNodeId: string;
    };
```

- [ ] **Step 2: Verify type compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `DesignPattern`. Other unrelated errors in the codebase are tolerated only if they predate this change.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/types/types.ts
git commit -m "feat(types): add componentSwap to DesignPattern union"
```

---

## Task 2: Write failing detector unit tests

**Files:**
- Modify: `test/compiler/design-pattern-detector.test.ts` (append a new `describe` block)

- [ ] **Step 1: Add detector tests at end of file**

Append to `test/compiler/design-pattern-detector.test.ts`:

```typescript
describe("componentSwap", () => {
  it("two variants with same path INSTANCE but different componentId (single prop diff) → componentSwap pattern per swap member", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        Active: { type: "VARIANT", variantOptions: ["False", "True"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Active=False",
          children: [{
            id: "inst-false", type: "INSTANCE", name: "Switch",
            componentId: "comp-A",
            children: [],
          }],
        },
        {
          type: "COMPONENT", name: "Active=True",
          children: [{
            id: "inst-true", type: "INSTANCE", name: "Switch",
            componentId: "comp-B",
            children: [],
          }],
        },
      ],
    } as any;
    const patterns = detector.detect(node);
    const swaps = patterns.filter(p => p.type === "componentSwap");
    expect(swaps).toHaveLength(2);
    expect(swaps.map(p => (p as any).nodeId).sort()).toEqual(["inst-false", "inst-true"]);
    // both share swapGroupId
    const groupIds = new Set(swaps.map(p => (p as any).swapGroupId));
    expect(groupIds.size).toBe(1);
    // prop and propValue
    const byNode = Object.fromEntries(swaps.map(p => [(p as any).nodeId, p]));
    expect((byNode["inst-false"] as any).prop).toBe("active");
    expect((byNode["inst-false"] as any).propValue).toBe("False");
    expect((byNode["inst-true"] as any).propValue).toBe("True");
  });

  it("same componentId across variants → no componentSwap pattern", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        Active: { type: "VARIANT", variantOptions: ["False", "True"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Active=False",
          children: [{ id: "i1", type: "INSTANCE", name: "Switch", componentId: "comp-A", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=True",
          children: [{ id: "i2", type: "INSTANCE", name: "Switch", componentId: "comp-A", children: [] }],
        },
      ],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "componentSwap")).toHaveLength(0);
  });

  it("different name across variants → no componentSwap pattern (out of scope)", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        Active: { type: "VARIANT", variantOptions: ["False", "True"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Active=False",
          children: [{ id: "i1", type: "INSTANCE", name: "SwitchOff", componentId: "comp-A", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=True",
          children: [{ id: "i2", type: "INSTANCE", name: "SwitchOn", componentId: "comp-B", children: [] }],
        },
      ],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "componentSwap")).toHaveLength(0);
  });

  it("conditional INSTANCE (only present in some variants) → no componentSwap pattern", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        Icon: { type: "VARIANT", variantOptions: ["False", "True"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Icon=False",
          children: [],
        },
        {
          type: "COMPONENT", name: "Icon=True",
          children: [{ id: "i2", type: "INSTANCE", name: "Icon", componentId: "comp-A", children: [] }],
        },
      ],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "componentSwap")).toHaveLength(0);
  });

  it("componentId differs but no single prop determines swap → no pattern (multi-prop case out of scope)", () => {
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        Active: { type: "VARIANT", variantOptions: ["False", "True"] },
        Disable: { type: "VARIANT", variantOptions: ["False", "True"] },
      },
      children: [
        // Active=False/Disable=False uses comp-A
        // Active=True/Disable=False uses comp-B
        // Active=False/Disable=True uses comp-C  ← Disable also affects componentId
        // Active=True/Disable=True uses comp-D
        {
          type: "COMPONENT", name: "Active=False, Disable=False",
          children: [{ id: "i1", type: "INSTANCE", name: "Switch", componentId: "comp-A", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=True, Disable=False",
          children: [{ id: "i2", type: "INSTANCE", name: "Switch", componentId: "comp-B", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=False, Disable=True",
          children: [{ id: "i3", type: "INSTANCE", name: "Switch", componentId: "comp-C", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=True, Disable=True",
          children: [{ id: "i4", type: "INSTANCE", name: "Switch", componentId: "comp-D", children: [] }],
        },
      ],
    } as any;
    const patterns = detector.detect(node);
    expect(patterns.filter(p => p.type === "componentSwap")).toHaveLength(0);
  });

  it("Switchswitch fixture-shaped case (multi prop but only Active determines componentId) → componentSwap on Active", () => {
    // Active=False/Disable=False uses comp-A
    // Active=True/Disable=False uses comp-B
    // Active=False/Disable=True uses comp-A  ← same as F/F (Disable doesn't change ci)
    // Active=True/Disable=True uses comp-B
    const node = {
      type: "COMPONENT_SET",
      componentPropertyDefinitions: {
        Active: { type: "VARIANT", variantOptions: ["False", "True"] },
        Disable: { type: "VARIANT", variantOptions: ["False", "True"] },
      },
      children: [
        {
          type: "COMPONENT", name: "Active=False, Disable=False",
          children: [{ id: "i1", type: "INSTANCE", name: "Switch", componentId: "comp-A", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=True, Disable=False",
          children: [{ id: "i2", type: "INSTANCE", name: "Switch", componentId: "comp-B", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=False, Disable=True",
          children: [{ id: "i3", type: "INSTANCE", name: "Switch", componentId: "comp-A", children: [] }],
        },
        {
          type: "COMPONENT", name: "Active=True, Disable=True",
          children: [{ id: "i4", type: "INSTANCE", name: "Switch", componentId: "comp-B", children: [] }],
        },
      ],
    } as any;
    const patterns = detector.detect(node);
    const swaps = patterns.filter(p => p.type === "componentSwap");
    expect(swaps.length).toBeGreaterThanOrEqual(2);
    const props = new Set(swaps.map(p => (p as any).prop));
    expect(props).toEqual(new Set(["active"]));
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts -t "componentSwap"`
Expected: FAIL — patterns array contains no `componentSwap` entries (method does not exist yet).

- [ ] **Step 3: Commit failing tests**

```bash
git add test/compiler/design-pattern-detector.test.ts
git commit -m "test(detector): failing tests for componentSwap pattern"
```

---

## Task 3: Implement detectComponentSwap

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts`

- [ ] **Step 1: Add invocation in COMPONENT_SET branch**

In `DesignPatternDetector.ts`, find the `detect()` method's COMPONENT_SET branch (around lines 39-52). Add a call to the new method after `detectPartialExposedInstances`:

```typescript
      // Component-level patterns: analyze componentPropertyDefinitions
      this.detectLayoutModeSwitch(variants, propDefs, patterns);
      this.detectPartialExposedInstances(variants, seenIds, patterns);
      this.detectComponentSwap(variants, propDefs, patterns);
      this.detectStatePseudoClass(propDefs, patterns);
      this.detectBreakpointVariant(propDefs, patterns);
```

- [ ] **Step 2: Add detectComponentSwap method**

Add a new private method to the `DesignPatternDetector` class (place after `detectPartialExposedInstances`, before `detectLayoutModeSwitch` to keep INSTANCE-related detectors grouped):

```typescript
  // ─────────────────────────────────────────────────────────────────────────
  // componentSwap (component-level)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * INSTANCE swap variant 패턴 감지.
   * variant prop value별로 같은 path의 INSTANCE가 다른 mainComponent를 swap하는 패턴.
   *
   * 패턴의 정의 조건:
   * - type=INSTANCE
   * - 모든 variant에 같은 path로 존재
   * - name이 모든 variant에서 동일
   * - componentId가 variant 간 다름
   * - 단일 variant prop이 componentId를 결정함
   */
  private detectComponentSwap(
    variants: any[],
    propDefs: Record<string, any>,
    patterns: DesignPattern[],
  ): void {
    if (variants.length < 2) return;

    // 1. variant별로 INSTANCE 정보 수집 (path → { nodeId, name, componentId, containerNodeId })
    type InstInfo = {
      nodeId: string;
      name: string;
      componentId: string;
      containerNodeId: string;
    };
    const variantInstances: Array<Map<string, InstInfo>> = variants.map((v) =>
      this.collectInstancesByPath(v.children ?? [], v.id ?? "")
    );

    // 2. variant prop 후보 수집 (VARIANT 타입만)
    const variantPropMaps: Array<Record<string, string>> = variants.map((v) => {
      const props: Record<string, string> = {};
      const name: string = v.name ?? "";
      for (const segment of name.split(",")) {
        const eqIdx = segment.indexOf("=");
        if (eqIdx < 0) continue;
        props[segment.slice(0, eqIdx).trim()] = segment.slice(eqIdx + 1).trim();
      }
      return props;
    });

    const variantPropKeys: string[] = [];
    for (const [rawKey, def] of Object.entries(propDefs)) {
      if (def.type !== "VARIANT") continue;
      variantPropKeys.push(rawKey.split("#")[0].trim());
    }
    if (variantPropKeys.length === 0) return;

    // 3. 모든 path 합집합
    const allPaths = new Set<string>();
    for (const m of variantInstances) for (const k of m.keys()) allPaths.add(k);

    for (const pathKey of allPaths) {
      // 3a. 모든 variant에 존재하는지 확인 (조건부 노드 제외)
      const presentInAll = variantInstances.every((m) => m.has(pathKey));
      if (!presentInAll) continue;

      // 3b. name 일치 확인
      const names = new Set(
        variantInstances.map((m) => m.get(pathKey)!.name)
      );
      if (names.size !== 1) continue;

      // 3c. componentId가 variant 간 다른지 확인
      const componentIds = new Set(
        variantInstances.map((m) => m.get(pathKey)!.componentId)
      );
      if (componentIds.size < 2) continue;

      // 4. 단일 variant prop이 componentId를 결정하는지 확인
      let decidingProp: string | null = null;
      for (const propKey of variantPropKeys) {
        if (this.propDeterminesComponentId(propKey, variantPropMaps, variantInstances, pathKey)) {
          if (decidingProp !== null) {
            // 두 개 이상이면 모호 — skip
            decidingProp = null;
            break;
          }
          decidingProp = propKey;
        }
      }
      if (decidingProp === null) continue;

      // 5. 패턴 등록 — swap-member INSTANCE 각각에 별도 패턴 부착
      const containerNodeId = variantInstances[0].get(pathKey)!.containerNodeId;
      const normalizedProp = normalizePropName(decidingProp);
      const swapGroupId = `${containerNodeId}::${normalizedProp}`;

      for (let vi = 0; vi < variants.length; vi++) {
        const inst = variantInstances[vi].get(pathKey)!;
        const propValue = variantPropMaps[vi][decidingProp] ?? "";
        // 같은 (nodeId, swapGroupId) 중복 방지
        const exists = patterns.some(
          (p) =>
            p.type === "componentSwap" &&
            p.nodeId === inst.nodeId &&
            p.swapGroupId === swapGroupId,
        );
        if (exists) continue;
        patterns.push({
          type: "componentSwap",
          nodeId: inst.nodeId,
          swapGroupId,
          prop: normalizedProp,
          propValue,
          containerNodeId,
        });
      }
    }
  }

  /**
   * variant 자식 트리에서 INSTANCE를 수집.
   * key = name path (variant 자식부터 시작, variant 노드 자체 이름 제외)
   * 첫 등장만 기록 (path 충돌은 무시 — 모호한 케이스 보수적으로 skip)
   */
  private collectInstancesByPath(
    children: any[],
    parentNodeId: string,
  ): Map<string, { nodeId: string; name: string; componentId: string; containerNodeId: string }> {
    const map = new Map<string, { nodeId: string; name: string; componentId: string; containerNodeId: string }>();
    const visit = (n: any, pathPrefix: string, containerNodeId: string) => {
      const myPath = pathPrefix + "/" + (n.name ?? "");
      if (n.type === "INSTANCE" && n.componentId) {
        if (!map.has(myPath)) {
          map.set(myPath, {
            nodeId: n.id,
            name: n.name ?? "",
            componentId: n.componentId,
            containerNodeId,
          });
        }
      }
      for (const c of n.children ?? []) {
        visit(c, myPath, n.id ?? containerNodeId);
      }
    };
    for (const c of children) {
      visit(c, "", parentNodeId);
    }
    return map;
  }

  /**
   * 특정 prop이 path INSTANCE의 componentId를 단독 결정하는지 확인.
   * 같은 prop value를 가진 모든 variant에서 같은 componentId면 결정자.
   */
  private propDeterminesComponentId(
    propKey: string,
    variantPropMaps: Array<Record<string, string>>,
    variantInstances: Array<Map<string, { componentId: string }>>,
    pathKey: string,
  ): boolean {
    const valueToCi = new Map<string, string>();
    for (let vi = 0; vi < variantPropMaps.length; vi++) {
      const propVal = variantPropMaps[vi][propKey];
      if (propVal === undefined) return false;
      const inst = variantInstances[vi].get(pathKey);
      if (!inst) return false;
      const existing = valueToCi.get(propVal);
      if (existing === undefined) {
        valueToCi.set(propVal, inst.componentId);
      } else if (existing !== inst.componentId) {
        // 같은 prop value인데 다른 componentId → 이 prop은 단독 결정자가 아님
        return false;
      }
    }
    // 최소 두 개 이상의 distinct componentId가 prop value별로 매핑돼야 swap
    const distinctCis = new Set(valueToCi.values());
    return distinctCis.size >= 2;
  }
```

- [ ] **Step 3: Run detector tests to verify they pass**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts -t "componentSwap"`
Expected: All 6 componentSwap tests PASS.

- [ ] **Step 4: Run full detector test suite to verify no regression**

Run: `npx vitest run test/compiler/design-pattern-detector.test.ts`
Expected: All tests PASS (existing + new).

- [ ] **Step 5: Commit detector implementation**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector.ts
git commit -m "feat(detector): detectComponentSwap for INSTANCE swap variant pattern"
```

---

## Task 4: Write failing ComponentSwap signal tests

**Files:**
- Create: `test/tree-builder/match-engine/signals/ComponentSwap.test.ts`

- [ ] **Step 1: Create signal test file**

Create `test/tree-builder/match-engine/signals/ComponentSwap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ComponentSwap } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/ComponentSwap";
import { defaultMatchingPolicy } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/MatchingPolicy";
import type { InternalNode, DesignPattern } from "@code-generator2/types/types";

function node(id: string, patterns: DesignPattern[]): InternalNode {
  return {
    id,
    name: "Switch",
    type: "INSTANCE",
    children: [],
    parent: {} as any,
    mergedNodes: [{ id, name: "Switch", variantName: "" }],
    metadata: { designPatterns: patterns },
  } as unknown as InternalNode;
}

const ctx = { policy: defaultMatchingPolicy } as any;

describe("ComponentSwap signal", () => {
  const signal = new ComponentSwap();

  it("returns decisive-match-with-cost when both nodes share swapGroupId via same swap pattern", () => {
    const swapGroupId = "container-1::active";
    const a = node("inst-false", [
      { type: "componentSwap", nodeId: "inst-false", swapGroupId, prop: "active", propValue: "False", containerNodeId: "container-1" },
    ]);
    const b = node("inst-true", [
      { type: "componentSwap", nodeId: "inst-true", swapGroupId, prop: "active", propValue: "True", containerNodeId: "container-1" },
    ]);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("decisive-match-with-cost");
    if (r.kind === "decisive-match-with-cost") {
      expect(r.cost).toBe(0.05);
    }
  });

  it("returns neutral when neither node has any componentSwap pattern", () => {
    const a = node("a", []);
    const b = node("b", []);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when only one node has componentSwap pattern", () => {
    const a = node("a", [
      { type: "componentSwap", nodeId: "a", swapGroupId: "g1", prop: "active", propValue: "False", containerNodeId: "c" },
    ]);
    const b = node("b", []);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("returns neutral when both have componentSwap patterns but different swapGroupId", () => {
    const a = node("a", [
      { type: "componentSwap", nodeId: "a", swapGroupId: "g1", prop: "active", propValue: "False", containerNodeId: "c1" },
    ]);
    const b = node("b", [
      { type: "componentSwap", nodeId: "b", swapGroupId: "g2", prop: "platform", propValue: "iOS", containerNodeId: "c2" },
    ]);
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("neutral");
  });

  it("matches via mergedNodes id when InternalNode id differs from swap pattern nodeId", () => {
    const swapGroupId = "g1";
    // a's primary id is "merged-id-a" but its mergedNodes contains the swap pattern's nodeId
    const a: InternalNode = {
      id: "merged-id-a",
      name: "Switch",
      type: "INSTANCE",
      children: [],
      parent: {} as any,
      mergedNodes: [{ id: "inst-false", name: "Switch", variantName: "" }],
      metadata: {
        designPatterns: [
          { type: "componentSwap", nodeId: "inst-false", swapGroupId, prop: "active", propValue: "False", containerNodeId: "c" },
        ],
      },
    } as unknown as InternalNode;
    const b: InternalNode = {
      id: "merged-id-b",
      name: "Switch",
      type: "INSTANCE",
      children: [],
      parent: {} as any,
      mergedNodes: [{ id: "inst-true", name: "Switch", variantName: "" }],
      metadata: {
        designPatterns: [
          { type: "componentSwap", nodeId: "inst-true", swapGroupId, prop: "active", propValue: "True", containerNodeId: "c" },
        ],
      },
    } as unknown as InternalNode;
    const r = signal.evaluate(a, b, ctx);
    expect(r.kind).toBe("decisive-match-with-cost");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tree-builder/match-engine/signals/ComponentSwap.test.ts`
Expected: FAIL — module `ComponentSwap` does not exist (import error).

- [ ] **Step 3: Commit failing signal tests**

```bash
git add test/tree-builder/match-engine/signals/ComponentSwap.test.ts
git commit -m "test(signal): failing tests for ComponentSwap signal"
```

---

## Task 5: Implement ComponentSwap signal

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/ComponentSwap.ts`

- [ ] **Step 1: Create signal class**

Create `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/ComponentSwap.ts`:

```typescript
import type { InternalNode } from "../../../../../../../types/types";
import type { MatchSignal, SignalResult, MatchContext } from "../MatchSignal";

/**
 * ComponentSwap
 *
 * INSTANCE swap variant 패턴 매칭 신호.
 * DesignPatternDetector.detectComponentSwap이 등록한 `componentSwap` 패턴을
 * 읽어, 두 InternalNode가 같은 swapGroupId의 swap 멤버이면 매칭 결정.
 *
 * 책임:
 * - 패턴 감지 로직 없음 (DesignPatternDetector의 책임).
 * - metadata.designPatterns에서 `componentSwap`을 읽고 swapGroupId 일치 여부만 확인.
 *
 * 매칭 결과:
 * - 두 노드 모두 같은 swapGroupId의 componentSwap 패턴을 가지면
 *   → decisive-match-with-cost (0.05).
 *   BooleanPositionSwap과 동일 cost — Hungarian이 ties를 만들지 않게.
 * - 그 외 → neutral.
 *
 * 매칭 비교 시 InternalNode.id 또는 mergedNodes의 id 어느 쪽이라도 패턴
 * nodeId와 일치하면 같은 swap 멤버로 본다 (variant 머지 후 노드 id가
 * 머지된 id로 바뀐 경우 대비).
 */
const COMPONENT_SWAP_COST = 0.05;

export class ComponentSwap implements MatchSignal {
  readonly name = "ComponentSwap";

  evaluate(a: InternalNode, b: InternalNode, _ctx: MatchContext): SignalResult {
    const aGroups = this.collectSwapGroups(a);
    if (aGroups.size === 0) {
      return { kind: "neutral", reason: "node a has no componentSwap pattern" };
    }
    const bGroups = this.collectSwapGroups(b);
    if (bGroups.size === 0) {
      return { kind: "neutral", reason: "node b has no componentSwap pattern" };
    }

    for (const g of aGroups) {
      if (bGroups.has(g)) {
        return {
          kind: "decisive-match-with-cost",
          cost: COMPONENT_SWAP_COST,
          reason: `componentSwap pair (swapGroupId=${g})`,
        };
      }
    }
    return { kind: "neutral", reason: "no shared componentSwap swapGroupId" };
  }

  /**
   * 노드의 metadata.designPatterns에서 componentSwap 패턴들의 swapGroupId 집합을
   * 추출. 패턴은 그 nodeId가 노드 자체의 id 또는 mergedNodes 중 하나와 일치할
   * 때 유효한 것으로 본다.
   */
  private collectSwapGroups(node: InternalNode): Set<string> {
    const out = new Set<string>();
    const patterns = node.metadata?.designPatterns ?? [];
    if (patterns.length === 0) return out;

    const validIds = new Set<string>([node.id]);
    for (const m of node.mergedNodes ?? []) {
      validIds.add(m.id);
    }
    for (const p of patterns) {
      if (p.type !== "componentSwap") continue;
      if (validIds.has(p.nodeId)) {
        out.add(p.swapGroupId);
      }
    }
    return out;
  }
}
```

- [ ] **Step 2: Run signal tests to verify they pass**

Run: `npx vitest run test/tree-builder/match-engine/signals/ComponentSwap.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 3: Commit signal implementation**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/signals/ComponentSwap.ts
git commit -m "feat(signal): ComponentSwap reads componentSwap pattern for swap-pair matching"
```

---

## Task 6: Register ComponentSwap signal in match-engine

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/index.ts`

- [ ] **Step 1: Capture pre-change baseline numbers**

Run these and save the output for comparison after Task 7:

```bash
npm run audit 2>&1 | tail -10
npm run audit:anomaly 2>&1 | tail -10
```

Expected output snippet (from current dev): `Total: 1837` (audit) and `Total: 76` (anomaly). Note any deviation.

- [ ] **Step 2: Add ComponentSwap import and register before BooleanPositionSwap**

Edit `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/index.ts`. Add the import near the other signal imports (line 8 area):

```typescript
import { ComponentSwap } from "./signals/ComponentSwap";
```

Then update the engine constructor (lines 45-52) to register the signal **before** `BooleanPositionSwap`:

```typescript
    [
      new TypeCompatibility(),
      new IdMatch(),
      new NormalizedPosition(),
      new ComponentSwap(),
      new BooleanPositionSwap(),
      new TextSpecialMatch(),
      new InstanceSpecialMatch(),
    ],
```

Update the comment block (lines 16-31) to describe the new signal. Replace the existing comment block with:

```typescript
/**
 * Phase 2 엔진 — getPositionCost 위임 호환 cost form.
 *
 * 신호 순서:
 * 1. TypeCompatibility — O(1), 가장 빠른 veto
 * 2. IdMatch — O(1), id 일치 시 decisive-match
 * 3. NormalizedPosition — O(depth), 위치+size+overflow 통합. success 시 decisive-match-with-cost로
 *    fallback 신호 차단. 실패 시 neutral (Text/Instance Special 및 VariantPropPosition에 위임).
 * 4. ComponentSwap — 같은 swapGroupId의 INSTANCE swap pair를 decisive-match-with-cost(0.05) 처리.
 *    DesignPatternDetector.detectComponentSwap이 등록한 패턴을 metadata로 읽음.
 * 5. BooleanPositionSwap — Switch/Toggle 노브 전용. NP fallback에서만 발동.
 *    boolean variant가 cx 이동을 결정하는 패턴을 decisive-match 처리.
 * 6. TextSpecialMatch — TEXT pair fallback (decisive-match-with-cost(0.05))
 * 7. InstanceSpecialMatch — INSTANCE pair fallback (decisive-match-with-cost(0.05))
 *
 * RelativeSize와 OverflowPenalty는 NormalizedPosition에 inline됨 (legacy semantic 보존).
 * 모든 신호가 neutral이면 엔진이 veto 반환.
 */
```

- [ ] **Step 3: Run match-engine tests to verify no regression**

Run: `npx vitest run test/tree-builder/match-engine/`
Expected: All existing match-engine tests PASS. New ComponentSwap tests PASS.

- [ ] **Step 4: Commit signal registration**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/match-engine/index.ts
git commit -m "feat(match-engine): register ComponentSwap signal between NP and BooleanPositionSwap"
```

---

## Task 7: Measure regression impact and validate

**Files:**
- Read-only: `test/audits/audit-baseline.json`, `test/audits/baselines/anomaly-baseline.json`

- [ ] **Step 1: Run audit:diff and capture output**

Run: `npm run audit:diff 2>&1 | tail -50`
Expected: `Total: 1837 → <new>` with `New regressions (0):`. New value should be lower than 1837. If new regressions > 0, STOP and analyze with `audit:trace` before proceeding.

- [ ] **Step 2: Run audit:anomaly and capture output**

Run: `npm run audit:anomaly 2>&1 | tail -30`
Expected: `Total: 76 → <new>`. New value should be ≤ 76 (cross-name may decrease as a side effect).

- [ ] **Step 3: Run snapshot-bearing tests and inspect diffs**

Run: `npx vitest run test/tree-builder/ test/compiler/ 2>&1 | tail -30`
Expected: Some snapshots will fail because variant merge results changed (intended).

For each failing snapshot test, run individually with `--reporter=verbose` to inspect the diff:

```bash
npx vitest run <failing-test-path> --reporter=verbose
```

For each diff, manually verify:
- Two previously-separate INSTANCE branches collapsed into one variant-aware structure.
- No spurious node merges (e.g., distinct icons collapsed by mistake).
- Generated React code changes are semantically correct (prop bindings still wire to the right values).

If any diff is wrong, STOP and trace the offending fixture with `OBSERVE_FIXTURE=<fixture> npm run audit:observe` to find the cause.

- [ ] **Step 4: Update snapshots only after all diffs validated**

Run: `npx vitest run test/tree-builder/ test/compiler/ -u 2>&1 | tail -10`
Expected: All snapshot tests PASS after update.

- [ ] **Step 5: Commit snapshot updates**

```bash
git add test/snapshots test/tree-builder test/compiler
git commit -m "test(snapshots): update snapshots for ComponentSwap detector merging"
```

- [ ] **Step 6: Update audit baseline**

Only run this after Step 3-4 confirms diffs are correct.

```bash
npm run audit:write
npm run audit:anomaly:write
```

Inspect the resulting changes to `test/audits/audit-baseline.json` and `test/audits/baselines/anomaly-baseline.json`:

```bash
git diff test/audits/audit-baseline.json | head -30
git diff test/audits/baselines/anomaly-baseline.json | head -30
```

Confirm `totalDisjointPairs` decreased and `byDetector.cross-name` is monotonically non-increasing.

- [ ] **Step 7: Commit baseline update**

```bash
git add test/audits/audit-baseline.json test/audits/baselines/anomaly-baseline.json
git commit -m "test(audit): update baselines after ComponentSwap signal lands"
```

---

## Task 8: Update memory and close issue

**Files:**
- Modify: `/Users/namhyeon-u/.claude/projects/-Users-namhyeon-u-Desktop-figma-plugin/memory/project_instance_swap_variant_pattern.md`
- Modify: `/Users/namhyeon-u/.claude/projects/-Users-namhyeon-u-Desktop-figma-plugin/memory/MEMORY.md`

- [ ] **Step 1: Mark INSTANCE swap memory as resolved**

Edit `project_instance_swap_variant_pattern.md`. Change frontmatter `description` to start with `해결 완료 (2026-04-16):` and add at the top:

```markdown
✅ **해결 완료 (2026-04-16)** — DesignPatternDetector.detectComponentSwap + ComponentSwap NodeMatcher signal로 처리. audit-baseline 1837 → <새 값>, anomaly cross-name 76 → <새 값>. 자세한 내용은 `docs/superpowers/specs/2026-04-16-component-swap-detector-design.md` + `docs/superpowers/plans/2026-04-16-component-swap-detector.md` 참조.
```

Replace `<새 값>` with the actual numbers from Task 7 Step 1/2.

- [ ] **Step 2: Update MEMORY.md index entry**

Edit MEMORY.md, change the `project_instance_swap_variant_pattern.md` line to reflect resolution:

```
- [INSTANCE swap variant 패턴 — 해결](project_instance_swap_variant_pattern.md) — detectComponentSwap + ComponentSwap signal로 해결 (2026-04-16). audit/anomaly 감소 측정값 본문 참조
```

- [ ] **Step 3: Verify memory edits**

Read both files to confirm changes applied correctly.

- [ ] **Step 4: Run full audit one final time to confirm green**

Run: `npm run audit 2>&1 | tail -5 && npm run audit:anomaly 2>&1 | tail -5`
Expected: Both `PASS`. New baselines stable.

- [ ] **Step 5: (No commit — memory files are outside the repo)**

Memory files live in `~/.claude/projects/.../memory/` and are not part of git. The git history already captures the implementation in Tasks 1-7.

---

## Self-Review Notes

- **Spec coverage**: All Goals (1-4) covered: Tasks 1-3 (detector), Tasks 4-5 (signal), Task 6 (registration), Task 7 (regression measurement + validation), Task 8 (issue closure).
- **Type consistency**: `swapGroupId` is `${containerNodeId}::${prop}` everywhere. `nodeId` field name aligns with existing `nodeId`-based patterns and reuses VariantMerger.applyPatternAnnotations without modification.
- **No spec drift**: Spec section 5.1 originally proposed `swappedInstances: Record<string, string>`. Plan replaces this with per-INSTANCE patterns sharing `swapGroupId` to reuse existing annotation flow without modifying VariantMerger. This was explicitly deferred to "구현 단계 결정" in spec section 6.3 and matches the recommended node-level approach.
- **Risks** (from spec section 8) addressed: false-positive guards in detector tests (Task 2), cost collision with BooleanPositionSwap mitigated by ordering (ComponentSwap fires only when its precise swapGroupId pattern exists, and decisive-match short-circuits it from BooleanPositionSwap conflict).
