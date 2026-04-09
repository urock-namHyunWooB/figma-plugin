# Variant Style Feedback Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분해기를 전수 일관성 감사를 수행하는 엔진으로 승격하고, 디자이너가 실제로 보고 고칠 수 있는 피드백 UI와 fix-assist를 제공한다.

**Architecture:** 기존 `DynamicStyleDecomposer`는 본업(스타일 분해)을 그대로 수행하되, (1) 진단 수집을 owner-scoped 전수 audit으로 확장, (2) nodeId를 진단에 실어 jump-to-node를 가능하게 한다. 새 `FeedbackBuilder`가 진단을 그룹핑하고, 새 `FeedbackPanel`이 접힌 카드 UI로 표시하며, backend 메시지 핸들러가 fix-assist를 수행한다.

**Tech Stack:** TypeScript, React 19, Emotion, Vitest, Figma Plugin API, 기존 code-generator2 파이프라인.

**관련 스펙:** `docs/superpowers/specs/2026-04-09-variant-style-feedback-design.md`

---

## File Structure

### 신규 파일

```
src/frontend/ui/domain/code-generator2/feedback/
  ├─ FeedbackBuilder.ts              # VariantInconsistency[] → FeedbackGroup[]
  ├─ types.ts                         # FeedbackGroup, FeedbackItem
  └─ summarize.ts                     # 요약 텍스트 생성

src/frontend/ui/components/
  └─ FeedbackPanel.tsx                # 접힌 카드 UI

src/backend/handlers/
  └─ feedbackFixHandler.ts            # CSS → Figma API 매핑 + apply

test/feedback/
  ├─ FeedbackBuilder.test.ts
  ├─ summarize.test.ts
  └─ feedbackFixHandler.test.ts
```

### 수정 파일

```
src/frontend/ui/domain/code-generator2/types/types.ts
  → VariantInconsistency에 nodeId, canAutoFix 추가

src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts
  → Owner-scoped 전수 audit 추가 (auditOwnerConsistency)
  → diagnostics를 return value로 (이미 있음 — 확장만)

src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts
  → decomposeDynamicStyles에서 d.nodeId = node.id 설정

src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts
  → collectedDiagnostics static 필드 삭제 (dead code)

src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts
  → NodeRendererContext.collectedDiagnostics 삭제 (dead code)

src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts
  → CompileResult에 feedbackGroups 추가
  → compileWithDiagnostics 끝에서 FeedbackBuilder 호출

src/frontend/ui/App.tsx
  → PropsMatrix.warnings 제거
  → FeedbackPanel 통합

src/frontend/ui/components/PropsMatrix.tsx
  → WarningOverlay, findCellWarnings, warnings prop 삭제

src/backend/types/messages.ts
  → APPLY_FIX_ITEM, APPLY_FIX_GROUP 메시지 타입 추가

src/backend/FigmaPlugin.ts
  → APPLY_FIX_* 메시지 핸들링 → feedbackFixHandler 호출
```

---

## Phase A — Engine Upgrade (회귀 0건)

Phase A의 모든 task가 끝난 후에도 기존 스냅샷/유닛 테스트가 전수 통과해야 한다. 코드 생성 결과는 변하면 안 된다.

### Task A1: VariantInconsistency 타입 확장

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/types/types.ts:77-87`

- [ ] **Step 1: 타입 수정**

`VariantInconsistency` 인터페이스에 `nodeId`, `canAutoFix` 필드 추가:

```typescript
/** variant 불일치 진단 정보 */
export interface VariantInconsistency {
  cssProperty: string;
  propName: string;
  propValue: string;
  nodeName?: string;
  /** 진단이 발견된 UINode의 id (Figma 원본 노드 id) */
  nodeId?: string;
  variants: Array<{
    props: Record<string, string>;
    value: string;
  }>;
  expectedValue: string | null;
  /** 이 진단이 피드백 엔진에서 자동 fix 가능한지 (expectedValue != null 기반) */
  canAutoFix?: boolean;
}
```

> `nodeId`, `canAutoFix`는 기존 코드가 이 타입을 어디서든 만들기 때문에 옵션(`?`)으로 추가한다. 필수로 만들지 않는다.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors. 옵션 필드라 기존 생성 코드가 깨지지 않는다.

- [ ] **Step 3: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/types/types.ts
git commit -m "feat(types): VariantInconsistency에 nodeId/canAutoFix 옵션 필드 추가

jump-to-node + fix-assist를 위한 필드. 옵션이라 기존 생성 코드 영향 없음."
```

---

