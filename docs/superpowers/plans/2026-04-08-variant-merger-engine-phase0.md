# Variant Merger Engine — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Variant Merger 엔진화 작업(Phase 1~3)을 안전하게 진행할 수 있는 **측정·회귀 감지 인프라**를 구축한다. 구체적으로 (1) disjoint variant set 회귀 audit 도구, (2) InternalTree + UITree 스냅샷 하네스, (3) 페어 단언 인프라를 만들고, 현재 회귀 baseline을 문서화한다.

**Architecture:** 세 가지 독립 컴포넌트. **Audit**는 fixture를 순회하며 병합 결과에서 disjoint variant set 형제 쌍을 탐지하는 vitest 기반 리포트 테스트. **Snapshot harness**는 vitest `toMatchSnapshot`으로 InternalTree(VariantMerger 직후) + UITree(후처리 후) 두 층을 얼린다. **Pair assertion**은 "어느 두 노드가 같은 노드여야 하는가"를 명시하는 스키마로, Phase 1~3 TDD의 입력이 된다. Phase 0 본체는 엔진 코드를 전혀 수정하지 않는다 — 오직 측정·검증 도구만 추가한다.

**Tech Stack:** TypeScript 5.3, vitest 4 (snapshot + globals), happy-dom, 기존 경로 alias(`@code-generator2`), `test/fixtures/**/*.json` glob loader 패턴.

**Spec reference:** `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` §4 Phase 0

---

## File Structure

이 플랜이 새로 만드는 파일과 각 파일의 책임:

- `test/audits/variantMatchingAudit.test.ts` — Audit 실행 엔트리. 전체 fixture 순회 + disjoint 탐지 + JSON/console 리포트 + baseline 비교
- `test/audits/detectDisjointVariants.ts` — Pure 탐지 함수. InternalTree 입력 → 회귀 후보 쌍 목록 출력. 독립 단위 테스트 가능
- `test/audits/detectDisjointVariants.test.ts` — `detectDisjointVariants` 단위 테스트 (합성 트리 입력)
- `test/audits/classifyPattern.ts` — Pure 패턴 분류 함수. 회귀 후보 쌍 → §1.1의 패턴 라벨 또는 "unknown"
- `test/audits/classifyPattern.test.ts` — 분류 함수 단위 테스트
- `test/audits/audit-baseline.json` — 현재 회귀 baseline 스냅샷 (커밋됨, CI가 비교)
- `test/snapshots/internalTreeSnapshot.test.ts` — 전체 fixture의 InternalTree 스냅샷 생성/검증
- `test/snapshots/uiTreeSnapshot.test.ts` — 전체 fixture의 UITree 스냅샷 생성/검증
- `test/snapshots/serializeTree.ts` — Tree → 안정적 직렬화 함수 (노이즈 필드 제거, 정렬). 스냅샷 diff 재현성 보장
- `test/matching/pairAssertions.ts` — PairAssertion 타입 정의 + loader
- `test/matching/pairAssertions.data.ts` — 실제 페어 단언 데이터 (Phase 0에서는 빈 배열로 시작)
- `test/matching/pairAssertions.test.ts` — 페어 단언 하네스 — 각 단언을 VariantMerger로 검증
- `package.json` — `audit` npm script 추가
- `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` — §1 회귀 숫자를 실제 측정치로 갱신 (Task 8)

---

## Execution Notes

- **Worktree**: 이 Phase 0 작업은 반드시 worktree에서 수행한다 (`git worktree add .claude/worktrees/variant-merger-phase0 -b feat/variant-merger-phase0`).
- **No engine edits**: Phase 0는 `processors/` 아래 엔진 코드를 절대 수정하지 않는다. 오직 `test/`, `package.json`, spec doc만 건드린다.
- **Commit frequency**: 각 Task 완료 시 커밋. TDD cycle은 각 Task 내에서 완결.
- **Snapshot 초기 생성**: Snapshot harness Task에서 첫 실행은 모든 스냅샷을 생성한다. 생성된 스냅샷을 **그대로 커밋**하지 말고, 먼저 `test/audits/audit-baseline.json`의 "회귀 있음" fixture 목록과 교차하여 "회귀 없음" fixture만 승인한다. "회귀 있음" fixture의 스냅샷은 파일이 생성되긴 하지만 `.snap` 파일에 `// BASELINE: contains known regression` 주석을 붙여 커밋한다. 이는 Phase 1에서 해당 스냅샷이 바뀌어도 "정답 변경 가능"임을 표시한다.

## 범위 결정: Diff 리뷰 도구는 이 플랜에서 보류

Spec §4 Phase 0의 4번 항목("Diff 리뷰 도구 — git diff로 JSON 스냅샷 비교는 읽기 어려움")은 **이 플랜에서 구현하지 않는다**. 이유:

1. vitest의 snapshot diff는 기본적으로 읽을 만하다 (expected/received 블록 + 컨텍스트 표시). 먼저 써보지 않고 별도 도구를 만드는 건 추측 기반 투자.
2. `serializeTree` (Task 5)가 결정론적 직렬화를 보장하므로 diff는 "변경된 노드만" 드러난다. 트리 전체가 다시 쓰이는 노이즈가 없다.
3. Phase 1 첫 스냅샷 diff를 실제로 마주친 뒤 "너무 크다"고 판단되면 그때 별도 도구를 짧게 추가하면 된다.

