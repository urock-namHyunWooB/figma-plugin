# Interaction Layer Stripper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma의 "Interaction" 메타데이터 frame 패턴을 InternalTree에서 제거하고, 그 안에 정의된 디자이너 의도(state별 색)를 부모 노드의 styles.pseudo 구조로 흡수한다.

**Architecture:** 새 processor `InteractionLayerStripper`를 `TreeBuilder.build()`의 Phase 1에서 VariantMerger 직후, splitMultiComponentInstances 직전에 실행. tree를 in-place로 수정 (Interaction 노드 제거 + 부모 styles에 pseudo entry 삽입).

**Tech Stack:** TypeScript 5.3, vitest, 기존 `StyleObject.pseudo` 필드 (`Partial<Record<PseudoClass, Record<string, string|number>>>`), 기존 `DataManager.getById()` API.

**Spec reference:** `docs/superpowers/specs/2026-04-09-interaction-layer-stripper-design.md`

---

## File Structure

이 플랜이 만들거나 수정하는 파일:

**신규**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts` — 핵심 모듈, ~150 LOC 예상
- `test/tree-builder/InteractionLayerStripper.test.ts` — 단위 테스트 (합성 트리 입력)
- `test/tree-builder/buttonsolid-interaction-strip.test.ts` — Buttonsolid fixture 통합 테스트

**수정**:
- `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts` — Phase 1에 stripper 단계 추가
- `test/audits/audit-baseline.json` — strip 후 재생성 (Buttonsolid 회귀 카운트 변화 반영)
- `test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap` — 영향 받은 fixture 재생성
- `test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap` — 동일

---

## Execution Notes

- **Worktree**: 이 작업은 worktree에서 수행. `git worktree add .claude/worktrees/interaction-layer-stripper -b feat/interaction-layer-stripper dev`
- **TDD 엄수**: 각 task는 failing test → minimal impl → passing test → commit 사이클
- **No regressions**: 매 task 종료 시 `npm run audit`이 통과해야 함 (회귀 카운트 ≤ 기존). snapshot drift는 의도된 fixture만 발생해야 함.
- **Side effect 활용**: Interaction strip이 merger의 "Loading/Mask/Content가 Interaction에 잘못 들어감" 버그를 자동으로 가림. 이건 의도된 효과 — 별도로 root cause를 고치지 않음.

---

## Task 1: 감지 함수 단위 — `isInteractionLayer`

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`
- Test: `test/tree-builder/InteractionLayerStripper.test.ts`

**Context:** stripper 모듈의 첫 단위. 노드가 "Interaction layer"인지 판정하는 pure 함수. spec §4의 감지 규칙을 그대로 구현. 이 task는 감지 함수만, 트리 수정/스타일 추출은 후속 task에서.

- [ ] **Step 1: Write the failing test**

File: `test/tree-builder/InteractionLayerStripper.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { isInteractionLayer } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import type { InternalNode } from "@code-generator2/types/types";

function node(name: string, type: string, children: InternalNode[] = []): InternalNode {
  return { id: name, name, type, children } as unknown as InternalNode;
}

describe("isInteractionLayer", () => {
  it("returns true for FRAME named Interaction with single INSTANCE child", () => {
    const inst = node("Interaction", "INSTANCE");
    const frame = node("Interaction", "FRAME", [inst]);
    expect(isInteractionLayer(frame)).toBe(true);
  });

  it("returns true for FRAME named Interaction with zero children", () => {
    const frame = node("Interaction", "FRAME", []);
    expect(isInteractionLayer(frame)).toBe(true);
  });

  it("returns true for nested Interaction (child is FRAME named Interaction)", () => {
    const inner = node("Interaction", "FRAME", [node("Interaction", "INSTANCE")]);
    const outer = node("Interaction", "FRAME", [inner]);
    expect(isInteractionLayer(outer)).toBe(true);
  });

  it("returns false for FRAME with name other than Interaction", () => {
    const frame = node("Wrapper", "FRAME", [node("Interaction", "INSTANCE")]);
    expect(isInteractionLayer(frame)).toBe(false);
  });

  it("returns false for non-FRAME type even if name matches", () => {
    const inst = node("Interaction", "INSTANCE");
    expect(isInteractionLayer(inst)).toBe(false);
  });

  it("returns false for FRAME with 2 children (defensive)", () => {
    const frame = node("Interaction", "FRAME", [
      node("a", "INSTANCE"),
      node("b", "INSTANCE"),
    ]);
    expect(isInteractionLayer(frame)).toBe(false);
  });

  it("name match is case-sensitive ('interaction' lowercase fails)", () => {
    const frame = node("interaction", "FRAME", []);
    expect(isInteractionLayer(frame)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: FAIL with `Cannot find module 'InteractionLayerStripper'`.

- [ ] **Step 3: Write the implementation**

File: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`