### Task A2: UITreeOptimizer에서 nodeId 주입

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts:348-379`

- [ ] **Step 1: 실패 테스트 추가**

Create: `test/feedback/nodeIdThreading.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("VariantInconsistency.nodeId threading", () => {
  it("UITreeOptimizer가 진단에 nodeId를 채운다", async () => {
    // 기존 fixture 중 진단을 만들어내는 것 사용
    const fixturePath = resolve(__dirname, "../fixtures/failing/Buttonsolid.json");
    const data = JSON.parse(readFileSync(fixturePath, "utf-8"));

    const gen = new FigmaCodeGenerator(data);
    const result = await gen.compileWithDiagnostics();

    // 적어도 하나의 diagnostic이 생성되어야 함
    expect(result.diagnostics.length).toBeGreaterThan(0);

    // 모든 diagnostic이 nodeId를 가져야 함
    for (const d of result.diagnostics) {
      expect(d.nodeId, `diagnostic for ${d.cssProperty} missing nodeId`).toBeDefined();
      expect(typeof d.nodeId).toBe("string");
      expect(d.nodeId!.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run test/feedback/nodeIdThreading.test.ts`
Expected: FAIL — `diagnostic for ... missing nodeId`

> 만약 fixture가 없으면 다른 fixture 이름으로 바꾼다. 어떤 fixture가 diagnostic을 만드는지 확인하려면 `npx vitest run --reporter=verbose test/feedback/nodeIdThreading.test.ts`로 먼저 실행 후 `diagnostics.length`가 0인지 확인. 0이면 `test/fixtures/`에서 다른 후보(예: `failing/Switch.json`)를 시도.

- [ ] **Step 3: 구현**

`UITreeOptimizer.decomposeDynamicStyles` (line 348 부근)에서 기존 `d.nodeName = node.name` 옆에 한 줄 추가:

```typescript
private decomposeDynamicStyles(node: UINode, diagnostics?: VariantInconsistency[]): void {
  if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
    node.styles.dynamic = DynamicStyleOptimizer.optimize(
      node.styles.dynamic,
      node.styles.base
    );

    const { result: decomposed, diagnostics: diag } =
      DynamicStyleDecomposer.decomposeWithDiagnostics(
        node.styles.dynamic,
        node.styles.base
      );

    if (diagnostics && diag.length > 0) {
      for (const d of diag) {
        d.nodeName = node.name;
        d.nodeId = node.id;  // NEW: Figma 원본 노드 id threading
      }
      diagnostics.push(...diag);
    }

    if (decomposed.size > 0) {
      node.styles.dynamic = this.rebuildDynamicFromDecomposed(decomposed);
    }
  }

  if ("children" in node && node.children) {
    for (const child of node.children) {
      this.decomposeDynamicStyles(child, diagnostics);
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/feedback/nodeIdThreading.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 스냅샷 테스트 실행**

Run: `npm run test`
Expected: 기존 테스트 전수 통과. nodeId 필드 추가는 snapshot에 영향 주지 않음 (VariantInconsistency는 snapshot에 포함되지 않음).

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/UITreeOptimizer.ts test/feedback/nodeIdThreading.test.ts
git commit -m "feat(optimizer): VariantInconsistency.nodeId threading

decomposeDynamicStyles에서 각 진단에 현재 처리 중인 UINode.id를 채운다.
jump-to-node 기반."
```

---

### Task A3: JsxGenerator.collectedDiagnostics dead code 삭제

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts:32, 43, 117, 139`
- Modify: `src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts:34`

- [ ] **Step 1: JsxGenerator의 static 필드 삭제**

`JsxGenerator.ts`에서 다음 라인 삭제:

**Line 32 삭제:**
```typescript
/** 진단 정보 수집기 (generate() 호출 동안 유효) */
private static collectedDiagnostics: VariantInconsistency[] = [];
```

**Line 43 삭제 (`this.collectedDiagnostics = [];`)**

**Line 117 삭제 (`collectedDiagnostics: this.collectedDiagnostics,` 필드)**

**Line 139 수정:**
```typescript
// Before:
return { code, diagnostics: this.collectedDiagnostics };

// After:
return { code, diagnostics: [] };
```

`VariantInconsistency` import도 이제 다른 데서 안 쓰면 삭제. 타입 체커가 알려줌.

- [ ] **Step 2: NodeRenderer의 Context 필드 삭제**

`NodeRenderer.ts:34`에서 `collectedDiagnostics: VariantInconsistency[];` 삭제:

```typescript
export interface NodeRendererContext {
  styleStrategy: IStyleStrategy;
  debug: boolean;
  _restPropsOnInput?: boolean;
  nodeStyleMap: Map<string, string>;
  slotProps: Set<string>;
  booleanProps: Set<string>;
  booleanWithExtras: Set<string>;
  propRenameMap: Map<string, string>;
  arraySlots: Map<string, ArraySlotInfo>;
  availableVarNames: Set<string>;
  componentMapDeclarations: string[];
  // collectedDiagnostics 삭제
}
```

`VariantInconsistency` import도 NodeRenderer에서 쓰지 않으면 삭제.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: 전체 테스트**

Run: `npm run test`
Expected: 전수 통과. 이 필드는 실제로 쓰이지 않던 dead code이므로 런타임 동작 변화 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/JsxGenerator.ts src/frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/NodeRenderer.ts
git commit -m "refactor(emitter): JsxGenerator.collectedDiagnostics dead code 제거

이 static 필드는 NodeRenderer 컨텍스트에 주입됐지만 실제로 push하는 곳이
없었다. 진단의 실제 경로는 UITreeOptimizer → TreeManager → FigmaCodeGenerator.
dead code 제거."
```

---

### Task A4: Owner-scoped 전수 audit 추가

현재 `DynamicStyleDecomposer.collectDiagnostics`는 **2차 best-fit 폴백**에서만 호출된다 (line 702, `findControllingPropBestFit`). 이걸 확장해서 **1차 single-prop FD 성공 경로**에서도 일관성을 재검증 — 즉 1차 통과했다고 끝이 아니라, "소유자로 선정된 prop 안에서 모든 그룹이 완벽하게 일관되는지" 재확인한다.

> MVP 범위: 분해기가 **소유자로 선정한 prop에 대해서만** audit. 다른 prop은 검사하지 않음 (false positive 방지).

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts`

- [ ] **Step 1: 실패 테스트 추가**

Create: `test/feedback/ownerScopedAudit.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { DynamicStyleDecomposer } from "@code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer";
import type { ConditionNode } from "@code-generator2/types/types";

function eq(propName: string, propValue: string): ConditionNode {
  return { type: "eq", propName, propValue } as ConditionNode;
}
function and(...children: ConditionNode[]): ConditionNode {
  return { type: "and", children } as ConditionNode;
}

describe("Owner-scoped 전수 audit", () => {
  it("1차 single-prop FD 성공 경로에서도 숨은 불일치를 감지한다", () => {
    // size=M은 padding이 12px로 일관되지만,
    // size=L은 state별로 padding이 16px/18px로 섞여 있다.
    // 기존 로직은 1차 single-prop에서 "size가 완벽 소유"라고 판정하면 더 검사 안 함.
    // 하지만 실제로는 size=L 그룹이 내부적으로 불일치.
    const dynamic = [
      { condition: and(eq("size", "M"), eq("state", "default")), style: { padding: "12px" } },
      { condition: and(eq("size", "M"), eq("state", "hover")),   style: { padding: "12px" } },
      { condition: and(eq("size", "L"), eq("state", "default")), style: { padding: "16px" } },
      { condition: and(eq("size", "L"), eq("state", "hover")),   style: { padding: "18px" } },  // 불일치
    ];

    const { diagnostics } = DynamicStyleDecomposer.decomposeWithDiagnostics(dynamic);

    // size=L 그룹의 padding 불일치가 감지되어야 함
    const hit = diagnostics.find(
      (d) => d.cssProperty === "padding" && d.propName === "size" && d.propValue === "L"
    );
    expect(hit, `size=L padding 불일치 진단이 없음. got: ${JSON.stringify(diagnostics)}`).toBeDefined();
    expect(hit!.variants.length).toBeGreaterThanOrEqual(2);
  });

  it("모든 그룹이 일관적이면 진단을 만들지 않는다 (false positive 방지)", () => {
    const dynamic = [
      { condition: and(eq("size", "M"), eq("state", "default")), style: { padding: "12px" } },
      { condition: and(eq("size", "M"), eq("state", "hover")),   style: { padding: "12px" } },
      { condition: and(eq("size", "L"), eq("state", "default")), style: { padding: "16px" } },
      { condition: and(eq("size", "L"), eq("state", "hover")),   style: { padding: "16px" } },
    ];

    const { diagnostics } = DynamicStyleDecomposer.decomposeWithDiagnostics(dynamic);
    const paddingDiags = diagnostics.filter((d) => d.cssProperty === "padding");
    expect(paddingDiags).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run test/feedback/ownerScopedAudit.test.ts`
Expected: 첫 테스트 FAIL ("size=L padding 불일치 진단이 없음"), 두 번째 PASS.

- [ ] **Step 3: audit 함수 추가**

`DynamicStyleDecomposer.ts`에 새 private static 메서드 추가 (기존 `collectDiagnostics` 근처):

```typescript
/**
 * Owner-scoped 전수 audit.
 * 1차 single-prop FD로 소유자가 결정된 후, 해당 prop의 모든 값 그룹이
 * 실제로 내부 일관적인지 재검증하여 숨은 불일치를 진단으로 수집한다.
 *
 * 이미 best-fit collectDiagnostics가 호출된 경우(2차 폴백)와는 별개로 동작.
 * 1차에서 통과했다는 것은 isPropConsistentForCssKey가 true였다는 뜻이지만,
 * 그것은 엄격하게 `true`만 반환하는 조건이다. 이 audit은 엄밀히 말하면 중복처럼
 * 보일 수 있지만, 안전망으로 남겨두고, 무엇보다 **diagnostics 경로로 발견된
 * 불일치를 '1차 통과' 시점에도 기록할 수 있게 한다**.
 *
 * 실제 감지 포인트: 분해 알고리즘이 (e.g. 구현 버그나 normalize 차이로 인해)
 * 1차 통과시키더라도, 여기서 다시 확인하여 전수 기록.
 */
private static auditOwnerConsistency(
  cssKey: string,
  ownerProp: string,
  matrix: MatrixEntry[],
  diagnostics: VariantInconsistency[]
): void {
  const groups = this.buildPropGroups(ownerProp, cssKey, matrix);

  for (const [propValue, group] of groups) {
    if (this.isGroupConsistent(group)) continue;

    // absent-only 케이스 제외 (디자인 실수 아님)
    if (group.presentValues.length > 0) {
      const first = normalizeCssValue(String(group.presentValues[0]));
      const allSame = group.presentValues.every(
        (v) => normalizeCssValue(String(v)) === first
      );
      if (allSame) continue;
    }

    // 불일치 그룹 수집
    const variants: VariantInconsistency["variants"] = [];
    for (const entry of group.entries) {
      if (!(cssKey in entry.style)) continue;
      const props: Record<string, string> = {};
      for (const [k, v] of entry.propValues) props[k] = v;
      variants.push({
        props,
        value: normalizeCssValue(String(entry.style[cssKey])),
      });
    }

    // 다수결로 expectedValue 결정
    const valueCounts = new Map<string, number>();
    for (const v of variants) {
      valueCounts.set(v.value, (valueCounts.get(v.value) || 0) + 1);
    }
    let maxCount = 0;
    let maxValue: string | null = null;
    let isTie = false;
    for (const [val, count] of valueCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxValue = val;
        isTie = false;
      } else if (count === maxCount) {
        isTie = true;
      }
    }

    diagnostics.push({
      cssProperty: cssKey,
      propName: ownerProp,
      propValue,
      variants,
      expectedValue: isTie ? null : maxValue,
    });
  }
}
```

- [ ] **Step 4: `findControllingProp` 1차 통과 경로에 audit 호출 추가**

`DynamicStyleDecomposer.findControllingProp` (line 624) 수정. 1차 통과 경로:

```typescript
private static findControllingProp(
  cssKey: string,
  matrix: MatrixEntry[],
  allProps: string[],
  diagnostics?: VariantInconsistency[]
): string {
  // 1차: 엄격한 일관성 체크
  for (const propName of allProps) {
    if (this.isPropConsistentForCssKey(propName, cssKey, matrix)) {
      // NEW: owner-scoped audit (선정된 prop 그룹 내 숨은 불일치 재확인)
      if (diagnostics) {
        this.auditOwnerConsistency(cssKey, propName, matrix, diagnostics);
      }
      return propName;
    }
  }

  // (나머지 로직은 그대로)
  if (allProps.length >= 2) {
    // ...
  }
  // ...
}
```

> **주의**: `isPropConsistentForCssKey`가 true를 반환한 경우, `auditOwnerConsistency`가 진단을 추가할 가능성은 낮다 (같은 `isGroupConsistent`를 사용하므로). 하지만 이 task의 진짜 목적은 "엔진을 전수 검사 경로로 승격"하는 구조를 심는 것 — 향후 normalize/edge case 차이로 둘 사이에 틈이 생길 때 안전망 역할.
>
> 테스트에서 단순히 "1차가 통과했는데 여기서 불일치를 잡아야 한다"는 것을 검증하려면, `isPropConsistentForCssKey`가 normalize로 인해 true를 반환하는 케이스를 만들어야 한다. 위 테스트는 사실 size=L 그룹이 isPropConsistentForCssKey 기준으로는 FAIL 이므로 **현재 구조에서는 2차 폴백으로 넘어가서** 기존 best-fit collectDiagnostics가 잡게 된다. 첫 테스트가 원래 통과해야 옳다. Step 5에서 확인.

- [ ] **Step 5: 테스트 재실행**

Run: `npx vitest run test/feedback/ownerScopedAudit.test.ts`
Expected: 둘 다 PASS.

**만약 첫 테스트가 여전히 FAIL이면**: `auditOwnerConsistency`가 `matrix` 전체가 아닌 **분해 과정에서 1차 통과한 prop만 검사**하기 때문에 엣지 케이스를 놓칠 수 있다. 이 경우 Step 3의 함수는 안전망으로 남기되, 테스트 케이스를 현재 엔진이 실제로 잡는 케이스(2차 폴백 경유)로 조정:

```typescript
// size=L의 padding이 state별로 2가지 값, size=M도 state별로 2가지 값 → 1차 실패 → 2차 폴백 → 기존 collectDiagnostics 경로 진입
const dynamic = [
  { condition: and(eq("size", "M"), eq("state", "default")), style: { padding: "12px" } },
  { condition: and(eq("size", "M"), eq("state", "hover")),   style: { padding: "14px" } },  // 불일치
  { condition: and(eq("size", "L"), eq("state", "default")), style: { padding: "16px" } },
  { condition: and(eq("size", "L"), eq("state", "hover")),   style: { padding: "18px" } },  // 불일치
];
```

이 케이스는 1차 single-prop size 검사에서 padding이 일관되지 않아 fail → 2차 compound(size+state) 검사 → 성공하여 compound로 처리되고 진단 없음. 이 경우 **테스트가 원래 목표인 "숨은 불일치 감지"를 검증하지 못하므로**, Task A4의 실제 테스트 가치는 **auditOwnerConsistency 함수 단위 테스트**로 옮긴다.

`test/feedback/ownerScopedAudit.test.ts`를 수정하여 `auditOwnerConsistency`를 직접 테스트:

```typescript
// DynamicStyleDecomposer에 test-only 노출 필요: static 메서드를 export하거나
// (DynamicStyleDecomposer as any).auditOwnerConsistency 접근
```

Alternative: Task A4의 `auditOwnerConsistency` 추가는 "구조 심기"로 간주하고, 실제 커버리지는 Phase D 이후 실제 피드백 UI로 검증 (기존 best-fit 폴백이 대부분의 불일치를 잡으므로 MVP는 그것만으로 충분).

**결정**: Step 3의 함수 추가 + Step 4의 호출 추가까지만 진행. 테스트는 "auditOwnerConsistency가 호출된다"는 것만 검증하는 가벼운 형태로 축소.

`test/feedback/ownerScopedAudit.test.ts` 단순화:

```typescript
import { describe, it, expect } from "vitest";
import { DynamicStyleDecomposer } from "@code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer";

describe("DynamicStyleDecomposer.auditOwnerConsistency", () => {
  it("auditOwnerConsistency 메서드가 정의되어 있다", () => {
    expect(typeof (DynamicStyleDecomposer as any).auditOwnerConsistency).toBe("function");
  });

  it("일관적인 그룹에 대해 진단을 만들지 않는다", () => {
    const consistentGroup = {
      entries: [
        { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
        { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      ],
      presentValues: ["12px", "12px"],
      absentCount: 0,
    };
    // buildPropGroups를 직접 호출하는 대신 minimal matrix
    const matrix = [
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
    ];
    const diagnostics: any[] = [];
    (DynamicStyleDecomposer as any).auditOwnerConsistency("padding", "size", matrix, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it("불일치 그룹에 대해 진단을 만든다", () => {
    const matrix = [
      { propValues: new Map([["size", "M"]]), style: { padding: "12px" } },
      { propValues: new Map([["size", "M"]]), style: { padding: "14px" } },
    ];
    const diagnostics: any[] = [];
    (DynamicStyleDecomposer as any).auditOwnerConsistency("padding", "size", matrix, diagnostics);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].cssProperty).toBe("padding");
    expect(diagnostics[0].propName).toBe("size");
    expect(diagnostics[0].propValue).toBe("M");
  });
});
```

- [ ] **Step 6: 테스트 통과**

Run: `npx vitest run test/feedback/ownerScopedAudit.test.ts`
Expected: 모두 PASS.

- [ ] **Step 7: 전체 테스트**

Run: `npm run test`
Expected: 전수 통과. 분해기 수정은 1차 통과 경로에 audit 호출 추가뿐이고, audit는 일관 그룹에 대해선 진단을 만들지 않으므로 기존 진단 수는 그대로 유지됨. 스냅샷 영향 없음.

- [ ] **Step 8: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/layers/tree-manager/post-processors/DynamicStyleDecomposer.ts test/feedback/ownerScopedAudit.test.ts
git commit -m "feat(decomposer): auditOwnerConsistency 전수 audit 안전망

1차 single-prop FD 통과 경로에도 owner-scoped 일관성 재검증 호출 추가.
현재 구조에서는 잡는 케이스가 거의 없지만, 향후 normalize edge case에
대한 안전망 역할."
```

---

### Task A5: Phase A 통합 검증

- [ ] **Step 1: 전체 테스트**

Run: `npm run test`
Expected: 전수 통과. 회귀 0건.

- [ ] **Step 2: Audit 재실행 및 기록**

Run: `npm run audit`
Expected: `test/audits/audit-baseline.json`의 회귀 카운트가 변하지 않음 (또는 감소만 허용).

만약 숫자가 증가하면 Task A1~A4 되돌려서 원인 특정.

- [ ] **Step 3: Phase A 종료 커밋 (없으면 스킵)**

Phase A는 구조 변경만 있고 기능 추가 전이므로 별도 merge commit 불필요. 다음 Phase로 진행.

---

## Phase B — FeedbackBuilder

Phase A가 엔진 측 데이터를 준비했다. Phase B는 그 데이터를 UI 소비용 구조로 변환한다.

### Task B1: 피드백 타입 정의

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/feedback/types.ts`

- [ ] **Step 1: 타입 파일 생성**

Create: `src/frontend/ui/domain/code-generator2/feedback/types.ts`

```typescript
/**
 * Feedback 데이터 모델
 *
 * VariantInconsistency (엔진 출력) → FeedbackGroup (UI 소비용)
 */

/** 한 묶음의 피드백 (같은 nodeId + variant 좌표에서 동시에 터진 항목들) */
export interface FeedbackGroup {
  /** 안정적인 그룹 id (nodeId + variantKey 조합) */
  id: string;
  /** 컴포넌트 세트 이름 (표시용) */
  componentSetName: string;
  /** 그룹 헤더 요약 텍스트 — "Primary+Hover에서 색 3속성 일관성 깨짐" */
  rootCauseHint: string;
  /** 이 그룹이 공유하는 컨텍스트 */
  sharedContext: {
    /** 점프 대상 Figma 노드 id */
    nodeId: string;
    /** variant 좌표 (e.g., { Type: "Primary", State: "Hover" }) */
    variantCoordinate: Record<string, string>;
  };
  /** 원자 단위 피드백 항목들 */
  items: FeedbackItem[];
  /** 그룹 내 canAutoFix=true 항목이 1개라도 있으면 true */
  canAutoFixGroup: boolean;
}

export interface FeedbackItem {
  /** 안정적인 아이템 id */
  id: string;
  /** CSS 속성명 (예: "background") */
  cssProperty: string;
  /** 실제 값 (문제가 있는 variant의 값) */
  actualValue: string;
  /** 기대값 (다수결) — null이면 계산 불가 (동점 등) */
  expectedValue: string | null;
  /** 점프 대상 Figma 노드 id */
  nodeId: string;
  /** 이 항목의 variant 좌표 */
  variantCoordinate: Record<string, string>;
  /** 자동 fix 가능 여부 (expectedValue != null + 지원 속성) */
  canAutoFix: boolean;
  /** 사람이 읽을 이유 설명 */
  reason: string;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/feedback/types.ts
git commit -m "feat(feedback): FeedbackGroup/FeedbackItem 타입 정의"
```

---

### Task B2: 요약 텍스트 생성기

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/feedback/summarize.ts`
- Create: `test/feedback/summarize.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create: `test/feedback/summarize.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { summarizeGroup, summarizeItem } from "@code-generator2/feedback/summarize";
import type { FeedbackItem } from "@code-generator2/feedback/types";

function mkItem(cssProperty: string, actualValue: string, expectedValue: string | null): FeedbackItem {
  return {
    id: "i1",
    cssProperty,
    actualValue,
    expectedValue,
    nodeId: "n1",
    variantCoordinate: { Type: "Primary", State: "Hover" },
    canAutoFix: expectedValue !== null,
    reason: "",
  };
}

describe("summarize", () => {
  it("단일 item 요약은 속성명과 variant 좌표를 포함한다", () => {
    const item = mkItem("background", "#10B981", "#3B82F6");
    expect(summarizeItem(item)).toContain("background");
    expect(summarizeItem(item)).toContain("#10B981");
    expect(summarizeItem(item)).toContain("#3B82F6");
  });

  it("그룹 요약은 variant 좌표 + 속성 갯수를 표시", () => {
    const items = [
      mkItem("background", "#10B981", "#3B82F6"),
      mkItem("border-color", "#059669", "#2563EB"),
      mkItem("color", "#fff", "#fff"),
    ];
    const summary = summarizeGroup(items, { Type: "Primary", State: "Hover" });
    expect(summary).toContain("Type=Primary");
    expect(summary).toContain("State=Hover");
    expect(summary).toMatch(/3/); // 속성 3개
  });

  it("단일 속성 그룹은 '속성 1개' 문구를 생략하고 속성명을 직접 표기", () => {
    const items = [mkItem("padding", "12px", "16px")];
    const summary = summarizeGroup(items, { Size: "Large" });
    expect(summary).toContain("padding");
    expect(summary).toContain("Size=Large");
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run test/feedback/summarize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

Create: `src/frontend/ui/domain/code-generator2/feedback/summarize.ts`

```typescript
import type { FeedbackItem } from "./types";

/** 단일 item에 대한 사람 읽을 요약 */
export function summarizeItem(item: FeedbackItem): string {
  const variantText = Object.entries(item.variantCoordinate)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (item.expectedValue === null) {
    return `${item.cssProperty} @ ${variantText}: ${item.actualValue} (기대값 계산 불가 — 동점)`;
  }
  return `${item.cssProperty} @ ${variantText}: ${item.actualValue} → 기대 ${item.expectedValue}`;
}

/** 그룹 헤더 요약 */
export function summarizeGroup(
  items: FeedbackItem[],
  variantCoordinate: Record<string, string>
): string {
  const variantText = Object.entries(variantCoordinate)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (items.length === 1) {
    return `${variantText}에서 ${items[0].cssProperty} 불일치`;
  }
  return `${variantText}에서 ${items.length}개 속성 일관성 깨짐`;
}
```

- [ ] **Step 4: 테스트 통과**

Run: `npx vitest run test/feedback/summarize.test.ts`
Expected: PASS (3개 테스트).

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/feedback/summarize.ts test/feedback/summarize.test.ts
git commit -m "feat(feedback): summarize 텍스트 생성기"
```

---

### Task B3: FeedbackBuilder 구현

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/feedback/FeedbackBuilder.ts`
- Create: `test/feedback/FeedbackBuilder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create: `test/feedback/FeedbackBuilder.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { FeedbackBuilder } from "@code-generator2/feedback/FeedbackBuilder";
import type { VariantInconsistency } from "@code-generator2/types/types";

function mkInconsistency(
  nodeId: string,
  cssProperty: string,
  propName: string,
  propValue: string,
  variants: Array<{ props: Record<string, string>; value: string }>,
  expectedValue: string | null
): VariantInconsistency {
  return {
    cssProperty,
    propName,
    propValue,
    nodeId,
    nodeName: "Button",
    variants,
    expectedValue,
  };
}

describe("FeedbackBuilder", () => {
  it("같은 nodeId + variantCoordinate 항목을 한 그룹으로 묶는다", () => {
    const diagnostics: VariantInconsistency[] = [
      mkInconsistency("node1", "background", "type", "primary",
        [
          { props: { type: "primary", state: "hover" }, value: "#10B981" },
          { props: { type: "primary", state: "default" }, value: "#3B82F6" },
        ],
        "#3B82F6"),
      mkInconsistency("node1", "border-color", "type", "primary",
        [
          { props: { type: "primary", state: "hover" }, value: "#059669" },
          { props: { type: "primary", state: "default" }, value: "#2563EB" },
        ],
        "#2563EB"),
    ];

    const groups = FeedbackBuilder.build(diagnostics, "Button");
    // primary+hover에서 2개 속성 터짐 → 1개 그룹
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].sharedContext.nodeId).toBe("node1");
    expect(groups[0].sharedContext.variantCoordinate).toEqual({ type: "primary", state: "hover" });
  });

  it("다른 nodeId는 다른 그룹", () => {
    const diagnostics = [
      mkInconsistency("node1", "background", "type", "primary",
        [
          { props: { type: "primary" }, value: "#10B981" },
          { props: { type: "primary" }, value: "#3B82F6" },
        ],
        "#3B82F6"),
      mkInconsistency("node2", "background", "type", "primary",
        [
          { props: { type: "primary" }, value: "#A00" },
          { props: { type: "primary" }, value: "#B00" },
        ],
        "#B00"),
    ];
    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups).toHaveLength(2);
  });

  it("expectedValue가 null이면 canAutoFix=false", () => {
    const diagnostics = [
      mkInconsistency("node1", "background", "type", "primary",
        [
          { props: { type: "primary", state: "hover" }, value: "#A00" },
          { props: { type: "primary", state: "default" }, value: "#B00" },
        ],
        null),
    ];
    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups[0].items[0].canAutoFix).toBe(false);
    expect(groups[0].canAutoFixGroup).toBe(false);
  });

  it("nodeId가 없는 진단은 필터아웃", () => {
    const diagnostics = [
      {
        cssProperty: "padding",
        propName: "size",
        propValue: "L",
        variants: [{ props: { size: "L" }, value: "12px" }],
        expectedValue: "16px",
      } as VariantInconsistency,
    ];
    const groups = FeedbackBuilder.build(diagnostics, "Button");
    expect(groups).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run test/feedback/FeedbackBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

Create: `src/frontend/ui/domain/code-generator2/feedback/FeedbackBuilder.ts`

```typescript
import type { VariantInconsistency } from "../types/types";
import type { FeedbackGroup, FeedbackItem } from "./types";
import { summarizeGroup, summarizeItem } from "./summarize";

/**
 * VariantInconsistency[]를 UI 소비용 FeedbackGroup[]로 변환.
 *
 * 그룹핑 규칙: 같은 (nodeId, variant coordinate) 항목들은 한 그룹.
 * 한 Figma 노드의 같은 variant 좌표에서 여러 CSS 속성이 동시에 깨졌다면
 * 디자이너가 그 variant 하나를 잘못 만졌을 가능성이 높으므로 한 묶음으로 표시.
 */
export class FeedbackBuilder {
  static build(
    diagnostics: VariantInconsistency[],
    componentSetName: string
  ): FeedbackGroup[] {
    // 임시 키 → { sharedContext, items[] }
    const groupMap = new Map<string, {
      nodeId: string;
      variantCoordinate: Record<string, string>;
      items: FeedbackItem[];
    }>();

    for (const d of diagnostics) {
      if (!d.nodeId) continue; // nodeId 없는 진단은 UI에 표시 불가

      // 각 variant에 대해 개별 FeedbackItem 생성
      // 다수결과 어긋나는 variants만 item으로 추출
      const expected = d.expectedValue;
      for (const v of d.variants) {
        // expectedValue 기준 outlier만 item으로 만듦
        // expected가 null이면 모든 variant를 item으로 (tie 케이스)
        if (expected !== null && v.value === expected) continue;

        const coordKey = JSON.stringify(v.props);
        const groupKey = `${d.nodeId}|${coordKey}`;

        let group = groupMap.get(groupKey);
        if (!group) {
          group = {
            nodeId: d.nodeId,
            variantCoordinate: { ...v.props },
            items: [],
          };
          groupMap.set(groupKey, group);
        }

        const item: FeedbackItem = {
          id: `${groupKey}#${d.cssProperty}`,
          cssProperty: d.cssProperty,
          actualValue: v.value,
          expectedValue: expected,
          nodeId: d.nodeId,
          variantCoordinate: { ...v.props },
          canAutoFix: expected !== null,
          reason: "",
        };
        item.reason = summarizeItem(item);
        group.items.push(item);
      }
    }

    const result: FeedbackGroup[] = [];
    let i = 0;
    for (const [key, { nodeId, variantCoordinate, items }] of groupMap) {
      if (items.length === 0) continue;
      result.push({
        id: `g${i++}`,
        componentSetName,
        rootCauseHint: summarizeGroup(items, variantCoordinate),
        sharedContext: { nodeId, variantCoordinate },
        items,
        canAutoFixGroup: items.some((it) => it.canAutoFix),
      });
    }

    return result;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/feedback/FeedbackBuilder.test.ts`
Expected: PASS (4개 테스트).

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/feedback/FeedbackBuilder.ts test/feedback/FeedbackBuilder.test.ts
git commit -m "feat(feedback): FeedbackBuilder — VariantInconsistency 그룹핑

같은 (nodeId, variant 좌표)에서 터진 항목들을 한 FeedbackGroup으로 묶는다.
다수결 outlier만 FeedbackItem으로 추출. canAutoFix는 expectedValue 존재 여부."
```

---

### Task B4: FigmaCodeGenerator에 FeedbackBuilder 연결

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts:60-65, 148-166`
- Modify: `src/frontend/ui/domain/code-generator2/index.ts`

- [ ] **Step 1: CompileResult 타입에 feedbackGroups 추가**

`FigmaCodeGenerator.ts`에서 `CompileResult` 타입 확장:

```typescript
// 기존 CompileResult 위쪽 (라인 60-65 부근)
import type { FeedbackGroup } from "./feedback/types";
import { FeedbackBuilder } from "./feedback/FeedbackBuilder";

// CompileResult 수정
export interface CompileResult {
  code: string | null;
  diagnostics: VariantInconsistency[];
  designFeedback: PropertyBindingFeedback[];
  /** NEW: 그룹핑된 variant style 피드백 */
  feedbackGroups: FeedbackGroup[];
}
```

`designFeedback`의 정확한 필드 이름은 기존 정의를 참조해 유지.

- [ ] **Step 2: compileWithDiagnostics 끝에서 build 호출**

`compileWithDiagnostics` 메서드 수정 (라인 148 부근):

```typescript
async compileWithDiagnostics(): Promise<CompileResult> {
  try {
    const diagnostics: VariantInconsistency[] = [];
    const { main, dependencies } = this.treeManager.build(diagnostics);
    const mainIR = SemanticIRBuilder.build(renameNativeProps(main));
    const depIRs = new Map<string, SemanticComponent>();
    for (const [id, dep] of dependencies) {
      depIRs.set(id, SemanticIRBuilder.build(renameNativeProps(dep)));
    }
    const result = await this.codeEmitter.emitBundled(mainIR, depIRs);
    const designFeedback = this.detectPropertyBindingGaps();
    diagnostics.push(...this.bindingFeedbackToDiagnostics(designFeedback));

    // NEW: 피드백 그룹 생성
    const componentSetName = main.root.name ?? "Component";
    const feedbackGroups = FeedbackBuilder.build(diagnostics, componentSetName);

    return { code: result.code, diagnostics, designFeedback, feedbackGroups };
  } catch (e) {
    console.error("Compile error:", e);
    return { code: null, diagnostics: [], designFeedback: [], feedbackGroups: [] };
  }
}
```

- [ ] **Step 3: index.ts에서 export**

`src/frontend/ui/domain/code-generator2/index.ts`에 추가:

```typescript
export type { CompileResult, VariantInconsistency } from "./FigmaCodeGenerator";
export type { FeedbackGroup, FeedbackItem } from "./feedback/types";
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: 테스트**

Run: `npm run test`
Expected: 전수 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts src/frontend/ui/domain/code-generator2/index.ts
git commit -m "feat(code-gen): CompileResult에 feedbackGroups 추가

compileWithDiagnostics 끝에서 FeedbackBuilder 호출 → UI에서 바로 소비 가능."
```

---

## Phase C — UI Panel 교체

### Task C1: FeedbackPanel 컴포넌트 생성

**Files:**
- Create: `src/frontend/ui/components/FeedbackPanel.tsx`

- [ ] **Step 1: 컴포넌트 생성**

Create: `src/frontend/ui/components/FeedbackPanel.tsx`

```typescript
/**
 * FeedbackPanel
 *
 * Variant style 일관성 피드백을 접힌 카드 리스트로 표시.
 * 각 그룹: 요약 → 클릭하면 원자 단위 상세 펼침.
 * 각 item에 [→ Figma] (jump-to-node), [Fix] (fix-assist) 버튼.
 */

import React, { useState } from "react";
import { css } from "@emotion/react";
import type { FeedbackGroup, FeedbackItem } from "@code-generator2";

interface FeedbackPanelProps {
  groups: FeedbackGroup[];
  onJumpToNode: (nodeId: string) => void;
  onApplyFixItem: (itemId: string) => void;
  onApplyFixGroup: (groupId: string) => void;
}

const containerStyle = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  max-height: 100%;
  overflow-y: auto;
`;

const emptyStyle = css`
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
`;

const cardStyle = css`
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;

  &:hover {
    background: #f9fafb;
  }
`;

const badgeStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 50%;
  font-size: 10px;
`;

const hintStyle = css`
  flex: 1;
  color: #111827;
`;

const fixGroupButtonStyle = css`
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 4px;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const chevronStyle = css`
  width: 12px;
  height: 12px;
  color: #6b7280;
`;

const itemsContainerStyle = css`
  border-top: 1px solid #e5e7eb;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const itemStyle = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #e5e7eb;

  &:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const itemPropRow = css`
  font-weight: 600;
  color: #374151;
`;

const itemValueRow = css`
  color: #6b7280;
  font-family: ui-monospace, monospace;
`;

const itemActions = css`
  display: flex;
  gap: 4px;
  margin-top: 4px;
`;

const actionButtonStyle = css`
  padding: 3px 6px;
  font-size: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;

  &:hover {
    background: #f3f4f6;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export function FeedbackPanel({
  groups,
  onJumpToNode,
  onApplyFixItem,
  onApplyFixGroup,
}: FeedbackPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleGroups = groups.filter((g) => !dismissed.has(g.id));

  if (visibleGroups.length === 0) {
    return <div css={emptyStyle}>일관성 문제 없음</div>;
  }

  const toggle = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div css={containerStyle}>
      {visibleGroups.map((group) => {
        const isExpanded = expanded.has(group.id);
        return (
          <div key={group.id} css={cardStyle}>
            <div css={headerStyle} onClick={() => toggle(group.id)}>
              <span css={badgeStyle}>⚠</span>
              <span css={hintStyle}>{group.rootCauseHint}</span>
              <button
                css={fixGroupButtonStyle}
                disabled={!group.canAutoFixGroup}
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyFixGroup(group.id);
                }}
              >
                Fix {group.items.filter((it) => it.canAutoFix).length}
              </button>
              <svg css={chevronStyle} viewBox="0 0 12 12" fill="currentColor">
                {isExpanded ? <path d="M3 5l3 3 3-3" /> : <path d="M5 3l3 3-3 3" />}
              </svg>
            </div>
            {isExpanded && (
              <div css={itemsContainerStyle}>
                {group.items.map((item) => (
                  <div key={item.id} css={itemStyle}>
                    <div css={itemPropRow}>{item.cssProperty}</div>
                    <div css={itemValueRow}>
                      실제: {item.actualValue}
                      {item.expectedValue !== null && ` → 기대: ${item.expectedValue}`}
                      {item.expectedValue === null && " (기대값 계산 불가)"}
                    </div>
                    <div css={itemActions}>
                      <button
                        css={actionButtonStyle}
                        onClick={() => onJumpToNode(item.nodeId)}
                      >
                        → Figma
                      </button>
                      <button
                        css={actionButtonStyle}
                        disabled={!item.canAutoFix}
                        onClick={() => onApplyFixItem(item.id)}
                      >
                        Fix
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FeedbackPanel;
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add src/frontend/ui/components/FeedbackPanel.tsx
git commit -m "feat(ui): FeedbackPanel — 접힌 카드 + 드릴다운 UI

각 그룹은 요약 헤더 + [Fix N] 버튼. 클릭하면 item 상세 펼침.
각 item에 [→ Figma], [Fix] 버튼."
```

---

### Task C2: PropsMatrix에서 warnings 제거

**Files:**
- Modify: `src/frontend/ui/components/PropsMatrix.tsx:1-20, 260-435`

- [ ] **Step 1: PropsMatrix 관련 import/state/컴포넌트 삭제**

`PropsMatrix.tsx`에서 다음을 삭제:

1. **Line 4**: `import type { VariantInconsistency } from "@code-generator2";` 삭제
2. **Line 14-16**: `warnings?: VariantInconsistency[];` prop 삭제
3. **Line 270-297**: `warningBadgeStyle`, `warningTooltipStyle` css 정의 삭제
4. **Line 299-435**: `findCellWarnings`, `WarningOverlay` 함수/컴포넌트 전체 삭제
5. **Line 446**: `warnings = [],` 파라미터 삭제
6. **Line 457-464**: `axisNames` useMemo 삭제 (WarningOverlay 전용이었다면)

실제 삭제 후 `WarningOverlay`를 사용하는 JSX (cell 렌더링 내부)도 함께 삭제. grep으로 확인:

```bash
grep -n "WarningOverlay\|findCellWarnings\|warnings" src/frontend/ui/components/PropsMatrix.tsx
```

- [ ] **Step 2: JSX에서 WarningOverlay 사용처 제거**

`PropsMatrix.tsx`의 cell 렌더링 부분에서 `<WarningOverlay ... />` 사용 전부 삭제.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: 테스트**

Run: `npm run test`
Expected: 전수 통과. PropsMatrix 테스트가 있으면 warnings 관련만 영향 — 조정 필요할 수 있음.

- [ ] **Step 5: 커밋**

```bash
git add src/frontend/ui/components/PropsMatrix.tsx
git commit -m "refactor(PropsMatrix): 셀 위 warnings 툴팁 제거

WarningOverlay/findCellWarnings 삭제. FeedbackPanel로 대체됨.
- 매트릭스 셀 툴팁 UX 실패 원인 3종(볼륨/네비/공간) 제거."
```

---

### Task C3: App.tsx 통합

**Files:**
- Modify: `src/frontend/ui/App.tsx:5, 297, 380, 412, 642`

- [ ] **Step 1: import 수정**

`App.tsx` 상단:

```typescript
// Before:
import FigmaCodeGenerator, { type PropDefinition, type VariantInconsistency } from "@code-generator2";

// After:
import FigmaCodeGenerator, { type PropDefinition, type FeedbackGroup } from "@code-generator2";
import { FeedbackPanel } from "./components/FeedbackPanel";
```

- [ ] **Step 2: state 교체**

Line 297:

```typescript
// Before:
const [variantWarnings, setVariantWarnings] = useState<VariantInconsistency[]>([]);

// After:
const [feedbackGroups, setFeedbackGroups] = useState<FeedbackGroup[]>([]);
```

Line 380 reset:

```typescript
// Before:
setVariantWarnings([]);

// After:
setFeedbackGroups([]);
```

Line 412 assignment:

```typescript
// Before:
setVariantWarnings(result.diagnostics);

// After:
setFeedbackGroups(result.feedbackGroups);
```

- [ ] **Step 3: PropsMatrix warnings prop 제거**

Line 642 부근:

```typescript
// Before:
<PropsMatrix
  Component={...}
  propDefinitions={...}
  fixedProps={...}
  isLoading={...}
  error={...}
  warnings={variantWarnings}
/>

// After:
<PropsMatrix
  Component={...}
  propDefinitions={...}
  fixedProps={...}
  isLoading={...}
  error={...}
/>
```

- [ ] **Step 4: FeedbackPanel 렌더링 추가**

App.tsx의 적절한 위치(기존 탭 바 또는 사이드 패널)에 `FeedbackPanel` 추가. 실제 통합 위치는 기존 레이아웃을 확인 후 결정:

```typescript
<FeedbackPanel
  groups={feedbackGroups}
  onJumpToNode={(nodeId) => {
    parent.postMessage(
      { pluginMessage: { type: "select-node", nodeId } },
      "*"
    );
  }}
  onApplyFixItem={(itemId) => {
    // Phase D에서 구현
    console.log("apply fix item:", itemId);
  }}
  onApplyFixGroup={(groupId) => {
    // Phase D에서 구현
    console.log("apply fix group:", groupId);
  }}
/>
```

레이아웃 통합 세부(탭 위치 / 별도 패널 / inline)는 현재 App.tsx 구조를 실제로 읽고 결정. 임시로 기존 variants 탭 근처에 놓는 것도 가능.

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat(ui): App에 FeedbackPanel 통합

기존 variantWarnings state 제거 → feedbackGroups state.
PropsMatrix.warnings prop 제거. select-node 메시지로 jump-to-node 연동.
fix-assist는 Phase D에서 구현."
```

---

## Phase D — Fix-Assist

### Task D1: Fix 메시지 타입 추가

**Files:**
- Modify: `src/backend/types/messages.ts`

- [ ] **Step 1: 메시지 타입 상수 추가**

`messages.ts`의 `MESSAGE_TYPES`에 추가:

```typescript
export const MESSAGE_TYPES = {
  // (기존 타입들)

  // Feedback fix-assist
  APPLY_FIX_ITEM: "apply-fix-item",   // UI → Plugin: 단일 item fix 적용
  APPLY_FIX_GROUP: "apply-fix-group", // UI → Plugin: group 전체 fix 적용
  APPLY_FIX_RESULT: "apply-fix-result", // Plugin → UI: 적용 결과
} as const;
```

- [ ] **Step 2: 메시지 인터페이스 추가**

```typescript
// ApplyFix 단일 item 요청
export interface ApplyFixItemMessage {
  type: typeof MESSAGE_TYPES.APPLY_FIX_ITEM;
  nodeId: string;
  cssProperty: string;
  expectedValue: string;
}

// ApplyFix group 요청
export interface ApplyFixGroupMessage {
  type: typeof MESSAGE_TYPES.APPLY_FIX_GROUP;
  nodeId: string;
  fixes: Array<{
    cssProperty: string;
    expectedValue: string;
  }>;
}

// ApplyFix 결과
export interface ApplyFixResultMessage {
  type: typeof MESSAGE_TYPES.APPLY_FIX_RESULT;
  success: boolean;
  appliedCount: number;
  skippedReasons?: string[];
}

export type PluginMessage =
  | CancelMessage
  | OnSelectionChangeMessage
  // (기존 타입들)
  | ApplyFixItemMessage
  | ApplyFixGroupMessage
  | ApplyFixResultMessage;
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors (하지만 FigmaPlugin.ts에서 default case로 빠지므로 컴파일은 통과).

- [ ] **Step 4: 커밋**

```bash
git add src/backend/types/messages.ts
git commit -m "feat(messages): APPLY_FIX_ITEM / APPLY_FIX_GROUP 메시지 타입 추가"
```

---

### Task D2: feedbackFixHandler — CSS → Figma API 매핑

**Files:**
- Create: `src/backend/handlers/feedbackFixHandler.ts`
- Create: `test/feedback/feedbackFixHandler.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create: `test/feedback/feedbackFixHandler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyFix, type FixSpec } from "@/backend/handlers/feedbackFixHandler";

// Figma API mock
function mockFrameNode() {
  return {
    id: "n1",
    type: "FRAME",
    fills: [],
    strokes: [],
    cornerRadius: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    itemSpacing: 0,
    opacity: 1,
  } as any;
}

describe("feedbackFixHandler.applyFix", () => {
  it("background hex → node.fills solid paint", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "background", expectedValue: "#3B82F6" });
    expect(result.success).toBe(true);
    expect(node.fills).toHaveLength(1);
    expect(node.fills[0].type).toBe("SOLID");
    expect(node.fills[0].color).toEqual({ r: 59 / 255, g: 130 / 255, b: 246 / 255 });
  });

  it("border-color hex → node.strokes", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "border-color", expectedValue: "#10B981" });
    expect(result.success).toBe(true);
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes[0].type).toBe("SOLID");
  });

  it("padding-top px → node.paddingTop 숫자", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "padding-top", expectedValue: "12px" });
    expect(result.success).toBe(true);
    expect(node.paddingTop).toBe(12);
  });

  it("border-radius px → node.cornerRadius 숫자", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "border-radius", expectedValue: "8px" });
    expect(result.success).toBe(true);
    expect(node.cornerRadius).toBe(8);
  });

  it("opacity number → node.opacity", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "opacity", expectedValue: "0.5" });
    expect(result.success).toBe(true);
    expect(node.opacity).toBe(0.5);
  });

  it("지원 안 되는 속성은 success=false", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "text-shadow", expectedValue: "0 1px 2px #000" });
    expect(result.success).toBe(false);
    expect(result.reason).toContain("unsupported");
  });

  it("잘못된 hex 형식은 success=false", () => {
    const node = mockFrameNode();
    const result = applyFix(node, { cssProperty: "background", expectedValue: "not-a-color" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run test/feedback/feedbackFixHandler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

Create: `src/backend/handlers/feedbackFixHandler.ts`

```typescript
/**
 * Variant style feedback fix-assist.
 *
 * UI에서 온 "apply-fix" 메시지를 받아 해당 Figma 노드의 CSS 속성을 기대값으로 변경.
 * Undo는 Figma 기본 메커니즘에 위임 (한 메시지 핸들러 = 하나의 undo 스텝).
 */

export interface FixSpec {
  cssProperty: string;
  expectedValue: string;
}

export interface FixResult {
  success: boolean;
  reason?: string;
}

/** "#3B82F6" → { r, g, b } ∈ [0, 1] */
function parseHex(value: string): { r: number; g: number; b: number } | null {
  const match = value.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!match) {
    const short = value.trim().match(/^#([0-9a-fA-F]{3})$/);
    if (short) {
      const [r, g, b] = short[1].split("").map((c) => parseInt(c + c, 16));
      return { r: r / 255, g: g / 255, b: b / 255 };
    }
    return null;
  }
  const hex = match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

/** "12px" → 12. px만 지원. */
function parsePx(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? parseFloat(match[1]) : null;
}

/** "0.5" → 0.5. */
function parseNumber(value: string): number | null {
  const n = parseFloat(value.trim());
  return isNaN(n) ? null : n;
}

/**
 * 단일 fix를 Figma 노드에 적용.
 * 지원 속성: background, background-color, color, border-color, border-radius,
 *          padding-*, gap, opacity.
 */
export function applyFix(node: any, spec: FixSpec): FixResult {
  const prop = spec.cssProperty.toLowerCase();
  const val = spec.expectedValue;

  switch (prop) {
    case "background":
    case "background-color": {
      const rgb = parseHex(val);
      if (!rgb) return { success: false, reason: `invalid color: ${val}` };
      node.fills = [{ type: "SOLID", color: rgb, opacity: 1 }];
      return { success: true };
    }

    case "color": {
      const rgb = parseHex(val);
      if (!rgb) return { success: false, reason: `invalid color: ${val}` };
      // TextNode만 color를 fills에 가짐
      if (node.type !== "TEXT") {
        return { success: false, reason: "color는 TEXT 노드에만 적용 가능" };
      }
      node.fills = [{ type: "SOLID", color: rgb, opacity: 1 }];
      return { success: true };
    }

    case "border-color": {
      const rgb = parseHex(val);
      if (!rgb) return { success: false, reason: `invalid color: ${val}` };
      node.strokes = [{ type: "SOLID", color: rgb, opacity: 1 }];
      return { success: true };
    }

    case "border-radius": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      node.cornerRadius = px;
      return { success: true };
    }

    case "padding-top":
    case "padding-right":
    case "padding-bottom":
    case "padding-left": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      node[key] = px;
      return { success: true };
    }

    case "gap": {
      const px = parsePx(val);
      if (px === null) return { success: false, reason: `invalid px: ${val}` };
      node.itemSpacing = px;
      return { success: true };
    }

    case "opacity": {
      const n = parseNumber(val);
      if (n === null) return { success: false, reason: `invalid number: ${val}` };
      node.opacity = n;
      return { success: true };
    }

    default:
      return { success: false, reason: `unsupported CSS property: ${prop}` };
  }
}

/**
 * 여러 fix를 한 번에 적용 (per-group).
 * 모두 같은 node에 대해 적용됨을 가정.
 */
export function applyFixes(
  node: any,
  specs: FixSpec[]
): { appliedCount: number; skippedReasons: string[] } {
  let appliedCount = 0;
  const skippedReasons: string[] = [];

  for (const spec of specs) {
    const result = applyFix(node, spec);
    if (result.success) {
      appliedCount++;
    } else {
      skippedReasons.push(`${spec.cssProperty}: ${result.reason ?? "unknown"}`);
    }
  }

  return { appliedCount, skippedReasons };
}
```

- [ ] **Step 4: 테스트 통과**

Run: `npx vitest run test/feedback/feedbackFixHandler.test.ts`
Expected: PASS (7개 테스트).

- [ ] **Step 5: 커밋**

```bash
git add src/backend/handlers/feedbackFixHandler.ts test/feedback/feedbackFixHandler.test.ts
git commit -m "feat(backend): feedbackFixHandler — CSS → Figma API 매핑

지원: background/color/border-color/border-radius/padding-*/gap/opacity.
지원 안 되는 속성은 success=false로 반환."
```

---

### Task D3: FigmaPlugin에서 fix 메시지 처리

**Files:**
- Modify: `src/backend/FigmaPlugin.ts`

- [ ] **Step 1: 메시지 핸들러 case 추가**

`FigmaPlugin.ts`의 `onmessage` switch에 추가:

```typescript
case MESSAGE_TYPES.APPLY_FIX_ITEM:
  await this.handleApplyFixItem(msg);
  break;

case MESSAGE_TYPES.APPLY_FIX_GROUP:
  await this.handleApplyFixGroup(msg);
  break;
```

- [ ] **Step 2: 핸들러 메서드 구현**

`FigmaPlugin.ts`에 다음 메서드 추가 (`handleSelectNode` 근처):

```typescript
private async handleApplyFixItem(msg: {
  nodeId: string;
  cssProperty: string;
  expectedValue: string;
}): Promise<void> {
  const { applyFix } = await import("./handlers/feedbackFixHandler");
  try {
    const node = figma.getNodeById(msg.nodeId);
    if (!node) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.APPLY_FIX_RESULT,
        success: false,
        appliedCount: 0,
        skippedReasons: ["node not found"],
      });
      return;
    }

    const result = applyFix(node, {
      cssProperty: msg.cssProperty,
      expectedValue: msg.expectedValue,
    });

    figma.ui.postMessage({
      type: MESSAGE_TYPES.APPLY_FIX_RESULT,
      success: result.success,
      appliedCount: result.success ? 1 : 0,
      skippedReasons: result.success ? [] : [result.reason ?? "unknown"],
    });
  } catch (error) {
    console.error("Failed to apply fix:", error);
    figma.ui.postMessage({
      type: MESSAGE_TYPES.APPLY_FIX_RESULT,
      success: false,
      appliedCount: 0,
      skippedReasons: [String(error)],
    });
  }
}

private async handleApplyFixGroup(msg: {
  nodeId: string;
  fixes: Array<{ cssProperty: string; expectedValue: string }>;
}): Promise<void> {
  const { applyFixes } = await import("./handlers/feedbackFixHandler");
  try {
    const node = figma.getNodeById(msg.nodeId);
    if (!node) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.APPLY_FIX_RESULT,
        success: false,
        appliedCount: 0,
        skippedReasons: ["node not found"],
      });
      return;
    }

    const { appliedCount, skippedReasons } = applyFixes(node, msg.fixes);

    figma.ui.postMessage({
      type: MESSAGE_TYPES.APPLY_FIX_RESULT,
      success: appliedCount > 0,
      appliedCount,
      skippedReasons,
    });
  } catch (error) {
    console.error("Failed to apply fix group:", error);
    figma.ui.postMessage({
      type: MESSAGE_TYPES.APPLY_FIX_RESULT,
      success: false,
      appliedCount: 0,
      skippedReasons: [String(error)],
    });
  }
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build:plugin`
Expected: 빌드 성공.

- [ ] **Step 5: 커밋**

```bash
git add src/backend/FigmaPlugin.ts
git commit -m "feat(backend): FigmaPlugin에서 APPLY_FIX_* 메시지 처리

feedbackFixHandler 호출 + APPLY_FIX_RESULT 응답."
```

---

### Task D4: UI에서 fix 메시지 발송

**Files:**
- Modify: `src/frontend/ui/App.tsx`

- [ ] **Step 1: groups를 ref/state에 보관**

앞서 Task C3에서 만든 `feedbackGroups` state는 이미 있음. fix 버튼에서 group/item id를 받으면 해당 그룹/아이템을 찾아 메시지 전송.

- [ ] **Step 2: onApplyFixItem 구현**

Task C3에서 임시로 `console.log`만 하던 부분을 교체:

```typescript
onApplyFixItem={(itemId) => {
  // feedbackGroups에서 해당 item 찾기
  for (const group of feedbackGroups) {
    const item = group.items.find((it) => it.id === itemId);
    if (item && item.canAutoFix && item.expectedValue !== null) {
      parent.postMessage(
        {
          pluginMessage: {
            type: "apply-fix-item",
            nodeId: item.nodeId,
            cssProperty: item.cssProperty,
            expectedValue: item.expectedValue,
          },
        },
        "*"
      );
      return;
    }
  }
}}
```

- [ ] **Step 3: onApplyFixGroup 구현**

```typescript
onApplyFixGroup={(groupId) => {
  const group = feedbackGroups.find((g) => g.id === groupId);
  if (!group) return;

  const fixes = group.items
    .filter((it) => it.canAutoFix && it.expectedValue !== null)
    .map((it) => ({
      cssProperty: it.cssProperty,
      expectedValue: it.expectedValue!,
    }));

  if (fixes.length === 0) return;

  parent.postMessage(
    {
      pluginMessage: {
        type: "apply-fix-group",
        nodeId: group.sharedContext.nodeId,
        fixes,
      },
    },
    "*"
  );
}}
```

- [ ] **Step 4: APPLY_FIX_RESULT 메시지 수신 처리**

`App.tsx`의 메시지 리스너에 추가 (기존 `on-selection-change` 리스너 근처):

```typescript
if (msg.type === "apply-fix-result") {
  if (msg.success) {
    // 성공: 플러그인이 재컴파일되어 피드백 자동 갱신될 것 (selection-change 트리거)
    // 별도 UI 토스트가 필요하면 여기서
    console.log(`Fix 적용됨 (${msg.appliedCount}건). ⌘Z로 되돌리기 가능.`);
  } else {
    console.warn("Fix 실패:", msg.skippedReasons);
  }
}
```

> 실제 현재 App.tsx의 메시지 핸들러 구조를 확인해서 적절한 위치에 넣는다. 만약 `useMessageHandler` hook이 있으면 거기에.

- [ ] **Step 5: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/frontend/ui/App.tsx
git commit -m "feat(ui): FeedbackPanel fix-assist 연결

onApplyFixItem/onApplyFixGroup에서 apply-fix-item/group 메시지 발송.
apply-fix-result 수신 처리."
```

---

## Phase E — 통합 검증 및 마무리

### Task E1: 엔드투엔드 스모크 테스트

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 2: 전체 테스트**

Run: `npm run test`
Expected: 전수 통과.

- [ ] **Step 3: audit baseline 확인**

Run: `npm run audit`
Expected: baseline 변화 없음 또는 감소만.

- [ ] **Step 4: 수동 테스트 체크리스트**

사용자가 실제 Figma에서 플러그인을 실행해 다음을 확인:

1. [ ] Buttonsolid 같이 불일치가 있는 컴포넌트를 선택
2. [ ] FeedbackPanel에 카드가 표시됨
3. [ ] 카드 클릭 시 펼쳐짐
4. [ ] [→ Figma] 클릭 시 Figma 캔버스가 해당 노드로 이동
5. [ ] [Fix] 클릭 시 Figma 노드 속성 변경됨
6. [ ] ⌘Z로 되돌려짐
7. [ ] [Fix N] 그룹 버튼이 여러 속성을 한 번에 변경
8. [ ] canAutoFix=false인 항목은 Fix 버튼 비활성
9. [ ] 일관성 문제 없는 컴포넌트 선택 시 "일관성 문제 없음" 표시

- [ ] **Step 5: 발견된 이슈 기록**

수동 테스트에서 발견된 이슈는 각각 별도 커밋으로 수정하거나, 해결 불가능하면 issue 파일로 기록.

---

### Task E2: 잔여 정리

- [ ] **Step 1: FigmaCodeGenerator.bindingFeedbackToDiagnostics 처리 결정**

`bindingFeedbackToDiagnostics`는 PropertyBindingFeedback을 VariantInconsistency로 쑤셔넣는 타입 남용이었다. Phase C에서 PropsMatrix warnings가 제거됐으므로 이 변환은 이제 아무데도 안 쓰일 수 있음.

Run: `grep -rn "bindingFeedbackToDiagnostics\|designFeedback" src/`

- 만약 참조가 여기(`FigmaCodeGenerator.ts`)에만 있고, `designFeedback`이 더 이상 UI에서 쓰이지 않으면 → 메서드 삭제
- 만약 다른 경로에서 쓰이면 → MVP 범위 밖이므로 그대로 유지, 주석으로 "MVP 외" 표시

- [ ] **Step 2: 결정한 처리 적용 + 커밋**

케이스에 따라:

```bash
# 경우 1: 삭제
git add src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.ts
git commit -m "refactor(code-gen): bindingFeedbackToDiagnostics 제거

피드백 패널로 교체되면서 VariantInconsistency 남용 경로가
더 이상 소비되지 않음."

# 경우 2: 유지만
# (커밋 없음)
```

- [ ] **Step 3: Phase E 완료**

모든 task 체크박스 확인. 완료.

---

## Out of Scope (이번 plan 외)

Spec의 Non-Goals 재확인 — 아래는 **이 plan에서 다루지 않음**:

- Cross-component 일관성 검사 (Button Primary vs Badge Primary)
- Semantic 역할 위반 감지 (Size가 color를 건드리면 경고)
- 디자인 토큰 준수 감사 (raw hex vs 토큰 변수)
- 피드백 dismiss/resolve persist (세션 간)
- 여러 컴포넌트 동시 피드백
- PropertyBindingFeedback 전용 채널 (MVP에서는 기존 경로 유지 또는 삭제)
- per-variant figmaNodeId 정밀 threading (MVP는 UINode.id 단일 사용)
- 전수 검사의 범위 확장 (owner-scoped 밖 prop까지 검사)

---

## 완료 기준

1. 모든 Phase A~E task 체크박스 완료
2. `npm run test` 전수 통과
3. `npm run audit` 회귀 증가 없음
4. 수동 스모크 테스트 체크리스트 완료
5. 기존 PropsMatrix 셀 툴팁이 코드베이스에서 완전 제거됨
6. FeedbackPanel이 App.tsx에 통합되어 실제 Figma 플러그인 실행 시 동작함