Phase 1 시작 후 스냅샷 diff가 실제로 읽기 어렵다고 확인되면, 그때 별도 플랜으로 diff 리뷰 도구를 추가한다.

---

## Task 1: Audit — 합성 트리에서 disjoint variant set 탐지 함수

**Files:**
- Create: `test/audits/detectDisjointVariants.ts`
- Test: `test/audits/detectDisjointVariants.test.ts`

**Context:** `InternalNode`는 `children: InternalNode[]`와 `mergedNodes?: VariantOrigin[]`를 가진다. `VariantOrigin.variantName`은 이 노드가 원래 어느 variant에서 왔는지 나타낸다 (예: `"Size=Small, State=Default"`). "disjoint variant set sibling"은 같은 부모 아래 두 형제가 서로 겹치지 않는 `variantName` 집합을 가진 경우 — 즉 본래 같은 노드였어야 하는데 매칭 실패로 분리됐을 가능성이 높은 쌍이다.

- [ ] **Step 1: Write the failing test**

File: `test/audits/detectDisjointVariants.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { detectDisjointVariants } from "./detectDisjointVariants";
import type { InternalNode } from "@code-generator2/types/types";

function node(
  id: string,
  variantNames: string[],
  children: InternalNode[] = []
): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children,
    mergedNodes: variantNames.map((v) => ({
      id: `${id}-${v}`,
      name: id,
      variantName: v,
    })),
  } as unknown as InternalNode;
}

describe("detectDisjointVariants", () => {
  it("returns empty when siblings share at least one variant", () => {
    const parent = node("root", ["S=S", "S=L"], [
      node("a", ["S=S", "S=L"]),
      node("b", ["S=S", "S=L"]),
    ]);
    expect(detectDisjointVariants(parent)).toEqual([]);
  });

  it("flags siblings with disjoint variant sets", () => {
    const parent = node("root", ["S=S", "S=L"], [
      node("a", ["S=S"]),
      node("b", ["S=L"]),
    ]);
    const result = detectDisjointVariants(parent);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      parentId: "root",
      pair: [{ id: "a" }, { id: "b" }],
      variantsA: ["S=S"],
      variantsB: ["S=L"],
    });
  });

  it("recurses into children to detect nested disjoint siblings", () => {
    const deeper = node("inner", ["S=S", "S=L"], [
      node("x", ["S=S"]),
      node("y", ["S=L"]),
    ]);
    const parent = node("root", ["S=S", "S=L"], [deeper]);
    const result = detectDisjointVariants(parent);
    expect(result).toHaveLength(1);
    expect(result[0].parentId).toBe("inner");
  });

  it("handles nodes without mergedNodes as empty variant set", () => {
    const parent = node("root", ["S=S", "S=L"], [
      { id: "a", name: "a", type: "FRAME", children: [] } as unknown as InternalNode,
      node("b", ["S=L"]),
    ]);
    // a has no variants → not disjoint (empty set ∩ anything = empty, but we skip empties)
    expect(detectDisjointVariants(parent)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/audits/detectDisjointVariants.test.ts`
Expected: FAIL with `Cannot find module './detectDisjointVariants'` or similar.

- [ ] **Step 3: Write minimal implementation**

File: `test/audits/detectDisjointVariants.ts`

```typescript
import type { InternalNode } from "@code-generator2/types/types";

export interface DisjointPair {
  parentId: string;
  pair: [{ id: string; name: string }, { id: string; name: string }];
  variantsA: string[];
  variantsB: string[];
}

/**
 * 주어진 InternalTree를 순회하며, 같은 부모 아래에서
 * 서로 disjoint한 variantName 집합을 가진 형제 쌍을 모두 수집한다.
 *
 * "Disjoint"란 두 형제의 variantName 집합 교집합이 공집합임을 뜻한다.
 * 이는 "같은 노드였어야 하는데 매칭 실패로 분리되었을 가능성이 높은" 패턴이다.
 *
 * 빈 variantName 집합을 가진 노드는 스킵한다 (단일 컴포넌트의 노드로 간주).
 */
export function detectDisjointVariants(root: InternalNode): DisjointPair[] {
  const out: DisjointPair[] = [];
  walk(root, out);
  return out;
}

function walk(node: InternalNode, out: DisjointPair[]): void {
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];
      const setA = variantSet(a);
      const setB = variantSet(b);
      if (setA.size === 0 || setB.size === 0) continue;
      if (isDisjoint(setA, setB)) {
        out.push({
          parentId: node.id,
          pair: [
            { id: a.id, name: a.name },
            { id: b.id, name: b.name },
          ],
          variantsA: [...setA].sort(),
          variantsB: [...setB].sort(),
        });
      }
    }
  }
  for (const child of children) walk(child, out);
}

function variantSet(node: InternalNode): Set<string> {
  const merged = node.mergedNodes;
  if (!merged || merged.length === 0) return new Set();
  return new Set(
    merged
      .map((m) => m.variantName)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
  );
}

function isDisjoint(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/audits/detectDisjointVariants.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add test/audits/detectDisjointVariants.ts test/audits/detectDisjointVariants.test.ts
git commit -m "test(audit): disjoint variant sibling detection function"
```