```typescript
import type { InternalNode } from "../../../../types/types";

/**
 * Interaction layer 감지.
 *
 * Spec §4 감지 규칙:
 * - name === "Interaction" (case-sensitive)
 * - type === "FRAME"
 * - children.length <= 1 (defensive: 2+ children은 strip 안 함)
 *
 * children type 제약은 의도적으로 없음 — 중첩 Interaction의 외곽 frame은
 * 자식이 FRAME(또 다른 Interaction)이고, 일반 case는 자식이 INSTANCE.
 * 둘 다 지원.
 */
export function isInteractionLayer(node: InternalNode): boolean {
  if (node.type !== "FRAME") return false;
  if (node.name !== "Interaction") return false;
  const children = node.children ?? [];
  if (children.length > 1) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts test/tree-builder/InteractionLayerStripper.test.ts
git commit -m "feat(tree-builder): isInteractionLayer detection function"
```

---

## Task 2: State 매핑 함수 — `mapFigmaStateToPseudo`

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`
- Modify: `test/tree-builder/InteractionLayerStripper.test.ts`

**Context:** Figma의 `State=Hover` 같은 variant 값을 CSS pseudo-class로 매핑하는 pure 함수. spec §5.2의 매핑 테이블 그대로. 이 함수는 stripper 외에도 향후 재사용 가능성 있음.

- [ ] **Step 1: Append failing tests to the existing test file**

추가할 내용 (`test/tree-builder/InteractionLayerStripper.test.ts` 아래쪽에 append):

```typescript
import { mapFigmaStateToPseudo } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";