---

## Task 2: Audit — 회귀 후보 쌍 패턴 분류

**Files:**
- Create: `test/audits/classifyPattern.ts`
- Test: `test/audits/classifyPattern.test.ts`

**Context:** `detectDisjointVariants`가 반환하는 각 `DisjointPair`를 §1.1의 6가지 패턴 중 하나로 분류한다. Phase 0에서는 가장 뚜렷한 두 패턴만 분류한다: **(1) Size variant ratio reject** — 두 형제의 variantName diff가 `Size=...` 만 있고 나머지 prop은 동일한 경우, **(2) Variant prop position** — variantName diff가 있고 형제의 대표 중심 x 좌표가 크게 다른 경우 (향후 Phase 2에서 cx 활용). 나머지는 `"unknown"`으로 분류. 완벽한 분류가 아니라 "초기 리포트에서 패턴 분포를 대충 보여주는" 목적.

- [ ] **Step 1: Write the failing test**

File: `test/audits/classifyPattern.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { classifyPattern } from "./classifyPattern";
import type { DisjointPair } from "./detectDisjointVariants";

function pair(variantsA: string[], variantsB: string[]): DisjointPair {
  return {
    parentId: "p",
    pair: [{ id: "a", name: "a" }, { id: "b", name: "b" }],
    variantsA,
    variantsB,
  };
}

describe("classifyPattern", () => {
  it("classifies Size-only diff as size-variant-reject", () => {
    const p = pair(["Size=Small, State=Default"], ["Size=Large, State=Default"]);
    expect(classifyPattern(p)).toBe("size-variant-reject");
  });

  it("classifies boolean-prop diff as variant-prop-position", () => {
    const p = pair(["LeftIcon=False, State=Default"], ["LeftIcon=True, State=Default"]);
    expect(classifyPattern(p)).toBe("variant-prop-position");
  });

  it("returns unknown for multi-prop diffs", () => {
    const p = pair(["Size=Small, State=Hover"], ["Size=Large, State=Default"]);
    expect(classifyPattern(p)).toBe("unknown");
  });

  it("returns unknown when variantNames cannot be parsed", () => {
    const p = pair(["weird"], ["thing"]);
    expect(classifyPattern(p)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/audits/classifyPattern.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

File: `test/audits/classifyPattern.ts`

```typescript
import type { DisjointPair } from "./detectDisjointVariants";

export type PatternLabel =
  | "size-variant-reject"
  | "variant-prop-position"
  | "unknown";

/**
 * DisjointPair를 §1.1 패턴 중 하나로 분류.
 *
 * 매우 단순한 휴리스틱:
 * - 두 형제 양쪽의 variantName을 각각 파싱해 prop 집합으로 만든다
 * - 두 형제에 걸쳐 값이 다른 prop이 정확히 하나이고:
 *   - 그 prop 이름이 Size 또는 다른 enum 느낌이면 → size-variant-reject
 *   - 그 prop 값이 True/False boolean이면 → variant-prop-position
 * - 그 외 → unknown
 *
 * 이 분류는 Phase 0 리포트의 "분포 감각"을 주기 위한 것이며,
 * 정밀 분류는 Phase 1 이후 신호 단위 로그로 보강한다.
 */
export function classifyPattern(pair: DisjointPair): PatternLabel {
  const propsA = parseVariantProps(pair.variantsA[0]);
  const propsB = parseVariantProps(pair.variantsB[0]);
  if (!propsA || !propsB) return "unknown";

  const allKeys = new Set([...propsA.keys(), ...propsB.keys()]);
  const diffKeys: string[] = [];
  for (const key of allKeys) {
    if (propsA.get(key) !== propsB.get(key)) diffKeys.push(key);
  }
  if (diffKeys.length !== 1) return "unknown";

  const diffKey = diffKeys[0];
  const valA = propsA.get(diffKey);
  const valB = propsB.get(diffKey);
  if (isBoolean(valA) && isBoolean(valB)) return "variant-prop-position";
  if (/^size$/i.test(diffKey)) return "size-variant-reject";
  return "unknown";
}

function parseVariantProps(variantName: string): Map<string, string> | null {
  if (!variantName) return null;
  const pairs = variantName.split(",").map((s) => s.trim());
  const map = new Map<string, string>();
  for (const p of pairs) {
    const eq = p.indexOf("=");
    if (eq < 0) return null;
    map.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
  }
  return map.size > 0 ? map : null;
}