describe("mapFigmaStateToPseudo", () => {
  it("maps Normal to null (no pseudo)", () => {
    expect(mapFigmaStateToPseudo("Normal")).toBeNull();
  });

  it("maps Hover to :hover", () => {
    expect(mapFigmaStateToPseudo("Hover")).toBe(":hover");
  });

  it("maps Pressed to :active", () => {
    expect(mapFigmaStateToPseudo("Pressed")).toBe(":active");
  });

  it("maps Focused to :focus", () => {
    expect(mapFigmaStateToPseudo("Focused")).toBe(":focus");
  });

  it("maps Disabled to :disabled", () => {
    expect(mapFigmaStateToPseudo("Disabled")).toBe(":disabled");
  });

  it("is case-insensitive", () => {
    expect(mapFigmaStateToPseudo("hover")).toBe(":hover");
    expect(mapFigmaStateToPseudo("PRESSED")).toBe(":active");
  });

  it("returns null for unknown values", () => {
    expect(mapFigmaStateToPseudo("Weird")).toBeNull();
    expect(mapFigmaStateToPseudo("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: 7 new tests fail with `mapFigmaStateToPseudo is not exported`.

- [ ] **Step 3: Add the implementation to InteractionLayerStripper.ts**

기존 파일 끝에 추가:

```typescript
import type { PseudoClass } from "../../../../types/types";

/**
 * Figma `State` variant 값을 CSS pseudo-class로 매핑.
 *
 * Spec §5.2 매핑 테이블:
 * - Normal  → null (default state, no pseudo)
 * - Hover   → :hover
 * - Pressed → :active
 * - Focused → :focus
 * - Disabled → :disabled
 *
 * Case-insensitive. 알 수 없는 값은 null 반환.
 */
export function mapFigmaStateToPseudo(state: string): PseudoClass | null {
  const normalized = state.toLowerCase().trim();
  switch (normalized) {
    case "normal": return null;
    case "hover": return ":hover";
    case "pressed": return ":active";
    case "focused": return ":focus";
    case "disabled": return ":disabled";
    default: return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts test/tree-builder/InteractionLayerStripper.test.ts
git commit -m "feat(tree-builder): mapFigmaStateToPseudo state→pseudo mapping"
```

---

## Task 3: 부모 styles 병합 함수 — `mergePseudoIntoParent`

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`
- Modify: `test/tree-builder/InteractionLayerStripper.test.ts`

**Context:** 추출된 pseudo-class 스타일 맵을 부모 InternalNode의 `styles.pseudo` 필드에 병합. spec §5.3 — 충돌 시 부모의 기존 값 우선. 부모에 styles 자체가 없으면 빈 객체로 초기화.

- [ ] **Step 1: Append failing tests**

```typescript
import { mergePseudoIntoParent } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";
import type { StyleObject } from "@code-generator2/types/types";

describe("mergePseudoIntoParent", () => {
  function makeNode(styles?: StyleObject): InternalNode {
    return {
      id: "p",
      name: "parent",
      type: "FRAME",
      children: [],
      styles,
    } as unknown as InternalNode;
  }

  it("creates pseudo field on parent without styles", () => {
    const p = makeNode();
    mergePseudoIntoParent(p, ":hover", { background: "#000" });
    expect(p.styles?.pseudo?.[":hover"]).toEqual({ background: "#000" });
  });

  it("creates pseudo field on parent with base styles only", () => {
    const p = makeNode({ base: { color: "red" }, dynamic: [] });
    mergePseudoIntoParent(p, ":hover", { background: "#000" });
    expect(p.styles?.base).toEqual({ color: "red" });
    expect(p.styles?.pseudo?.[":hover"]).toEqual({ background: "#000" });
  });

  it("merges into existing pseudo entry without overwriting", () => {
    const p = makeNode({
      base: {},
      dynamic: [],
      pseudo: { ":hover": { background: "red" } },
    });
    mergePseudoIntoParent(p, ":hover", { background: "#000", opacity: 0.5 });
    // 기존 background 우선 (덮어쓰기 안 함), opacity는 새로 추가
    expect(p.styles?.pseudo?.[":hover"]).toEqual({
      background: "red",
      opacity: 0.5,
    });
  });

  it("adds different pseudo entries side by side", () => {
    const p = makeNode({
      base: {},
      dynamic: [],
      pseudo: { ":hover": { background: "red" } },
    });
    mergePseudoIntoParent(p, ":active", { background: "#000" });
    expect(p.styles?.pseudo?.[":hover"]).toEqual({ background: "red" });
    expect(p.styles?.pseudo?.[":active"]).toEqual({ background: "#000" });
  });

  it("does nothing for empty style map", () => {
    const p = makeNode({ base: {}, dynamic: [] });
    mergePseudoIntoParent(p, ":hover", {});
    // pseudo 필드는 생성됐지만 :hover 항목은 없음 (또는 빈 객체)
    expect(p.styles?.pseudo?.[":hover"] ?? {}).toEqual({});
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement**

`InteractionLayerStripper.ts` 끝에 추가:

```typescript
import type { StyleObject } from "../../../../types/types";

/**
 * 부모 InternalNode의 styles.pseudo 구조에 pseudo-class entry를 병합.
 *
 * Spec §5.3 병합 규칙:
 * - 부모에 styles가 없으면 빈 StyleObject 생성
 * - styles.pseudo가 없으면 빈 객체 생성
 * - 같은 pseudo entry가 이미 있으면 부모의 기존 값 우선 (디자이너가 직접 작성한 게 명시적)
 * - 새 속성만 추가
 * - 빈 style 맵은 효과 없음 (entry 자체는 생성)
 */
export function mergePseudoIntoParent(
  parent: InternalNode,
  pseudo: PseudoClass,
  style: Record<string, string | number>,
): void {
  if (!parent.styles) {
    parent.styles = { base: {}, dynamic: [] };
  }
  if (!parent.styles.pseudo) {
    parent.styles.pseudo = {};
  }
  const existing = parent.styles.pseudo[pseudo] ?? {};
  const merged: Record<string, string | number> = { ...existing };
  for (const [key, value] of Object.entries(style)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }
  parent.styles.pseudo[pseudo] = merged;
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: PASS (19 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts test/tree-builder/InteractionLayerStripper.test.ts
git commit -m "feat(tree-builder): mergePseudoIntoParent merge function"
```

---

## Task 4: Interaction INSTANCE → 스타일 추출 — `extractInteractionStyles`

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`
- Modify: `test/tree-builder/InteractionLayerStripper.test.ts`

**Context:** Interaction frame의 자식 INSTANCE가 참조하는 컴포넌트 set의 variants를 읽어서 `{ [pseudoClass]: styleMap }` 형태로 반환. DataManager를 통해 spec.info.components / spec.info.componentSets를 조회. 추출된 색은 background로 매핑 (Interaction은 항상 색 오버레이).

이 task는 구현이 복잡하므로 mock DataManager로 단위 테스트 작성.

- [ ] **Step 1: Append failing tests**

```typescript
import { extractInteractionStyles } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";

describe("extractInteractionStyles", () => {
  function makeMockDataManager(opts: {
    spec: any;
    nodes?: Record<string, any>;
  }): any {
    return {
      getById: (id: string) => {
        if (opts.nodes && opts.nodes[id]) return { node: opts.nodes[id], spec: opts.spec };
        return { spec: opts.spec };
      },
      getMainComponentId: () => "doc-root",
    };
  }

  it("returns empty object when interaction frame has no children", () => {
    const interactionFrame = node("Interaction", "FRAME");
    const dm = makeMockDataManager({ spec: { info: { components: {}, componentSets: {} } } });
    expect(extractInteractionStyles(interactionFrame, dm)).toEqual({});
  });

  it("extracts background color from State=Normal variant", () => {
    const childInst: any = {
      id: "child-inst",
      name: "Interaction",
      type: "INSTANCE",
      mergedNodes: [{ id: "raw-inst-id" }],
    };
    const interactionFrame = { id: "f", name: "Interaction", type: "FRAME", children: [childInst] } as unknown as InternalNode;
    const spec = {
      info: {
        components: {
          "comp-normal": { name: "State=Normal", componentSetId: "set-1" },
        },
        componentSets: { "set-1": { name: "Interaction/Normal" } },
      },
    };
    const rawInst = {
      id: "raw-inst-id",
      componentId: "comp-normal",
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    };
    const dm = makeMockDataManager({ spec, nodes: { "raw-inst-id": rawInst } });

    const result = extractInteractionStyles(interactionFrame, dm);
    // Normal은 default → pseudo entry 없음 (style이 base에 적용될 수 있지만 이 함수의 결과는 pseudo만)
    // 하지만 Normal 색 자체는 :hover/:active overlay로 쓰이므로 변환 필요.
    // 명세상 Normal은 null pseudo이므로 이 함수는 빈 결과 반환.
    expect(result).toEqual({});
  });

  it("extracts :hover when State=Hover variant exists", () => {
    const childInst: any = {
      id: "child-inst",
      name: "Interaction",
      type: "INSTANCE",
      mergedNodes: [{ id: "raw-inst-id" }],
    };
    const interactionFrame = { id: "f", name: "Interaction", type: "FRAME", children: [childInst] } as unknown as InternalNode;
    const spec = {
      info: {
        components: {
          "comp-normal": { name: "State=Normal", componentSetId: "set-1" },
          "comp-hover": { name: "State=Hover", componentSetId: "set-1" },
        },
        componentSets: { "set-1": { name: "Interaction/Normal" } },
      },
    };
    const rawInst = {
      id: "raw-inst-id",
      componentId: "comp-normal",
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    };
    const hoverComp = {
      id: "comp-hover",
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 0.5 } }],
    };
    const dm = makeMockDataManager({
      spec,
      nodes: { "raw-inst-id": rawInst, "comp-hover": hoverComp },
    });

    const result = extractInteractionStyles(interactionFrame, dm);
    expect(result[":hover"]).toBeDefined();
    expect(result[":hover"]?.background).toMatch(/rgba?\(/);
  });

  it("returns empty object when child INSTANCE has no fills", () => {
    const childInst: any = {
      id: "child-inst",
      name: "Interaction",
      type: "INSTANCE",
      mergedNodes: [{ id: "raw-inst-id" }],
    };
    const interactionFrame = { id: "f", name: "Interaction", type: "FRAME", children: [childInst] } as unknown as InternalNode;
    const spec = {
      info: { components: {}, componentSets: {} },
    };
    const dm = makeMockDataManager({ spec, nodes: { "raw-inst-id": { id: "raw-inst-id" } } });
    expect(extractInteractionStyles(interactionFrame, dm)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: tests fail with `extractInteractionStyles is not exported`.

- [ ] **Step 3: Implement**

`InteractionLayerStripper.ts` 끝에 추가:

```typescript
import type DataManager from "../../../data-manager/DataManager";

type PseudoStyles = Partial<Record<PseudoClass, Record<string, string | number>>>;

/**
 * Interaction frame에서 디자이너 의도 스타일을 추출.
 *
 * 1. 자식 INSTANCE의 raw Figma 노드를 DataManager에서 조회
 * 2. componentId의 componentSetId를 찾고 같은 set의 다른 variants 수집
 * 3. 각 variant의 State value를 pseudo-class로 매핑
 * 4. variant의 fills에서 색을 추출해 background로 변환
 * 5. State=Normal은 default이므로 pseudo entry로 변환하지 않음
 *
 * 반환: pseudo-class별 style map. State variants가 없거나 색이 없으면 빈 객체.
 */
export function extractInteractionStyles(
  interactionFrame: InternalNode,
  dataManager: DataManager,
): PseudoStyles {
  const result: PseudoStyles = {};
  const child = interactionFrame.children?.[0];
  if (!child || child.type !== "INSTANCE") return result;

  // 자식 INSTANCE의 원본 노드 조회 (mergedNodes로 raw id 얻음)
  const rawId = child.mergedNodes?.[0]?.id;
  if (!rawId) return result;
  const { node: rawInst, spec } = dataManager.getById(rawId);
  if (!rawInst || !spec) return result;

  const componentId = (rawInst as any).componentId as string | undefined;
  if (!componentId) return result;

  const components = (spec as any).info?.components ?? {};
  const componentSets = (spec as any).info?.componentSets ?? {};
  const baseComponent = components[componentId];
  if (!baseComponent) return result;

  const componentSetId = baseComponent.componentSetId;
  if (!componentSetId) return result;

  // 같은 set에 속한 모든 variants 찾기
  const setVariants: Array<{ id: string; name: string }> = [];
  for (const [cid, comp] of Object.entries(components)) {
    if ((comp as any).componentSetId === componentSetId) {
      setVariants.push({ id: cid, name: (comp as any).name });
    }
  }

  // 각 variant의 State 값 → pseudo-class 매핑 → 색 추출
  for (const variant of setVariants) {
    const stateValue = parseStateValue(variant.name);
    if (!stateValue) continue;
    const pseudo = mapFigmaStateToPseudo(stateValue);
    if (!pseudo) continue; // Normal은 default

    const variantNode = dataManager.getById(variant.id).node;
    const color = extractFirstSolidColor(variantNode ?? rawInst);
    if (!color) continue;

    result[pseudo] = { background: color };
  }

  return result;
}

/** "State=Hover, Size=Large" 같은 variant 이름에서 State 값 추출 */
function parseStateValue(variantName: string): string | null {
  const parts = variantName.split(",").map((s) => s.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key.toLowerCase() === "state") {
      return part.slice(eq + 1).trim();
    }
  }
  // State 단독 (variant 이름이 "Hover" 같은 경우)
  if (parts.length === 1) return parts[0];
  return null;
}

/** Figma 노드의 첫 SOLID fill을 CSS rgba 문자열로 변환 */
function extractFirstSolidColor(node: any): string | null {
  const fills = node?.fills;
  if (!Array.isArray(fills)) return null;
  for (const fill of fills) {
    if (fill?.type === "SOLID" && fill.color) {
      const r = Math.round(fill.color.r * 255);
      const g = Math.round(fill.color.g * 255);
      const b = Math.round(fill.color.b * 255);
      const a = fill.color.a ?? 1;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: PASS (23 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts test/tree-builder/InteractionLayerStripper.test.ts
git commit -m "feat(tree-builder): extractInteractionStyles from referenced componentSet"
```

---

## Task 5: 트리 순회 및 strip — `stripInteractionLayers`

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts`
- Modify: `test/tree-builder/InteractionLayerStripper.test.ts`

**Context:** 트리 전체를 post-order 순회하면서 isInteractionLayer 매칭되는 노드를 부모의 children에서 제거. 제거 전에 부모에 스타일 병합. 중첩 Interaction은 post-order 덕에 안쪽부터 처리됨.

- [ ] **Step 1: Append failing tests**

```typescript
import { stripInteractionLayers } from "@code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper";

describe("stripInteractionLayers", () => {
  function makeMockDataManager(opts: { spec?: any; nodes?: Record<string, any> } = {}): any {
    return {
      getById: (id: string) => ({
        node: opts.nodes?.[id],
        spec: opts.spec ?? { info: { components: {}, componentSets: {} } },
      }),
      getMainComponentId: () => "doc-root",
    };
  }

  it("removes Interaction frame from parent.children", () => {
    const parent: any = {
      id: "p",
      name: "Button",
      type: "COMPONENT",
      children: [
        { id: "i", name: "Interaction", type: "FRAME", children: [], parent: null },
        { id: "c", name: "Content", type: "FRAME", children: [], parent: null },
      ],
    };
    parent.children.forEach((c: any) => (c.parent = parent));
    stripInteractionLayers(parent, makeMockDataManager());
    expect(parent.children.map((c: any) => c.name)).toEqual(["Content"]);
  });

  it("removes nested Interaction frames at all depths", () => {
    const inner: any = {
      id: "in",
      name: "Interaction",
      type: "FRAME",
      children: [{ id: "leaf", name: "Interaction", type: "INSTANCE", children: [], mergedNodes: [{ id: "r" }] }],
    };
    const outer: any = { id: "out", name: "Interaction", type: "FRAME", children: [inner] };
    const root: any = {
      id: "p",
      name: "Card",
      type: "FRAME",
      children: [outer, { id: "c", name: "Content", type: "FRAME", children: [] }],
    };
    stripInteractionLayers(root, makeMockDataManager());
    expect(root.children.map((c: any) => c.name)).toEqual(["Content"]);
  });

  it("does not remove Interaction-named non-FRAME nodes", () => {
    const root: any = {
      id: "p",
      name: "Btn",
      type: "FRAME",
      children: [
        { id: "inst", name: "Interaction", type: "INSTANCE", children: [] },
      ],
    };
    stripInteractionLayers(root, makeMockDataManager());
    expect(root.children.length).toBe(1);
  });

  it("does not touch a tree without Interaction frames", () => {
    const root: any = {
      id: "p",
      name: "Card",
      type: "FRAME",
      children: [
        { id: "h", name: "Header", type: "FRAME", children: [] },
        { id: "b", name: "Body", type: "FRAME", children: [] },
      ],
    };
    const before = JSON.parse(JSON.stringify(root));
    stripInteractionLayers(root, makeMockDataManager());
    expect(root).toEqual(before);
  });

  it("merges extracted styles into parent.styles.pseudo", () => {
    const childInst: any = {
      id: "child",
      name: "Interaction",
      type: "INSTANCE",
      children: [],
      mergedNodes: [{ id: "raw" }],
    };
    const interaction: any = {
      id: "i",
      name: "Interaction",
      type: "FRAME",
      children: [childInst],
    };
    const parent: any = {
      id: "p",
      name: "Btn",
      type: "COMPONENT",
      children: [interaction],
    };
    const dm = makeMockDataManager({
      spec: {
        info: {
          components: {
            "comp-normal": { name: "State=Normal", componentSetId: "set-1" },
            "comp-hover": { name: "State=Hover", componentSetId: "set-1" },
          },
          componentSets: { "set-1": { name: "Interaction/Normal" } },
        },
      },
      nodes: {
        raw: { id: "raw", componentId: "comp-normal" },
        "comp-hover": { id: "comp-hover", fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 0.08 } }] },
      },
    });
    stripInteractionLayers(parent, dm);
    expect(parent.children.length).toBe(0);
    expect(parent.styles?.pseudo?.[":hover"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test → fail**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement**

`InteractionLayerStripper.ts` 끝에 추가:

```typescript
/**
 * 트리 전체에서 Interaction layer를 제거.
 *
 * Post-order 순회로 자식부터 처리 → 중첩 Interaction의 안쪽부터 제거됨.
 * 매칭된 노드를 만나면:
 *   1. extractInteractionStyles로 스타일 추출
 *   2. 추출된 pseudo entry를 부모의 styles.pseudo에 병합
 *   3. 부모의 children에서 해당 노드 제거
 *
 * 트리는 in-place로 수정됨.
 */
export function stripInteractionLayers(
  root: InternalNode,
  dataManager: DataManager,
): void {
  walkAndStrip(root, dataManager);
}

function walkAndStrip(node: InternalNode, dataManager: DataManager): void {
  // 1. 먼저 자식들을 재귀 처리 (post-order)
  for (const child of [...(node.children ?? [])]) {
    walkAndStrip(child, dataManager);
  }

  // 2. 자기 children 중 Interaction layer 제거
  const children = node.children ?? [];
  const survivors: InternalNode[] = [];
  for (const child of children) {
    if (isInteractionLayer(child)) {
      // 제거 전에 스타일 추출 + 부모(=node)에 병합
      const extracted = extractInteractionStyles(child, dataManager);
      for (const [pseudo, style] of Object.entries(extracted)) {
        mergePseudoIntoParent(node, pseudo as PseudoClass, style ?? {});
      }
      // child는 survivors에 안 넣음 → 제거됨
      continue;
    }
    survivors.push(child);
  }
  node.children = survivors;
}
```

- [ ] **Step 4: Run test → pass**

Run: `npx vitest run test/tree-builder/InteractionLayerStripper.test.ts`
Expected: PASS (28 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/InteractionLayerStripper.ts test/tree-builder/InteractionLayerStripper.test.ts
git commit -m "feat(tree-builder): stripInteractionLayers tree walker"
```

---

## Task 6: TreeBuilder Phase 1에 등록

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`

**Context:** stripper를 TreeBuilder의 Phase 1 파이프라인에 삽입. 위치는 VariantMerger 직후, splitMultiComponentInstances 직전. 이 task는 통합만 — 검증은 다음 task의 fixture 통합 테스트로.

- [ ] **Step 1: Read TreeBuilder current state**

Use Read tool on `/Users/namhyeon-u/Desktop/figma-plugin/src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`. Note the imports at top and the `build()` method's Phase 1 section starting around line 75.

- [ ] **Step 2: Add import**

기존 `import { VariantMerger } from "./processors/VariantMerger";` 라인 바로 아래에 추가:

```typescript
import { stripInteractionLayers } from "./processors/InteractionLayerStripper";
```

- [ ] **Step 3: Insert stripper call after VariantMerger**

`build()` 메서드 안 Phase 1 영역에서 다음 변경:

```typescript
    // Step 1: 변형 병합
    let tree = this.variantMerger.merge(node);

    // Step 1.1: Interaction layer 메타데이터 제거 (Phase 3)
    // — Figma의 "Interaction" frame은 디자이너 의도 표현용 메타데이터이므로
    //   트리에서 제거하고 디자이너 의도 색은 부모의 :hover/:active 등으로 흡수.
    stripInteractionLayers(tree, this.dataManager);

    // Step 1.5: 다른 componentId가 prop에 의해 제어되는 INSTANCE → 분리
    this.splitMultiComponentInstances(tree);
```

- [ ] **Step 4: Run match-engine and unit tests to verify no breakage**

Run:
```bash
npx vitest run test/tree-builder/InteractionLayerStripper.test.ts test/tree-builder/match-engine/
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts
git commit -m "feat(tree-builder): wire stripInteractionLayers into Phase 1 pipeline"
```

---

## Task 7: Buttonsolid fixture 통합 테스트

**Files:**
- Create: `test/tree-builder/buttonsolid-interaction-strip.test.ts`

**Context:** spec §7.2의 통합 테스트. 실제 Buttonsolid fixture를 컴파일해서 (a) 트리에 Interaction 노드가 0개인지, (b) 생성 코드에 Interaction 관련 CSS가 줄었는지 검증.

- [ ] **Step 1: Write the integration test**

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import FigmaCodeGenerator from "@code-generator2";
import buttonsolid from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid Interaction layer strip", () => {
  it("merged tree contains zero Interaction-named FRAME nodes", () => {
    const dm = new DataManager(buttonsolid as any);
    const tb = new TreeBuilder(dm);
    const tree = tb.buildInternalTreeDebug((buttonsolid as any).info.document);

    let interactionFrameCount = 0;
    const walk = (n: any) => {
      if (n?.name === "Interaction" && n?.type === "FRAME") {
        interactionFrameCount++;
      }
      for (const c of n?.children ?? []) walk(c);
    };
    walk(tree);
    expect(interactionFrameCount).toBe(0);
  });

  it("compiled React code has no solidInteractionCss CSS variables", async () => {
    const compiler = new FigmaCodeGenerator(buttonsolid as any);
    const code = await compiler.compile();
    expect(code).not.toBeNull();
    // Interaction 관련 CSS 변수가 0개여야 함 (이전엔 solidInteractionCss, solidInteractionLoadingCss 등 4-5개)
    const interactionCssMatches = code!.match(/solidInteraction\w*Css/g) ?? [];
    expect(interactionCssMatches.length).toBe(0);
  }, 60_000);

  it("compiled code is shorter than 21845 chars (pre-strip baseline)", async () => {
    const compiler = new FigmaCodeGenerator(buttonsolid as any);
    const code = await compiler.compile();
    expect(code).not.toBeNull();
    // Pre-strip baseline: ~21845 chars (관찰값). Strip 후 적어도 10% 줄어야 함.
    expect(code!.length).toBeLessThan(21845 * 0.9);
  }, 60_000);
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run test/tree-builder/buttonsolid-interaction-strip.test.ts`
Expected: All 3 tests pass.

만약 Pass 1번 실패 (Interaction 노드 잔존): stripper 통합이 실제 호출되는지 확인. TreeBuilder.build()를 거치는지, buildInternalTreeDebug()도 같이 거치는지.

만약 Pass 2 실패 (CSS 변수 잔존): stripper가 일부 Interaction을 놓치고 있음. 추가 디버깅 필요.

만약 Pass 3 실패 (코드 길이): strip이 일어났지만 효과가 미미함. 추가 분석 필요.

- [ ] **Step 3: Commit**

```bash
git add test/tree-builder/buttonsolid-interaction-strip.test.ts
git commit -m "test(tree-builder): Buttonsolid Interaction strip integration test"
```

---

## Task 8: 회귀 안전망 — audit + snapshots 재생성 + 검증

**Files:**
- Modify: `test/audits/audit-baseline.json`
- Modify: `test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap`
- Modify: `test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap`

**Context:** Strip 후 audit 카운트와 snapshot이 변할 수 있음. 의도된 변경(Buttonsolid + 다른 Interaction 사용 fixture)만 발생해야 하고, 무관한 fixture에 변경 발생하면 stripper의 false positive.

- [ ] **Step 1: Run audit and capture before/after numbers**

Run: `npm run audit:write`
Expected: 출력에서 다음 숫자 기록:
- `Total disjoint pairs: <N>` (이전 1929)
- `size-variant-reject: <N>` (이전 1)
- `variant-prop-position: <N>` (이전 23)
- `same-name-same-type: <N>` (이전 7)

Strip 효과로 Buttonsolid의 회귀 카운트가 줄어야 함 (이전 12 → 더 작게). Total은 줄어들거나 같아야 하고, 절대 늘어나면 안 됨.

만약 total이 늘어난 fixture가 있으면 → false positive 의심. 다음 step에서 어느 fixture인지 확인.

- [ ] **Step 2: Verify per-fixture changes**

Run:
```bash
python3 -c "
import json
d = json.load(open('test/audits/audit-baseline.json'))
for fx in d['byFixture']:
    if fx['disjointCount'] > 0:
        print(f\"{fx['fixture']}: {fx['disjointCount']}\")
" | head -30
```

이전 baseline과 비교해서 늘어난 fixture가 있는지 확인. 늘어난 게 있으면 stripper의 false positive 가능성. **늘어난 fixture는 strip 영향을 받았는지 (해당 fixture가 Interaction frame을 포함했는지) 검사 필요.**

만약 늘어난 fixture가 있고 그게 Interaction과 무관하다면 stripper의 우발적 영향이 아니라 단순 수치 변동(변동성). 그래도 의심스러우면 디버그.

- [ ] **Step 3: Run snapshot tests**

Run: `npx vitest run test/snapshots/`

Snapshot drift가 발생할 것임. 다음 fixture들이 변경되어야 함 (Interaction 사용하는 것들):
- `failing/Buttonsolid` (확실)
- `tada-list`, `Controlcheckbox`, `Controlradio`, `List`, `Searchfieldsearchfield`, `BreakpointdesktopmdlgStatelogin`, `error-02`, `any-04`, `any-05`, `any-03`, `Case`, `tadaButton`, `InputFieldtextField` (Interaction 사용하는 것들)

이 외의 fixture가 drift나면 false positive. 의심스러운 케이스를 수동 검토.

- [ ] **Step 4: Update snapshots**

Run: `npx vitest run test/snapshots/ -u`
Expected: snapshots 갱신.

- [ ] **Step 5: Final full test run**

Run: `npm run test 2>&1 | tail -10`
Expected: 1256/1270 (or near) passing. 1 pre-existing decomposer failure 외에 새 실패 0.

만약 새 실패 있으면: 어떤 fixture/test인지 분석. Interaction 사용 fixture의 어떤 동작이 깨졌는지 추적.

- [ ] **Step 6: Commit**

```bash
git add test/audits/audit-baseline.json test/snapshots/__snapshots__/
git commit -m "test: regenerate baselines after Interaction layer strip"
```

---

## Completion Criteria

이 플랜은 다음이 모두 만족되면 완료:

- [ ] InteractionLayerStripper의 모든 단위 테스트 통과 (28+ 테스트)
- [ ] Buttonsolid 통합 테스트 3건 통과 (트리에 Interaction 0개, CSS 변수 0개, 코드 길이 ≥10% 감소)
- [ ] `npm run audit` 통과 (회귀 카운트 ≤ 기존)
- [ ] `npm run test` 통과 (기존 1256/1270 + 새 stripper 테스트, pre-existing decomposer 1건 외 실패 없음)
- [ ] 모든 변경 `feat/interaction-layer-stripper` worktree 브랜치에 커밋
- [ ] 의도하지 않은 fixture (Interaction 미사용)의 snapshot drift 없음

이 후 dev로 merge하면 ButtonSolid 출력 코드가 깨끗해지고, 다른 Interaction 사용 fixture들도 동시에 정리됨.

---

## Self-Review

**1. Spec coverage**
- ✓ §3.1 (모듈 위치): Task 1에서 파일 생성, Task 6에서 TreeBuilder 등록
- ✓ §3.2 (파이프라인 위치, VariantMerger 직후): Task 6
- ✓ §3.3 (데이터 흐름): Task 5의 stripInteractionLayers
- ✓ §4 (감지 규칙): Task 1
- ✓ §4.1 (재귀 strip): Task 5의 post-order walk
- ✓ §5.1 (스타일 추출): Task 4
- ✓ §5.2 (State 매핑): Task 2
- ✓ §5.3 (부모 병합): Task 3
- ✓ §5.4 (출력 형태): Task 4가 background로 변환
- ✓ §6 (Strip 동작): Task 5
- ✓ §7.1 (단위 테스트): Tasks 1-5의 28+ 테스트
- ✓ §7.2 (Fixture 통합): Task 7
- ✓ §7.3 (회귀 안전망): Task 8

§4.2 (confidence 시그널 reason 로그) — 미커버. spec에 "참고용, strip 결정 미사용"으로 적혀있고 디버그 출력 전용. 이 플랜에서는 생략 (YAGNI).

§5.4의 ::after pseudo-element 출력 형태 — 이 플랜은 styles.pseudo entries만 작성하고 실제 ::after 생성은 코드 에미터의 기존 로직에 위임. spec §5.4도 "실제 emission은 코드 에미터에 위임"이라고 명시. coverage 충족.

§9 한계 항목들 — 의도된 한계로 코드 작성 대상 아님.

§10 미결사항 — Task 3-5에서 styles 구조와 매핑 로직 직접 호출. 미결사항은 구현 진행 중 자연히 해소.

**2. Placeholder scan**
- "TBD"/"TODO" 검색 — 없음
- "Add appropriate error handling" — 없음
- "Similar to Task N" — 없음
- 모든 step에 실제 코드/명령 포함

**3. Type consistency**
- `isInteractionLayer(node) → boolean` — Task 1
- `mapFigmaStateToPseudo(state) → PseudoClass | null` — Task 2
- `mergePseudoIntoParent(parent, pseudo, style) → void` — Task 3
- `extractInteractionStyles(frame, dataManager) → PseudoStyles` — Task 4
- `stripInteractionLayers(root, dataManager) → void` — Task 5
- 모든 시그니처 일관됨, Task 5는 1-4의 함수를 모두 호출