function isBoolean(v: string | undefined): boolean {
  return v === "True" || v === "False" || v === "true" || v === "false";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/audits/classifyPattern.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add test/audits/classifyPattern.ts test/audits/classifyPattern.test.ts
git commit -m "test(audit): pattern classifier for disjoint variant pairs"
```

---

## Task 3: Audit — 전체 fixture 순회 + baseline 리포트

**Files:**
- Create: `test/audits/variantMatchingAudit.test.ts`
- Create: `test/audits/audit-baseline.json` (Step 4에서 생성)

**Context:** 실제 84개 fixture를 순회하며, 각 fixture를 DataManager → TreeBuilder.buildInternalTreeDebug() 로 InternalTree까지 생성한 뒤 `detectDisjointVariants` + `classifyPattern`을 실행한다. 결과를 집계해 JSON baseline으로 저장하고, 이후 실행에서는 baseline과 비교해 "회귀 증가" 여부를 판정한다.

- [ ] **Step 1: Write the test (this IS the audit, no separate unit test)**

File: `test/audits/variantMatchingAudit.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { detectDisjointVariants, DisjointPair } from "./detectDisjointVariants";
import { classifyPattern, PatternLabel } from "./classifyPattern";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

interface FixtureReport {
  fixture: string;
  disjointCount: number;
  patterns: Record<PatternLabel, number>;
  pairs: Array<{
    parentId: string;
    a: string;
    b: string;
    variantsA: string[];
    variantsB: string[];
    pattern: PatternLabel;
  }>;
}

interface AuditReport {
  generatedAt: string;
  totalFixtures: number;
  fixturesWithRegressions: number;
  totalDisjointPairs: number;
  patternTotals: Record<PatternLabel, number>;
  byFixture: FixtureReport[];
}

const BASELINE_PATH = resolve(
  process.cwd(),
  "test/audits/audit-baseline.json"
);

async function runAudit(): Promise<AuditReport> {
  const byFixture: FixtureReport[] = [];
  const patternTotals: Record<PatternLabel, number> = {
    "size-variant-reject": 0,
    "variant-prop-position": 0,
    unknown: 0,
  };
  let totalDisjointPairs = 0;
  let fixturesWithRegressions = 0;

  const entries = Object.entries(fixtureLoaders)
    .map(([p, loader]) => ({
      name: p.replace("../fixtures/", "").replace(".json", ""),
      loader,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const { name, loader } of entries) {
    const mod = await loader();
    const data = mod.default as any;
    let pairs: DisjointPair[] = [];
    try {
      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      const doc = data?.info?.document;
      if (!doc) {
        byFixture.push(makeEmptyReport(name));
        continue;
      }
      const tree = tb.buildInternalTreeDebug(doc);
      pairs = detectDisjointVariants(tree);
    } catch (err) {
      // Audit은 컴파일 실패 fixture도 기록 (회귀 카운트 0)
      byFixture.push({
        ...makeEmptyReport(name),
        fixture: `${name} (COMPILE_ERROR: ${(err as Error).message.slice(0, 80)})`,
      });
      continue;
    }

    const patterns: Record<PatternLabel, number> = {
      "size-variant-reject": 0,
      "variant-prop-position": 0,
      unknown: 0,
    };
    const pairReports = pairs.map((p) => {
      const label = classifyPattern(p);
      patterns[label]++;
      patternTotals[label]++;
      return {
        parentId: p.parentId,
        a: p.pair[0].id,
        b: p.pair[1].id,
        variantsA: p.variantsA,
        variantsB: p.variantsB,
        pattern: label,
      };
    });

    byFixture.push({
      fixture: name,
      disjointCount: pairs.length,
      patterns,
      pairs: pairReports,
    });

    if (pairs.length > 0) fixturesWithRegressions++;
    totalDisjointPairs += pairs.length;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalFixtures: entries.length,
    fixturesWithRegressions,
    totalDisjointPairs,
    patternTotals,
    byFixture,
  };
}

function makeEmptyReport(name: string): FixtureReport {
  return {
    fixture: name,
    disjointCount: 0,
    patterns: {
      "size-variant-reject": 0,
      "variant-prop-position": 0,
      unknown: 0,
    },
    pairs: [],
  };
}

describe("Variant matching audit", () => {
  it(
    "reports disjoint variant pairs across all fixtures",
    async () => {
      const report = await runAudit();

      // 콘솔 요약 (silent: true 설정이라 표시 안 되지만, AUDIT_WRITE=1 환경변수면 파일 저장)
      const summaryLines = [
        `=== Variant Matching Audit ===`,
        `Generated: ${report.generatedAt}`,
        `Fixtures: ${report.totalFixtures}`,
        `With regressions: ${report.fixturesWithRegressions}`,
        `Total disjoint pairs: ${report.totalDisjointPairs}`,
        `  size-variant-reject: ${report.patternTotals["size-variant-reject"]}`,
        `  variant-prop-position: ${report.patternTotals["variant-prop-position"]}`,
        `  unknown: ${report.patternTotals.unknown}`,
      ];
      // vitest silent 모드에서도 출력하려면 process.stdout.write 사용
      process.stdout.write("\n" + summaryLines.join("\n") + "\n");

      if (process.env.AUDIT_WRITE === "1") {
        writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2) + "\n");
        process.stdout.write(`\nBaseline written: ${BASELINE_PATH}\n`);
        return;
      }

      // Baseline 비교 모드
      expect(
        existsSync(BASELINE_PATH),
        "audit-baseline.json missing. Run: AUDIT_WRITE=1 npx vitest run test/audits/variantMatchingAudit.test.ts"
      ).toBe(true);

      const baseline = JSON.parse(
        readFileSync(BASELINE_PATH, "utf-8")
      ) as AuditReport;

      // 회귀가 증가하지 않았는지 검증 (감소는 OK)
      expect(report.totalDisjointPairs).toBeLessThanOrEqual(
        baseline.totalDisjointPairs
      );
      expect(report.fixturesWithRegressions).toBeLessThanOrEqual(
        baseline.fixturesWithRegressions
      );
    },
    120_000
  );
});
```

- [ ] **Step 2: Run test to verify it fails (no baseline yet)**

Run: `npx vitest run test/audits/variantMatchingAudit.test.ts`
Expected: FAIL with `audit-baseline.json missing`.

- [ ] **Step 3: Generate baseline**

Run: `AUDIT_WRITE=1 npx vitest run test/audits/variantMatchingAudit.test.ts`
Expected: PASS + summary line printed to stdout showing `Total disjoint pairs: <N>`. File `test/audits/audit-baseline.json` is written.

Inspect the output file exists and contains the `byFixture` array. Record the `totalDisjointPairs` number — this is the measured baseline.

- [ ] **Step 4: Re-run in baseline-compare mode**

Run: `npx vitest run test/audits/variantMatchingAudit.test.ts`
Expected: PASS. Baseline exists and report matches.

- [ ] **Step 5: Commit**

```bash
git add test/audits/variantMatchingAudit.test.ts test/audits/audit-baseline.json
git commit -m "test(audit): variant matching audit runner + baseline snapshot"
```

---

## Task 4: npm script — `npm run audit` + `npm run audit:write`

**Files:**
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Add audit scripts to package.json**

File: `package.json` — add these lines to the `scripts` section alongside existing test commands:

```json
    "audit": "vitest run test/audits/variantMatchingAudit.test.ts",
    "audit:write": "AUDIT_WRITE=1 vitest run test/audits/variantMatchingAudit.test.ts",
```

- [ ] **Step 2: Verify scripts work**

Run: `npm run audit`
Expected: PASS (baseline mode).

Run: `npm run audit:write`
Expected: PASS + baseline overwritten with identical content.

- [ ] **Step 3: Verify git status is clean after audit:write**

Run: `git status test/audits/audit-baseline.json`
Expected: "nothing to commit, working tree clean" (the generatedAt timestamp will differ — if so, revert that single line change manually or accept it as a single-line diff. Prefer reverting to keep the commit history clean.)

If timestamp diff: `git checkout test/audits/audit-baseline.json`.

- [ ] **Step 4: Commit the package.json change**

```bash
git add package.json
git commit -m "build: add npm run audit / audit:write scripts"
```

---

## Task 5: Snapshot harness — InternalTree (VariantMerger 직후)

**Files:**
- Create: `test/snapshots/serializeTree.ts`
- Create: `test/snapshots/internalTreeSnapshot.test.ts`

**Context:** vitest `toMatchSnapshot`은 객체를 직렬화해서 `.snap` 파일에 저장한다. InternalTree는 `parent?: InternalNode | null` 같은 순환 참조와 매번 다를 수 있는 필드(디버그 metadata 등)를 포함할 수 있으므로, 스냅샷 직전에 **안정적 직렬화 함수**를 거친다. 이 함수는 (1) 순환 참조를 제거하고 (2) children 순서를 보존하고 (3) 결정론적이지 않은 필드를 제외한다.

- [ ] **Step 1: Write the serializer test**

File: `test/snapshots/serializeTree.ts` (구현 먼저, 아래 Step 3에서 작성. Step 1은 이걸 테스트하는 파일을 만든다.)

Create: `test/snapshots/serializeTree.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { serializeTree } from "./serializeTree";
import type { InternalNode } from "@code-generator2/types/types";

function n(id: string, children: InternalNode[] = []): InternalNode {
  return {
    id,
    name: id,
    type: "FRAME",
    children,
  } as unknown as InternalNode;
}

describe("serializeTree", () => {
  it("preserves id, name, type, children order", () => {
    const tree = n("root", [n("a"), n("b"), n("c")]);
    const out = serializeTree(tree);
    expect(out).toMatchObject({
      id: "root",
      name: "root",
      type: "FRAME",
      children: [
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ],
    });
  });

  it("removes parent back-reference (breaks cycles)", () => {
    const parent = n("p");
    const child = n("c");
    (child as any).parent = parent;
    parent.children = [child];
    const out = serializeTree(parent);
    // Should not throw and should not contain 'parent' field
    const json = JSON.stringify(out);
    expect(json).not.toContain('"parent"');
  });

  it("includes mergedNodes variantNames", () => {
    const tree = n("root");
    (tree as any).mergedNodes = [
      { id: "v1", name: "root", variantName: "Size=S" },
      { id: "v2", name: "root", variantName: "Size=L" },
    ];
    const out = serializeTree(tree);
    expect((out as any).mergedNodes).toEqual([
      { id: "v1", variantName: "Size=S" },
      { id: "v2", variantName: "Size=L" },
    ]);
  });
});
```

- [ ] **Step 2: Run serializer test to verify it fails**

Run: `npx vitest run test/snapshots/serializeTree.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement serializer**

File: `test/snapshots/serializeTree.ts`

```typescript
import type { InternalNode } from "@code-generator2/types/types";

/**
 * Tree → snapshot용 안정적 직렬화.
 *
 * 목적:
 * 1. parent 역참조 같은 순환 제거
 * 2. 결정론적이지 않은 필드(디버그 metadata 등) 제외
 * 3. children 순서는 그대로 유지 (매칭 결과를 반영하므로)
 *
 * 포함 필드: id, name, type, visible?, mergedNodes(축약), children(재귀)
 * 또한 styles/props 같은 핵심 필드는 포함하되, 객체 키를 정렬해 diff 재현성을 높인다.
 */
export function serializeTree(node: InternalNode): unknown {
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  const anyNode = node as any;
  if (typeof anyNode.visible === "boolean") out.visible = anyNode.visible;
  if (Array.isArray(anyNode.mergedNodes)) {
    out.mergedNodes = anyNode.mergedNodes.map((m: any) => ({
      id: m.id,
      variantName: m.variantName,
    }));
  }
  if (anyNode.refId) out.refId = anyNode.refId;
  if (Array.isArray(node.children)) {
    out.children = node.children.map((c) => serializeTree(c));
  }
  return out;
}
```

- [ ] **Step 4: Run serializer test to verify it passes**

Run: `npx vitest run test/snapshots/serializeTree.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create InternalTree snapshot harness**

File: `test/snapshots/internalTreeSnapshot.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { serializeTree } from "./serializeTree";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const entries = Object.entries(fixtureLoaders)
  .map(([p, loader]) => ({
    name: p.replace("../fixtures/", "").replace(".json", ""),
    loader,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

describe("InternalTree snapshots", () => {
  for (const { name, loader } of entries) {
    it(`${name}`, async () => {
      const mod = await loader();
      const data = mod.default as any;
      const doc = data?.info?.document;
      if (!doc) {
        expect(data).toBeDefined();
        return;
      }
      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      const tree = tb.buildInternalTreeDebug(doc);
      expect(serializeTree(tree)).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 6: Generate initial snapshots**

Run: `npx vitest run test/snapshots/internalTreeSnapshot.test.ts -u`
Expected: PASS (84 test cases), `.snap` file written to `test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap`.

- [ ] **Step 7: Re-run without update flag to verify determinism**

Run: `npx vitest run test/snapshots/internalTreeSnapshot.test.ts`
Expected: PASS. All snapshots stable across runs.

- [ ] **Step 8: Mark snapshot file with baseline note**

Edit the top of `test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap` to add a header comment. Vitest snap format uses `// Vitest Snapshot v1` at top — add a second comment line below it:

Use the Edit tool:
- `old_string`: `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html`
- `new_string`:
  ```
  // Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html
  // BASELINE: 2026-04-08. Captured pre-Phase-1. Contains known matching regressions
  // listed in test/audits/audit-baseline.json. Snapshot diffs during Phase 1~3 must
  // be reviewed manually against audit-baseline.json to distinguish intentional fixes
  // from unintended regressions.
  ```

- [ ] **Step 9: Commit**

```bash
git add test/snapshots/serializeTree.ts test/snapshots/serializeTree.test.ts test/snapshots/internalTreeSnapshot.test.ts "test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap"
git commit -m "test(snapshot): InternalTree snapshot harness with baseline (pre-Phase-1)"
```

---

## Task 6: Snapshot harness — UITree (후처리 후)

**Files:**
- Create: `test/snapshots/uiTreeSnapshot.test.ts`

**Context:** UITree는 TreeBuilder의 전체 파이프라인(모든 processor + heuristic) 실행 결과다. `TreeBuilder.build(node)`가 반환한다. InternalTree 스냅샷이 "매칭 국소 영향"을 보여준다면, UITree 스냅샷은 "매칭 변경이 최종 결과에 어떻게 파급되는가"를 보여준다. 이미 `serializeTree`가 있으므로 재사용한다 (UITree도 `UINodeBase` 상속이라 같은 필드 구조).

- [ ] **Step 1: Create the UITree snapshot test**

File: `test/snapshots/uiTreeSnapshot.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { serializeTree } from "./serializeTree";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const entries = Object.entries(fixtureLoaders)
  .map(([p, loader]) => ({
    name: p.replace("../fixtures/", "").replace(".json", ""),
    loader,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

describe("UITree snapshots", () => {
  for (const { name, loader } of entries) {
    it(`${name}`, async () => {
      const mod = await loader();
      const data = mod.default as any;
      const doc = data?.info?.document;
      if (!doc) {
        expect(data).toBeDefined();
        return;
      }
      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      let tree;
      try {
        tree = tb.build(doc);
      } catch (err) {
        // 일부 fixture는 full pipeline 통과 못 할 수 있음 — 그 상태 자체를 스냅샷
        expect(`BUILD_ERROR: ${(err as Error).message}`).toMatchSnapshot();
        return;
      }
      expect(serializeTree(tree as any)).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: Generate initial UITree snapshots**

Run: `npx vitest run test/snapshots/uiTreeSnapshot.test.ts -u`
Expected: PASS (84 test cases), snapshot file written.

- [ ] **Step 3: Re-run to verify determinism**

Run: `npx vitest run test/snapshots/uiTreeSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 4: Add baseline header to the snapshot file**

Edit `test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap`:
- `old_string`: `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html`
- `new_string`:
  ```
  // Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html
  // BASELINE: 2026-04-08. Full-pipeline UITree baseline captured pre-Phase-1.
  // Inherits same regression caveat as internalTreeSnapshot baseline.
  ```

- [ ] **Step 5: Commit**

```bash
git add test/snapshots/uiTreeSnapshot.test.ts "test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap"
git commit -m "test(snapshot): UITree full-pipeline snapshot harness with baseline"
```

---

## Task 7: Pair assertion infrastructure (empty, ready for Phase 1)

**Files:**
- Create: `test/matching/pairAssertions.ts`
- Create: `test/matching/pairAssertions.data.ts`
- Create: `test/matching/pairAssertions.test.ts`

**Context:** 페어 단언은 "fixture X에서 variant A의 노드 ID p와 variant B의 노드 ID q는 **같은 노드여야 한다** (또는 **달라야 한다**)"를 명시하는 입력이다. Phase 0에서는 **인프라만** 만든다. 데이터 파일은 빈 배열로 시작. Phase 1에서 Switch Knob, Toggle 등의 실제 단언을 여기에 추가한다. 단언 하네스는 각 단언마다 VariantMerger를 실행해 "병합된 트리에서 이 두 ID가 같은 InternalNode에 속하는가"를 검증한다.

- [ ] **Step 1: Define types + loader**

File: `test/matching/pairAssertions.ts`

```typescript
export type PairAssertionKind = "must-match" | "must-not-match";

export interface PairAssertion {
  /** fixture 파일명 (test/fixtures/ 기준 상대경로, 확장자 제외) */
  fixture: string;
  /** 사람이 읽는 설명 (디버깅용) */
  description: string;
  /** 원본 fixture에서의 variant A 노드 ID */
  nodeIdA: string;
  /** 원본 fixture에서의 variant B 노드 ID */
  nodeIdB: string;
  kind: PairAssertionKind;
}

/**
 * InternalTree에서 특정 원본 ID가 어느 merged node에 속하는지 찾는다.
 * mergedNodes[].id 로 조회한다.
 */
export function findMergedNodeByOriginalId(
  root: { id: string; children?: any[]; mergedNodes?: Array<{ id: string }> },
  originalId: string
): { id: string } | null {
  if (root.mergedNodes?.some((m) => m.id === originalId)) {
    return { id: root.id };
  }
  if (root.id === originalId) return { id: root.id };
  for (const child of root.children ?? []) {
    const hit = findMergedNodeByOriginalId(child, originalId);
    if (hit) return hit;
  }
  return null;
}
```

- [ ] **Step 2: Create empty data file**

File: `test/matching/pairAssertions.data.ts`

```typescript
import type { PairAssertion } from "./pairAssertions";

/**
 * Phase 0: empty — populated during Phase 1~2 as specific matching cases
 * are debugged. Each entry represents a "should be the same node" or
 * "should NOT be the same node" claim verified by the engine.
 *
 * Format example (add during Phase 1):
 *   {
 *     fixture: "failing/Switch",
 *     description: "Switch Knob — Off/On variants are the same node",
 *     nodeIdA: "<id in State=Off variant>",
 *     nodeIdB: "<id in State=On variant>",
 *     kind: "must-match",
 *   }
 */
export const pairAssertions: PairAssertion[] = [];
```

- [ ] **Step 3: Create harness test**

File: `test/matching/pairAssertions.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { findMergedNodeByOriginalId } from "./pairAssertions";
import { pairAssertions } from "./pairAssertions.data";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

function getLoader(
  fixturePath: string
): (() => Promise<{ default: unknown }>) | null {
  const key = `../fixtures/${fixturePath}.json`;
  return fixtureLoaders[key] ?? null;
}

describe("Pair assertions", () => {
  if (pairAssertions.length === 0) {
    it("(no assertions defined yet — Phase 0 infrastructure only)", () => {
      expect(pairAssertions).toEqual([]);
    });
    return;
  }

  for (const a of pairAssertions) {
    it(`${a.fixture}: ${a.description}`, async () => {
      const loader = getLoader(a.fixture);
      expect(loader, `Fixture not found: ${a.fixture}`).not.toBeNull();
      const mod = await loader!();
      const data = mod.default as any;
      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      const tree = tb.buildInternalTreeDebug(data.info.document);

      const mergedA = findMergedNodeByOriginalId(tree as any, a.nodeIdA);
      const mergedB = findMergedNodeByOriginalId(tree as any, a.nodeIdB);
      expect(mergedA, `nodeIdA not found: ${a.nodeIdA}`).not.toBeNull();
      expect(mergedB, `nodeIdB not found: ${a.nodeIdB}`).not.toBeNull();

      if (a.kind === "must-match") {
        expect(
          mergedA!.id,
          `Expected ${a.nodeIdA} and ${a.nodeIdB} to merge into the same node`
        ).toBe(mergedB!.id);
      } else {
        expect(
          mergedA!.id,
          `Expected ${a.nodeIdA} and ${a.nodeIdB} to remain as different nodes`
        ).not.toBe(mergedB!.id);
      }
    });
  }
});
```

- [ ] **Step 4: Run harness**

Run: `npx vitest run test/matching/pairAssertions.test.ts`
Expected: PASS (the single "no assertions defined yet" test).

- [ ] **Step 5: Commit**

```bash
git add test/matching/pairAssertions.ts test/matching/pairAssertions.data.ts test/matching/pairAssertions.test.ts
git commit -m "test(matching): pair assertion infrastructure (empty, ready for Phase 1)"
```

---

## Task 8: Verify + reconcile spec §1 numbers

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md` (§1 표)

**Context:** 디자인 spec §1은 "74건 (main 57 + dependency 17)"이라고 적혀 있지만 이는 과거 audit 기록이다. Task 3에서 방금 생성한 `audit-baseline.json`의 실제 숫자와 비교해 spec을 갱신한다. 숫자가 크게 다르면 패턴 분류도 재검토해야 할 수 있다.

- [ ] **Step 1: Read audit baseline numbers**

Run: `cat test/audits/audit-baseline.json | head -20` (Bash tool로)

Extract:
- `totalDisjointPairs`
- `fixturesWithRegressions`
- `patternTotals["size-variant-reject"]`
- `patternTotals["variant-prop-position"]`
- `patternTotals["unknown"]`

Record these numbers. Let them be `$TOTAL`, `$FIXTURES`, `$SIZE`, `$POS`, `$UNK`.

- [ ] **Step 2: Update spec §1 table**

Edit `docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md`:

Locate the section:

```markdown
86개 fixture에 대한 자동 감사 결과 (**주의**: 실제 리포에는 현재 84개 JSON fixture가 존재. 86이라는 숫자는 원본 audit 기준이며 Phase 0에서 재검증 필요):

| 지표 | 값 |
|---|---|
| 회귀 후보 (variant 집합 disjoint한 같은 부모 안 형제) | **74건** (main 57 + dependency 17) |
```

Replace with actual measured numbers:

```markdown
84개 fixture에 대한 자동 감사 결과 (`test/audits/audit-baseline.json`, Phase 0에서 재측정):

| 지표 | 값 |
|---|---|
| 회귀 후보 (variant 집합 disjoint한 같은 부모 안 형제) | **$TOTAL건** (fixture 분포는 audit-baseline.json 참조) |
| 패턴: size-variant-reject | $SIZE건 |
| 패턴: variant-prop-position | $POS건 |
| 패턴: unknown | $UNK건 |
| 회귀가 있는 fixture 수 | $FIXTURES |
```

(Replace `$TOTAL`, `$SIZE`, `$POS`, `$UNK`, `$FIXTURES` with the actual numbers from Step 1.)

- [ ] **Step 3: If numbers differ significantly from original (74)**

If `$TOTAL` differs from 74 by more than ±10:
- Add a note below the table explaining the discrepancy:
  ```markdown
  **Phase 0 재측정 주석**: 원본 audit(74건)과 차이가 있는 이유는 (a) fixture 개수 차이(86→84), (b) 탐지 기준 차이 — Phase 0 audit은 "disjoint variant set sibling"만 감지하며, 원본 audit이 포함했을 가능성이 있는 추가 heuristic은 반영하지 않음. Phase 1 진행 중 패턴별 분포가 크게 다르면 §1.1 패턴 분류 재검토 필요.
  ```

If the number matches within ±10: no additional note needed.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-08-variant-merger-engine-design.md
git commit -m "docs(spec): reconcile §1 audit numbers with Phase 0 measured baseline"
```

---

## Task 9: CI integration check

**Files:**
- Verify existing test runner picks up new test files

**Context:** `vitest.config.ts`의 `include` 패턴은 `test/**/*.test.ts`이므로 새로 추가한 모든 테스트가 자동으로 `npm run test`에 포함된다. 확인만 하면 된다.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test -- --reporter=verbose 2>&1 | grep -E "audits|snapshots|matching"`
Expected: Output includes:
- `test/audits/detectDisjointVariants.test.ts`
- `test/audits/classifyPattern.test.ts`
- `test/audits/variantMatchingAudit.test.ts`
- `test/snapshots/serializeTree.test.ts`
- `test/snapshots/internalTreeSnapshot.test.ts`
- `test/snapshots/uiTreeSnapshot.test.ts`
- `test/matching/pairAssertions.test.ts`

- [ ] **Step 2: Verify nothing breaks in the broader test run**

Run: `npm run test`
Expected: All tests pass. Total test count increased by ~170 (84 InternalTree snapshots + 84 UITree snapshots + ~4 unit tests).

- [ ] **Step 3: No commit needed — verification only**

If anything fails, debug and fix in a follow-up commit. Do not proceed to Phase 1 until `npm run test` and `npm run audit` both pass cleanly.

---

## Completion Criteria

Phase 0 is complete when:

- [ ] `npm run audit` passes in baseline-compare mode
- [ ] `npm run audit:write` regenerates `audit-baseline.json` idempotently
- [ ] `npm run test` passes with new snapshot + unit tests included
- [ ] `test/snapshots/__snapshots__/internalTreeSnapshot.test.ts.snap` exists and has baseline header comment
- [ ] `test/snapshots/__snapshots__/uiTreeSnapshot.test.ts.snap` exists and has baseline header comment
- [ ] `test/matching/pairAssertions.data.ts` exists (empty array is OK)
- [ ] Spec §1 numbers match `audit-baseline.json` or have reconciliation note
- [ ] All above committed on `feat/variant-merger-phase0` worktree branch

Phase 1 can begin once these criteria are met. Phase 1 will start by populating `pairAssertions.data.ts` with the Switch Knob / Toggle / Plus / Tagreview cases and watching those assertions fail against the current engine — those failures become the TDD input for the new matching engine.
