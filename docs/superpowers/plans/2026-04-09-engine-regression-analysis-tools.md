# Engine Regression Analysis Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Variant Merger 엔진 변경 시 회귀를 자동으로 추적·분석할 수 있는 재사용 가능한 도구 세트 구축 (auditDiff / anomalyScan / matchTrace + 워크플로우 문서).

**Architecture:** 모든 도구는 vitest 테스트로 동작. 기존 `runAudit()` 로직을 helper 모듈로 추출해 재사용. AnomalyDetector는 plugin 형태로 확장 가능. matchTrace는 NodeMatcher의 기존 `__MATCH_REASON_LOG__` global hook을 활용 (엔진 코드 변경 없음).

**Tech Stack:** TypeScript 5.3, vitest 4, Node.js ≥22

**Spec:** `docs/superpowers/specs/2026-04-09-engine-regression-analysis-tools-design.md`

---

## File Structure

**새로 생성**:
- `test/audits/runAudit.ts` — `runAudit()` 함수와 관련 타입을 추출 (Task 1)
- `test/audits/auditDiff.ts` — diff 비교 helper (Task 2)
- `test/audits/auditDiff.test.ts` — vitest entry (Task 2)
- `test/audits/detectors/types.ts` — `AnomalyDetector` 인터페이스 (Task 3)
- `test/audits/detectors/CrossNameDetector.ts` — cross-name 매칭 detector (Task 3)
- `test/audits/detectors/CrossNameDetector.test.ts` — 단위 테스트 (Task 3)
- `test/audits/anomalyScan.ts` — scan 로직 helper (Task 4)
- `test/audits/anomalyScan.test.ts` — vitest entry, baseline 비교 (Task 4)
- `test/audits/baselines/anomaly-baseline.json` — anomaly baseline (Task 4)
- `test/audits/matchTrace.test.ts` — pair trace 도구 (Task 5)
- `docs/guide/8-workflow/regression-analysis.md` — 사용법 가이드 (Task 6)

**수정**:
- `test/audits/variantMatchingAudit.test.ts` — `runAudit` import로 변경 (Task 1)
- `package.json` — npm scripts 추가 (Task 2, 4, 5)

**삭제**:
- `test/tree-builder/cross-name-merge-scan.test.ts` — anomalyScan으로 이전 후 (Task 4)
- `test/tree-builder/buttonsolid-raw-merge-inspect.test.ts` — 일회성 조사 도구, 더 이상 필요 없음 (Task 4)
- `test/tree-builder/cross-name-merge-hits.json`, `cross-name-suspects.json`, `cross-name-simulate.cjs`, `cross-name-label-all.cjs`, `buttonsolid-raw-merge.json`, `buttonsolid-interactions.json` — 임시 산출물 (Task 4)

---

## Task 1: runAudit 추출 (리팩토링)

**Files:**
- Create: `test/audits/runAudit.ts`
- Modify: `test/audits/variantMatchingAudit.test.ts`

**목적**: `runAudit()` 함수와 관련 타입(`AuditReport`, `FixtureReport`, `emptyPatternCounts`, `makeEmptyReport`)을 별도 모듈로 추출하여 auditDiff에서 재사용 가능하게 만든다. 기존 audit 동작은 그대로.

- [ ] **Step 1: 기존 audit 동작 baseline 확인**

Run: `npm run audit`
Expected: PASS, "Total disjoint pairs: 1856" 등 출력

- [ ] **Step 2: runAudit.ts 생성 (함수 + 타입 이전)**

Create `test/audits/runAudit.ts`:

```typescript
import { writeFileSync } from "fs";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { detectDisjointVariants, DisjointPair } from "./detectDisjointVariants";
import { classifyPattern, PatternLabel } from "./classifyPattern";

export interface FixtureReport {
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

export interface AuditReport {
  generatedAt: string;
  totalFixtures: number;
  fixturesWithRegressions: number;
  totalDisjointPairs: number;
  compileErrors: number;
  patternTotals: Record<PatternLabel, number>;
  byFixture: FixtureReport[];
}

export function emptyPatternCounts(): Record<PatternLabel, number> {
  return {
    "size-variant-reject": 0,
    "variant-prop-position": 0,
    "same-name-same-type": 0,
    "same-name-cross-type": 0,
    "different-type": 0,
    "different-name": 0,
    unknown: 0,
  };
}

export function makeEmptyReport(name: string): FixtureReport {
  return {
    fixture: name,
    disjointCount: 0,
    patterns: emptyPatternCounts(),
    pairs: [],
  };
}

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

export async function runAudit(): Promise<AuditReport> {
  const byFixture: FixtureReport[] = [];
  const patternTotals: Record<PatternLabel, number> = emptyPatternCounts();
  let totalDisjointPairs = 0;
  let fixturesWithRegressions = 0;
  let compileErrors = 0;

  const entries = Object.entries(fixtureLoaders)
    .map(([p, loader]) => ({
      name: p.replace("../fixtures/", "").replace(".json", ""),
      loader,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const { name, loader } of entries) {
    const mod = (await loader()) as {
      default: { info?: { document?: unknown } };
    };
    const data = mod.default;
    let pairs: DisjointPair[] = [];
    try {
      const dm = new DataManager(data as any);
      const tb = new TreeBuilder(dm);
      const doc = data?.info?.document;
      if (!doc) {
        byFixture.push({
          ...makeEmptyReport(name),
          fixture: `${name} (COMPILE_ERROR: missing document)`,
        });
        compileErrors++;
        continue;
      }
      const tree = tb.buildInternalTreeDebug(doc as any);
      pairs = detectDisjointVariants(tree);
    } catch (err) {
      byFixture.push({
        ...makeEmptyReport(name),
        fixture: `${name} (COMPILE_ERROR: ${(err as Error).message.slice(0, 80)})`,
      });
      compileErrors++;
      continue;
    }

    const patterns: Record<PatternLabel, number> = emptyPatternCounts();
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
    compileErrors,
    patternTotals,
    byFixture,
  };
}
```

- [ ] **Step 3: variantMatchingAudit.test.ts 수정 — import로 교체**

Edit `test/audits/variantMatchingAudit.test.ts`:

- 상단의 `runAudit`, `AuditReport`, `FixtureReport`, `emptyPatternCounts`, `makeEmptyReport` 함수/타입 정의 전체 삭제
- `fixtureLoaders` 정의 삭제 (runAudit.ts로 이동됨)
- 아래 import 추가:

```typescript
import { runAudit, AuditReport } from "./runAudit";
```

기존 import 중 `DataManager`, `TreeBuilder`, `detectDisjointVariants`, `DisjointPair`, `classifyPattern`, `PatternLabel`은 더 이상 직접 사용하지 않으므로 삭제.

`describe`, `it`, `expect`, `writeFileSync`, `existsSync`, `readFileSync`, `resolve` import는 유지.

- [ ] **Step 4: 기존 audit 재실행 — 동작 유지 확인**

Run: `npm run audit`
Expected: PASS, "Total disjoint pairs: 1856" (Step 1과 동일)

- [ ] **Step 5: 커밋**

```bash
git add test/audits/runAudit.ts test/audits/variantMatchingAudit.test.ts
git commit -m "$(cat <<'EOF'
refactor(audit): runAudit() 함수와 타입을 별도 모듈로 추출

auditDiff 등 후속 도구가 같은 audit 로직을 재사용할 수 있도록
variantMatchingAudit.test.ts에서 runAudit/타입을 runAudit.ts로 분리.
기존 audit 동작은 그대로.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: auditDiff 도구

**Files:**
- Create: `test/audits/auditDiff.ts`
- Create: `test/audits/auditDiff.test.ts`
- Modify: `package.json` (scripts에 `audit:diff` 추가)

**목적**: 현재 audit 결과와 baseline을 비교해 diff 리포트 출력. 새 회귀 / 사라진 회귀 / 패턴별 변화를 fixture별로 보여줌.

- [ ] **Step 1: auditDiff.ts helper 생성 — 순수 함수**

Create `test/audits/auditDiff.ts`:

```typescript
import { AuditReport, FixtureReport } from "./runAudit";
import { PatternLabel } from "./classifyPattern";

export interface FixturePairKey {
  fixture: string;
  parentId: string;
  a: string;
  b: string;
}

export interface PairChange {
  fixture: string;
  parentId: string;
  a: string;
  b: string;
  pattern: PatternLabel;
}

export interface AuditDiffResult {
  totalBefore: number;
  totalAfter: number;
  totalDelta: number;
  patternDelta: Record<PatternLabel, number>;
  newRegressions: PairChange[];
  resolvedRegressions: PairChange[];
}

export function diffAudits(
  baseline: AuditReport,
  current: AuditReport
): AuditDiffResult {
  const baselinePairs = collectPairs(baseline);
  const currentPairs = collectPairs(current);

  const baselineKeys = new Set(baselinePairs.map(pairKeyString));
  const currentKeys = new Set(currentPairs.map(pairKeyString));

  const newRegressions = currentPairs.filter(
    (p) => !baselineKeys.has(pairKeyString(p))
  );
  const resolvedRegressions = baselinePairs.filter(
    (p) => !currentKeys.has(pairKeyString(p))
  );

  const patternDelta: Record<PatternLabel, number> = {
    "size-variant-reject": 0,
    "variant-prop-position": 0,
    "same-name-same-type": 0,
    "same-name-cross-type": 0,
    "different-type": 0,
    "different-name": 0,
    unknown: 0,
  };
  for (const k of Object.keys(patternDelta) as PatternLabel[]) {
    patternDelta[k] =
      (current.patternTotals[k] ?? 0) - (baseline.patternTotals[k] ?? 0);
  }

  return {
    totalBefore: baseline.totalDisjointPairs,
    totalAfter: current.totalDisjointPairs,
    totalDelta: current.totalDisjointPairs - baseline.totalDisjointPairs,
    patternDelta,
    newRegressions,
    resolvedRegressions,
  };
}

function collectPairs(report: AuditReport): PairChange[] {
  const out: PairChange[] = [];
  for (const f of report.byFixture) {
    for (const p of f.pairs) {
      out.push({
        fixture: f.fixture,
        parentId: p.parentId,
        a: p.a,
        b: p.b,
        pattern: p.pattern,
      });
    }
  }
  return out;
}

function pairKeyString(p: PairChange | FixturePairKey): string {
  return `${p.fixture}|${p.parentId}|${p.a}|${p.b}`;
}

export function formatDiffReport(diff: AuditDiffResult): string {
  const lines: string[] = [];
  lines.push("=== Audit Diff ===");
  lines.push(
    `Total: ${diff.totalBefore} → ${diff.totalAfter} (${signed(diff.totalDelta)})`
  );
  lines.push("Patterns:");
  for (const [k, delta] of Object.entries(diff.patternDelta)) {
    if (delta === 0) continue;
    lines.push(`  ${k}: ${signed(delta)}`);
  }
  lines.push("");
  lines.push(`New regressions (${diff.newRegressions.length}):`);
  for (const r of diff.newRegressions) {
    lines.push(`  + ${r.fixture}  ${r.a} ↔ ${r.b}  [${r.pattern}]`);
  }
  lines.push("");
  lines.push(`Resolved regressions (${diff.resolvedRegressions.length}):`);
  for (const r of diff.resolvedRegressions) {
    lines.push(`  - ${r.fixture}  ${r.a} ↔ ${r.b}  [${r.pattern}]`);
  }
  return lines.join("\n");
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
```

- [ ] **Step 2: 단위 테스트 작성 — fail 먼저**

Create `test/audits/auditDiff.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { runAudit, AuditReport } from "./runAudit";
import { diffAudits, formatDiffReport } from "./auditDiff";

const BASELINE_PATH = resolve(
  process.cwd(),
  "test/audits/audit-baseline.json"
);

describe("auditDiff helper", () => {
  it("detects new and resolved pairs across reports", () => {
    const baseline: AuditReport = {
      generatedAt: "t0",
      totalFixtures: 1,
      fixturesWithRegressions: 1,
      totalDisjointPairs: 2,
      compileErrors: 0,
      patternTotals: {
        "size-variant-reject": 1,
        "variant-prop-position": 1,
        "same-name-same-type": 0,
        "same-name-cross-type": 0,
        "different-type": 0,
        "different-name": 0,
        unknown: 0,
      },
      byFixture: [
        {
          fixture: "fx",
          disjointCount: 2,
          patterns: {
            "size-variant-reject": 1,
            "variant-prop-position": 1,
            "same-name-same-type": 0,
            "same-name-cross-type": 0,
            "different-type": 0,
            "different-name": 0,
            unknown: 0,
          },
          pairs: [
            {
              parentId: "p1",
              a: "n1",
              b: "n2",
              variantsA: ["v1"],
              variantsB: ["v2"],
              pattern: "size-variant-reject",
            },
            {
              parentId: "p1",
              a: "n3",
              b: "n4",
              variantsA: ["v1"],
              variantsB: ["v2"],
              pattern: "variant-prop-position",
            },
          ],
        },
      ],
    };
    const current: AuditReport = {
      ...baseline,
      generatedAt: "t1",
      totalDisjointPairs: 2,
      patternTotals: {
        ...baseline.patternTotals,
        "size-variant-reject": 0,
        "same-name-same-type": 1,
      },
      byFixture: [
        {
          ...baseline.byFixture[0],
          patterns: {
            ...baseline.byFixture[0].patterns,
            "size-variant-reject": 0,
            "same-name-same-type": 1,
          },
          pairs: [
            // size-variant-reject 사라짐
            baseline.byFixture[0].pairs[1], // variant-prop-position 유지
            {
              parentId: "p1",
              a: "n5",
              b: "n6",
              variantsA: ["v1"],
              variantsB: ["v2"],
              pattern: "same-name-same-type",
            }, // 새 회귀
          ],
        },
      ],
    };

    const diff = diffAudits(baseline, current);
    expect(diff.newRegressions).toHaveLength(1);
    expect(diff.newRegressions[0].a).toBe("n5");
    expect(diff.resolvedRegressions).toHaveLength(1);
    expect(diff.resolvedRegressions[0].a).toBe("n1");
    expect(diff.patternDelta["size-variant-reject"]).toBe(-1);
    expect(diff.patternDelta["same-name-same-type"]).toBe(1);
  });

  it("formatDiffReport produces text output with deltas", () => {
    const baseline: AuditReport = {
      generatedAt: "t0",
      totalFixtures: 0,
      fixturesWithRegressions: 0,
      totalDisjointPairs: 5,
      compileErrors: 0,
      patternTotals: {
        "size-variant-reject": 5,
        "variant-prop-position": 0,
        "same-name-same-type": 0,
        "same-name-cross-type": 0,
        "different-type": 0,
        "different-name": 0,
        unknown: 0,
      },
      byFixture: [],
    };
    const current: AuditReport = {
      ...baseline,
      totalDisjointPairs: 3,
      patternTotals: { ...baseline.patternTotals, "size-variant-reject": 3 },
    };
    const text = formatDiffReport(diffAudits(baseline, current));
    expect(text).toContain("Total: 5 → 3 (-2)");
    expect(text).toContain("size-variant-reject: -2");
  });
});

describe("auditDiff against current baseline", () => {
  it(
    "runs current audit and produces a diff report",
    async () => {
      expect(
        existsSync(BASELINE_PATH),
        "audit-baseline.json missing. Run: npm run audit:write"
      ).toBe(true);
      const baseline = JSON.parse(
        readFileSync(BASELINE_PATH, "utf-8")
      ) as AuditReport;
      const current = await runAudit();
      const diff = diffAudits(baseline, current);
      const text = formatDiffReport(diff);
      process.stdout.write("\n" + text + "\n");

      // baseline 갱신 모드
      if (process.env.UPDATE_BASELINE === "1") {
        writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
        process.stdout.write(`\nBaseline updated: ${BASELINE_PATH}\n`);
        return;
      }

      // diff는 정보 출력만 — 회귀 게이트는 variantMatchingAudit.test.ts에서 검증
      expect(diff.totalAfter).toBeGreaterThanOrEqual(0);
    },
    120_000
  );
});
```

- [ ] **Step 3: 단위 테스트만 먼저 실행 — helper 검증**

Run: `npx vitest run test/audits/auditDiff.test.ts -t "auditDiff helper"`
Expected: PASS (2 tests)

- [ ] **Step 4: full audit:diff 실행**

Run: `npx vitest run test/audits/auditDiff.test.ts`
Expected: PASS (3 tests). 출력에 "=== Audit Diff ===", "Total: 1856 → 1856 (+0)" 등이 포함되어야 함.

- [ ] **Step 5: package.json에 npm script 추가**

Edit `package.json`, scripts 섹션에 추가:

```json
"audit:diff": "vitest run test/audits/auditDiff.test.ts"
```

기존 `audit`, `audit:write` 다음 줄에 배치.

- [ ] **Step 6: npm script 동작 확인**

Run: `npm run audit:diff`
Expected: PASS, diff 리포트 출력

- [ ] **Step 7: 커밋**

```bash
git add test/audits/auditDiff.ts test/audits/auditDiff.test.ts package.json
git commit -m "$(cat <<'EOF'
feat(audit): auditDiff 도구 — baseline과 현재 audit 결과 diff 출력

엔진 변경 시 fixture별/패턴별 회귀 변화를 추적할 수 있도록
auditDiff helper와 vitest entry 추가. UPDATE_BASELINE=1 환경변수로
baseline 갱신 가능.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: AnomalyDetector 인터페이스 + CrossNameDetector

**Files:**
- Create: `test/audits/detectors/types.ts`
- Create: `test/audits/detectors/CrossNameDetector.ts`
- Create: `test/audits/detectors/CrossNameDetector.test.ts`

**목적**: anomaly 탐지를 plugin 가능한 구조로. 현재는 cross-name 1개만 등록하지만 새 anomaly 발견 시 detector 추가만 하면 되도록.

- [ ] **Step 1: types.ts 생성 — interface 정의**

Create `test/audits/detectors/types.ts`:

```typescript
import type { InternalNode, InternalTree } from "@code-generator2/types/types";
import type DataManager from "@code-generator2/layers/data-manager/DataManager";

export interface AnomalyContext {
  dataManager: DataManager;
  rootTree: InternalTree;
}

export interface Anomaly {
  detectorName: string;
  fixture: string;
  nodeId: string;
  primaryName: string;
  primaryType: string;
  payload: Record<string, unknown>;
}

export interface AnomalyDetector {
  readonly name: string;
  /**
   * 노드 하나에 대해 anomaly 여부를 판단.
   * - 이상 없음: null 반환
   * - 이상 있음: Anomaly 객체 반환 (fixture는 caller가 채움)
   *
   * @param node 검사할 InternalNode
   * @param depth 트리 깊이 (0 = variant root)
   * @param ctx
   */
  detect(
    node: InternalNode,
    depth: number,
    ctx: AnomalyContext
  ): Omit<Anomaly, "fixture"> | null;
}
```

- [ ] **Step 2: CrossNameDetector.ts 생성**

Create `test/audits/detectors/CrossNameDetector.ts`:

```typescript
import type { InternalNode } from "@code-generator2/types/types";
import type { AnomalyDetector, Anomaly, AnomalyContext } from "./types";

/**
 * mergedNodes에 서로 다른 이름이 섞인 노드를 탐지.
 * variant root(depth 0)는 mergedNodes name이 variant property string이라 스킵.
 */
export class CrossNameDetector implements AnomalyDetector {
  readonly name = "cross-name";

  detect(
    node: InternalNode,
    depth: number,
    _ctx: AnomalyContext
  ): Omit<Anomaly, "fixture"> | null {
    if (depth < 1) return null;
    const merged = node.mergedNodes ?? [];
    if (merged.length < 2) return null;

    const nameCounts = new Map<string, number>();
    for (const m of merged) {
      nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
    }
    if (nameCounts.size <= 1) return null;

    const sorted = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]);
    const primaryName = sorted[0][0];
    const outliers = sorted.slice(1);

    return {
      detectorName: this.name,
      nodeId: node.id,
      primaryName,
      primaryType: node.type,
      payload: {
        mergedNodesCount: merged.length,
        outlierNames: outliers.map(([n, c]) => ({ name: n, count: c })),
        outlierMerged: merged
          .filter((m) => m.name !== primaryName)
          .map((m) => ({
            id: m.id,
            name: m.name,
            variantName: m.variantName,
          })),
      },
    };
  }
}
```

- [ ] **Step 3: CrossNameDetector 단위 테스트 — fail 먼저**

Create `test/audits/detectors/CrossNameDetector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { InternalNode, InternalTree } from "@code-generator2/types/types";
import { CrossNameDetector } from "./CrossNameDetector";

const ctx = {} as any;

function makeNode(
  id: string,
  type: string,
  merged: Array<{ id: string; name: string; variantName: string }>
): InternalNode {
  return {
    id,
    type: type as any,
    name: merged[0]?.name ?? "",
    children: [],
    mergedNodes: merged,
  } as any;
}

describe("CrossNameDetector", () => {
  it("returns null for variant root (depth 0)", () => {
    const node = makeNode("root", "FRAME", [
      { id: "r1", name: "Size=Large", variantName: "Size=Large" },
      { id: "r2", name: "Size=Small", variantName: "Size=Small" },
    ]);
    const det = new CrossNameDetector();
    expect(det.detect(node, 0, ctx)).toBeNull();
  });

  it("returns null when all merged names are identical", () => {
    const node = makeNode("n1", "FRAME", [
      { id: "a", name: "Wrapper", variantName: "v1" },
      { id: "b", name: "Wrapper", variantName: "v2" },
      { id: "c", name: "Wrapper", variantName: "v3" },
    ]);
    const det = new CrossNameDetector();
    expect(det.detect(node, 1, ctx)).toBeNull();
  });

  it("returns null when mergedNodes has fewer than 2 entries", () => {
    const node = makeNode("n1", "FRAME", [
      { id: "a", name: "Wrapper", variantName: "v1" },
    ]);
    const det = new CrossNameDetector();
    expect(det.detect(node, 1, ctx)).toBeNull();
  });

  it("detects mixed names and reports primary + outliers", () => {
    const node = makeNode("n1", "FRAME", [
      { id: "a1", name: "Interaction", variantName: "v1" },
      { id: "a2", name: "Interaction", variantName: "v2" },
      { id: "a3", name: "Interaction", variantName: "v3" },
      { id: "b1", name: "Wrapper", variantName: "v4" },
    ]);
    const det = new CrossNameDetector();
    const result = det.detect(node, 1, ctx);
    expect(result).not.toBeNull();
    expect(result!.primaryName).toBe("Interaction");
    expect(result!.detectorName).toBe("cross-name");
    const payload = result!.payload as any;
    expect(payload.outlierNames).toEqual([{ name: "Wrapper", count: 1 }]);
    expect(payload.mergedNodesCount).toBe(4);
    expect(payload.outlierMerged).toHaveLength(1);
    expect(payload.outlierMerged[0].id).toBe("b1");
  });
});
```

- [ ] **Step 4: 단위 테스트 실행**

Run: `npx vitest run test/audits/detectors/CrossNameDetector.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add test/audits/detectors/
git commit -m "$(cat <<'EOF'
feat(audit): AnomalyDetector 인터페이스 + CrossNameDetector 추가

mergedNodes에 다른 이름이 섞인 노드를 탐지하는 detector.
새 anomaly 패턴이 발견되면 detector 추가만 하면 됨.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: anomalyScan + baseline + 임시 파일 정리

**Files:**
- Create: `test/audits/anomalyScan.ts`
- Create: `test/audits/anomalyScan.test.ts`
- Create: `test/audits/baselines/anomaly-baseline.json` (테스트 실행으로 생성)
- Modify: `package.json` (scripts에 `audit:anomaly`, `audit:anomaly:write` 추가)

**Note**: 이전 조사용 임시 파일(`test/tree-builder/cross-name-merge-scan.test.ts`, `buttonsolid-raw-merge-inspect.test.ts`, 그리고 `cross-name-*` / `buttonsolid-*` JSON·CJS 산출물)은 main repo에서 이미 정리되었으므로 worktree에는 존재하지 않는다. Step 7(파일 삭제 단계)는 더 이상 필요 없다.

**목적**: 모든 fixture를 raw merged tree로 스캔하고 등록된 detector를 적용. 결과를 anomaly-baseline.json에 저장하고 baseline 비교 지원.

- [ ] **Step 1: anomalyScan.ts helper 생성**

Create `test/audits/anomalyScan.ts`:

```typescript
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import type { InternalNode, InternalTree } from "@code-generator2/types/types";
import type { AnomalyDetector, Anomaly } from "./detectors/types";
import { CrossNameDetector } from "./detectors/CrossNameDetector";

export interface AnomalyReport {
  generatedAt: string;
  totalFixtures: number;
  totalAnomalies: number;
  byDetector: Record<string, number>;
  byFixture: Array<{
    fixture: string;
    count: number;
    anomalies: Anomaly[];
  }>;
}

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

export function defaultDetectors(): AnomalyDetector[] {
  return [new CrossNameDetector()];
}

export async function runAnomalyScan(
  detectors: AnomalyDetector[] = defaultDetectors()
): Promise<AnomalyReport> {
  const byFixture: AnomalyReport["byFixture"] = [];
  const byDetector: Record<string, number> = {};
  for (const d of detectors) byDetector[d.name] = 0;
  let totalAnomalies = 0;

  const entries = Object.entries(fixtureLoaders)
    .map(([p, loader]) => ({
      name: p.replace("../fixtures/", "").replace(".json", ""),
      loader,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const { name, loader } of entries) {
    const mod = (await loader()) as {
      default: { info?: { document?: unknown } };
    };
    const data = mod.default;
    const doc = data?.info?.document;
    if (!doc) {
      byFixture.push({ fixture: name, count: 0, anomalies: [] });
      continue;
    }

    let tree: InternalTree;
    let dm: DataManager;
    try {
      dm = new DataManager(data as any);
      const tb = new TreeBuilder(dm);
      tree = tb.buildInternalTreeDebug(doc as any, {
        skipInteractionStripper: true,
      });
    } catch {
      byFixture.push({ fixture: name, count: 0, anomalies: [] });
      continue;
    }

    const ctx = { dataManager: dm, rootTree: tree };
    const anomalies: Anomaly[] = [];

    const walk = (node: InternalNode, depth: number) => {
      for (const det of detectors) {
        const result = det.detect(node, depth, ctx);
        if (result) {
          const anomaly: Anomaly = { ...result, fixture: name };
          anomalies.push(anomaly);
          byDetector[det.name]++;
        }
      }
      for (const c of node.children ?? []) walk(c, depth + 1);
    };
    walk(tree, 0);

    byFixture.push({ fixture: name, count: anomalies.length, anomalies });
    totalAnomalies += anomalies.length;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalFixtures: entries.length,
    totalAnomalies,
    byDetector,
    byFixture,
  };
}

export interface AnomalyDiff {
  totalBefore: number;
  totalAfter: number;
  totalDelta: number;
  newAnomalies: Anomaly[];
  resolvedAnomalies: Anomaly[];
}

function anomalyKey(a: Anomaly): string {
  return `${a.fixture}|${a.detectorName}|${a.nodeId}`;
}

export function diffAnomalies(
  baseline: AnomalyReport,
  current: AnomalyReport
): AnomalyDiff {
  const baselineList: Anomaly[] = baseline.byFixture.flatMap((f) => f.anomalies);
  const currentList: Anomaly[] = current.byFixture.flatMap((f) => f.anomalies);
  const baselineKeys = new Set(baselineList.map(anomalyKey));
  const currentKeys = new Set(currentList.map(anomalyKey));
  return {
    totalBefore: baseline.totalAnomalies,
    totalAfter: current.totalAnomalies,
    totalDelta: current.totalAnomalies - baseline.totalAnomalies,
    newAnomalies: currentList.filter((a) => !baselineKeys.has(anomalyKey(a))),
    resolvedAnomalies: baselineList.filter(
      (a) => !currentKeys.has(anomalyKey(a))
    ),
  };
}

export function formatAnomalyReport(report: AnomalyReport): string {
  const lines: string[] = [];
  lines.push("=== Anomaly Scan ===");
  lines.push(`Total: ${report.totalAnomalies}`);
  for (const [name, count] of Object.entries(report.byDetector)) {
    lines.push(`  ${name}: ${count}`);
  }
  return lines.join("\n");
}

export function formatAnomalyDiff(diff: AnomalyDiff): string {
  const lines: string[] = [];
  lines.push("=== Anomaly Diff ===");
  lines.push(
    `Total: ${diff.totalBefore} → ${diff.totalAfter} (${
      diff.totalDelta >= 0 ? "+" : ""
    }${diff.totalDelta})`
  );
  lines.push(`New (${diff.newAnomalies.length}):`);
  for (const a of diff.newAnomalies) {
    lines.push(`  + ${a.fixture}  ${a.primaryName} (${a.primaryType}) ${a.nodeId}`);
  }
  lines.push(`Resolved (${diff.resolvedAnomalies.length}):`);
  for (const a of diff.resolvedAnomalies) {
    lines.push(`  - ${a.fixture}  ${a.primaryName} (${a.primaryType}) ${a.nodeId}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: anomalyScan vitest entry — fail 먼저**

Create `test/audits/anomalyScan.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import {
  runAnomalyScan,
  diffAnomalies,
  formatAnomalyReport,
  formatAnomalyDiff,
  AnomalyReport,
} from "./anomalyScan";

const BASELINE_PATH = resolve(
  process.cwd(),
  "test/audits/baselines/anomaly-baseline.json"
);

describe("Anomaly scan", () => {
  it(
    "produces report and compares with baseline",
    async () => {
      const current = await runAnomalyScan();
      process.stdout.write("\n" + formatAnomalyReport(current) + "\n");

      if (process.env.UPDATE_ANOMALY_BASELINE === "1") {
        mkdirSync(dirname(BASELINE_PATH), { recursive: true });
        writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
        process.stdout.write(`\nAnomaly baseline written: ${BASELINE_PATH}\n`);
        return;
      }

      expect(
        existsSync(BASELINE_PATH),
        "anomaly-baseline.json missing. Run: UPDATE_ANOMALY_BASELINE=1 npm run audit:anomaly"
      ).toBe(true);

      const baseline = JSON.parse(
        readFileSync(BASELINE_PATH, "utf-8")
      ) as AnomalyReport;
      const diff = diffAnomalies(baseline, current);
      process.stdout.write("\n" + formatAnomalyDiff(diff) + "\n");

      // 신규 anomaly가 늘어나면 fail (게이트)
      expect(diff.newAnomalies.length).toBe(0);
    },
    180_000
  );
});
```

- [ ] **Step 3: 첫 baseline 생성**

Run: `UPDATE_ANOMALY_BASELINE=1 npx vitest run test/audits/anomalyScan.test.ts`
Expected: PASS, "Anomaly baseline written: ..." 출력. `test/audits/baselines/anomaly-baseline.json` 파일 생성됨.

- [ ] **Step 4: 두 번째 실행 — baseline 비교 동작 검증**

Run: `npx vitest run test/audits/anomalyScan.test.ts`
Expected: PASS, "=== Anomaly Diff ===", "Total: 119 → 119 (+0)" 등.

- [ ] **Step 5: package.json에 npm scripts 추가**

Edit `package.json`, scripts 섹션에 추가:

```json
"audit:anomaly": "vitest run test/audits/anomalyScan.test.ts",
"audit:anomaly:write": "UPDATE_ANOMALY_BASELINE=1 vitest run test/audits/anomalyScan.test.ts"
```

- [ ] **Step 6: npm script 동작 확인**

Run: `npm run audit:anomaly`
Expected: PASS

- [ ] **Step 7: (skip) 임시 파일 정리**

Main repo에서 이미 정리되었으므로 worktree에 해당 파일이 없다. `ls test/tree-builder/`로 확인만 하고 넘어간다.

Run: `ls test/tree-builder/ | grep -E "cross-name|buttonsolid-raw|buttonsolid-interactions" || echo "ok: no temp files"`
Expected: `ok: no temp files`

- [ ] **Step 8: 전체 테스트로 회귀 확인**

Run: `npm run test`
Expected: 모든 테스트 PASS. 삭제한 임시 파일에 의존하는 테스트가 없는지 확인.

- [ ] **Step 9: 커밋**

```bash
git add test/audits/anomalyScan.ts test/audits/anomalyScan.test.ts test/audits/baselines/anomaly-baseline.json package.json
git commit -m "$(cat <<'EOF'
feat(audit): anomalyScan 도구 + 첫 anomaly baseline

모든 fixture의 raw merged tree에 등록된 AnomalyDetector를 적용.
결과를 anomaly-baseline.json에 저장하고 baseline diff 지원.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: matchTrace 도구

**Files:**
- Create: `test/audits/matchTrace.test.ts`
- Modify: `package.json` (scripts에 `audit:trace` 추가)

**목적**: 특정 fixture + 두 Figma node ID에 대해 NodeMatcher가 어떻게 결정했는지 신호별로 출력. NodeMatcher의 기존 `__MATCH_REASON_LOG__` global hook 활용.

- [ ] **Step 1: matchTrace.test.ts 생성**

Create `test/audits/matchTrace.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import { VariantMerger } from "@code-generator2/layers/tree-manager/tree-builder/processors/VariantMerger";
import { LayoutNormalizer } from "@code-generator2/layers/tree-manager/tree-builder/processors/LayoutNormalizer";
import { NodeMatcher } from "@code-generator2/layers/tree-manager/tree-builder/processors/NodeMatcher";
import type { InternalNode, InternalTree } from "@code-generator2/types/types";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

interface SignalLogEntry {
  pair: [string, string];
  decision: string;
  totalCost: number;
  signalResults: Array<{
    signalName: string;
    result: { kind: string; cost?: number; reason?: string; score?: number };
    weight: number;
  }>;
  source: string;
}

function findInternalNodeByMergedId(
  tree: InternalTree,
  figmaId: string
): InternalNode | null {
  const walk = (node: InternalNode): InternalNode | null => {
    if (node.id === figmaId) return node;
    if (node.mergedNodes?.some((m) => m.id === figmaId)) return node;
    for (const c of node.children ?? []) {
      const found = walk(c);
      if (found) return found;
    }
    return null;
  };
  return walk(tree);
}

function formatTrace(
  fixture: string,
  nodeA: InternalNode,
  nodeB: InternalNode,
  log: SignalLogEntry[]
): string {
  const lines: string[] = [];
  lines.push(`=== Match Trace: ${fixture} ===`);
  lines.push(
    `Pair: ${nodeA.id} (${nodeA.name}, ${nodeA.type}) ↔ ${nodeB.id} (${nodeB.name}, ${nodeB.type})`
  );
  lines.push("");
  lines.push("Signal              | Decision           | Cost  | Reason");
  lines.push("--------------------|--------------------|-------|----------------------------");
  const last = log[log.length - 1];
  if (!last) {
    lines.push("(no signal log entries)");
    return lines.join("\n");
  }
  for (const sr of last.signalResults) {
    const cost =
      "cost" in sr.result && typeof sr.result.cost === "number"
        ? sr.result.cost.toFixed(2)
        : "score" in sr.result && typeof sr.result.score === "number"
          ? `s=${sr.result.score.toFixed(2)}`
          : "-";
    const reason = (sr.result as any).reason ?? "";
    lines.push(
      `${sr.signalName.padEnd(20)}| ${sr.result.kind.padEnd(19)}| ${String(cost).padEnd(6)}| ${reason}`
    );
  }
  lines.push(
    "--------------------|--------------------|-------|----------------------------"
  );
  lines.push(
    `TOTAL               | ${last.decision.padEnd(19)}| ${
      last.totalCost === Infinity ? "Inf" : last.totalCost.toFixed(2)
    }   |`
  );
  return lines.join("\n");
}

describe("matchTrace", () => {
  it(
    "traces signal decisions for a node pair",
    async () => {
      const fixture = process.env.TRACE_FIXTURE;
      const nodeIdA = process.env.TRACE_A;
      const nodeIdB = process.env.TRACE_B;

      if (!fixture || !nodeIdA || !nodeIdB) {
        process.stdout.write(
          "\nUsage: TRACE_FIXTURE=<fixture> TRACE_A=<id> TRACE_B=<id> npm run audit:trace\n"
        );
        process.stdout.write(
          'Example: TRACE_FIXTURE=failing/Buttonsolid TRACE_A=16215:37749 TRACE_B=16215:37612 npm run audit:trace\n'
        );
        // 인자 없을 때 명시적으로 PASS — vitest "no-assertion" warning 방지
        expect(true).toBe(true);
        return;
      }

      const fixturePath = `../fixtures/${fixture}.json`;
      const loader = fixtureLoaders[fixturePath];
      expect(loader, `fixture not found: ${fixture}`).toBeTruthy();

      const mod = (await loader!()) as { default: any };
      const data = mod.default;
      const doc = data?.info?.document;
      expect(doc).toBeTruthy();

      // VariantMerger를 직접 호출해 nodeToVariantRoot를 얻는다.
      // (TreeBuilder.buildInternalTreeDebug는 이 매핑을 반환하지 않고
      //  stripper도 옵션이지만, NodeMatcher 구성을 위해 매핑이 필요하므로
      //  merger를 우리가 직접 만든다. stripper는 적용하지 않음 — raw tree 보고싶음)
      const dm = new DataManager(data);
      const merger = new VariantMerger(dm);
      const tree = merger.merge(doc);
      const nodeToVariantRoot = merger.nodeToVariantRoot;

      const internalA = findInternalNodeByMergedId(tree, nodeIdA);
      const internalB = findInternalNodeByMergedId(tree, nodeIdB);
      expect(internalA, `node A not found: ${nodeIdA}`).toBeTruthy();
      expect(internalB, `node B not found: ${nodeIdB}`).toBeTruthy();

      const log: SignalLogEntry[] = [];
      (globalThis as any).__MATCH_REASON_LOG__ = log;

      try {
        const layoutNormalizer = new LayoutNormalizer(dm);
        const matcher = new NodeMatcher(dm, nodeToVariantRoot, layoutNormalizer);
        matcher.getPositionCost(internalA!, internalB!);
      } finally {
        delete (globalThis as any).__MATCH_REASON_LOG__;
      }

      process.stdout.write(
        "\n" + formatTrace(fixture, internalA!, internalB!, log) + "\n"
      );

      // trace가 최소 1건 수집되었는지 확인
      expect(log.length).toBeGreaterThan(0);
    },
    60_000
  );
});
```

- [ ] **Step 2: 인자 없이 실행 — usage 메시지 + PASS 확인**

Run: `npx vitest run test/audits/matchTrace.test.ts`
Expected: PASS (1 test, usage 메시지 출력 후 early return).

- [ ] **Step 3: 알려진 pair로 trace 실행 — Buttonsolid Wrapper↔Interaction**

Run:
```bash
TRACE_FIXTURE=failing/Buttonsolid TRACE_A=16215:37749 TRACE_B=16215:37612 npx vitest run test/audits/matchTrace.test.ts
```
Expected: PASS, 출력에 "=== Match Trace: failing/Buttonsolid ===", "Wrapper", "Interaction", 신호 표가 포함되어야 함.

- [ ] **Step 4: package.json에 npm script 추가**

Edit `package.json`, scripts 섹션에 추가:

```json
"audit:trace": "vitest run test/audits/matchTrace.test.ts"
```

- [ ] **Step 5: npm script로 동작 확인**

Run:
```bash
TRACE_FIXTURE=failing/Buttonsolid TRACE_A=16215:37749 TRACE_B=16215:37612 npm run audit:trace
```
Expected: PASS, trace 출력.

- [ ] **Step 6: 커밋**

```bash
git add test/audits/matchTrace.test.ts package.json
git commit -m "$(cat <<'EOF'
feat(audit): matchTrace 도구 — 노드 pair 매칭 결정 추적

특정 fixture의 두 Figma node ID에 대해 NodeMatcher가 어떻게
결정했는지 신호별로 출력. 기존 __MATCH_REASON_LOG__ global hook
활용 (엔진 코드 변경 없음).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 워크플로우 가이드 문서

**Files:**
- Create: `docs/guide/8-workflow/regression-analysis.md`

**목적**: 엔진 변경 시 사용해야 할 워크플로우와 각 도구의 사용법을 한 페이지 가이드로 정리.

- [ ] **Step 1: 가이드 문서 작성**

Create `docs/guide/8-workflow/regression-analysis.md`:

```markdown
# Variant Merger 엔진 회귀 분석 워크플로우

> 엔진 변경 시 회귀를 추적하고 원인을 분석하는 표준 절차.

**대상**: VariantMerger / NodeMatcher / match-engine 신호 변경 작업.

## 도구 개요

| 도구 | 명령 | 역할 |
|------|------|------|
| audit | `npm run audit` | 회귀 게이트 (회귀 증가 시 fail) |
| auditDiff | `npm run audit:diff` | 변경 전후 회귀 변화 상세 출력 |
| anomalyScan | `npm run audit:anomaly` | 회귀로는 안 잡히는 의심 매칭 탐지 |
| matchTrace | `TRACE_FIXTURE=... TRACE_A=... TRACE_B=... npm run audit:trace` | 특정 pair 신호별 결정 출력 |

baseline 갱신:
- `npm run audit:write` — audit baseline
- `npm run audit:anomaly:write` — anomaly baseline
- `UPDATE_BASELINE=1 npm run audit:diff` — auditDiff 경유 갱신

## 표준 워크플로우

### 1. 변경 전 — baseline 확인

```bash
npm run audit         # 현재 1856건 (예시)
npm run audit:anomaly # 현재 119건 (예시)
```

두 baseline이 모두 존재하고 PASS인지 확인.

### 2. 엔진 변경 후 — 변화 측정

```bash
npm run audit:diff
```

출력 예시:
```
=== Audit Diff ===
Total: 1856 → 1834 (-22)
Patterns:
  same-name-same-type: -2
  variant-prop-position: -15

New regressions (0):

Resolved regressions (22):
  - failing/Switch  74:157 ↔ 74:153  [variant-prop-position]
  ...
```

```bash
npm run audit:anomaly
```

출력 예시:
```
=== Anomaly Scan ===
Total: 95
  cross-name: 95

=== Anomaly Diff ===
Total: 119 → 95 (-24)
New (0):
Resolved (24):
  - failing/Buttonsolid  Wrapper (FRAME) 16215:37749
  ...
```

### 3. 새 회귀가 있을 경우 — 원인 추적

새 회귀의 fixture/노드 ID를 audit:diff 출력에서 확인 후:

```bash
TRACE_FIXTURE=<fixture> TRACE_A=<nodeIdA> TRACE_B=<nodeIdB> npm run audit:trace
```

출력 예시:
```
=== Match Trace: failing/Buttonsolid ===
Pair: 16215:37749 (Wrapper, FRAME) ↔ 16215:37612 (Interaction, FRAME)

Signal              | Decision           | Cost  | Reason
--------------------|--------------------|-------|----------------------------
TypeCompatibility   | match              | 0.00  | both FRAME
IdMatch             | neutral            | -     | different IDs
NormalizedPosition  | match-with-cost    | 0.07  | pos cost 0.067
ChildrenShape       | match-with-cost    | 0.83  | child count 3 vs 1
--------------------|--------------------|-------|----------------------------
TOTAL               | veto               | Inf   | (totalCost > threshold)
```

이 출력으로 어느 신호가 어떤 결정을 내렸는지 확인 → 가중치/threshold 조정.

### 4. 결정

| 상황 | 조치 |
|------|------|
| 회귀 0 + 의도된 anomaly 변화 | baseline 갱신 후 머지 |
| 새 회귀 발생 | trace로 분석 → (a) 공식 조정 / (b) 회귀 수용 / (c) 롤백 |
| anomaly 새로 등장 | 새 detector 추가 또는 기존 detector 정확도 개선 |

## Detector 추가하기

새 anomaly 패턴을 발견하면 `test/audits/detectors/`에 클래스 추가:

```typescript
// test/audits/detectors/MyDetector.ts
import type { AnomalyDetector, Anomaly, AnomalyContext } from "./types";
import type { InternalNode } from "@code-generator2/types/types";

export class MyDetector implements AnomalyDetector {
  readonly name = "my-anomaly";

  detect(node: InternalNode, depth: number, ctx: AnomalyContext) {
    // null 반환 = 이상 없음
    // Anomaly 객체 반환 = 이상 발견
    return null;
  }
}
```

그리고 `test/audits/anomalyScan.ts`의 `defaultDetectors()`에 등록.

## 자주 묻는 것

**Q. baseline은 언제 갱신해야 하나?**
A. 회귀가 의도적으로 줄거나 의도된 변화일 때만. 새 회귀를 baseline에 흡수하는 갱신은 금지.

**Q. anomaly는 모두 버그인가?**
A. 아니다. anomaly는 "회귀로는 안 잡히지만 의심스러운 매칭". legitimate rename / component swap도 잡힘. 새 anomaly가 등장했을 때만 분석하면 됨.

**Q. matchTrace가 가짜 nodeToVariantRoot 매핑을 쓰는데 정확한가?**
A. 정확하다. trace는 NodeMatcher의 단일 호출을 시뮬레이션하므로 fixture document에서 variant root를 한 번만 매핑하면 충분.
```

- [ ] **Step 2: 문서 미리보기 — 마크다운 렌더링 확인**

Run: `cat docs/guide/8-workflow/regression-analysis.md | head -60`
Expected: 헤더와 표가 정상 표시.

- [ ] **Step 3: 커밋**

```bash
git add docs/guide/8-workflow/regression-analysis.md
git commit -m "$(cat <<'EOF'
docs(guide): Variant Merger 엔진 회귀 분석 워크플로우 가이드

엔진 변경 시 audit / auditDiff / anomalyScan / matchTrace를
어떤 순서로 사용하는지 한 페이지로 정리. 새 detector 추가
방법 포함.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 완료 검증

모든 task 완료 후:

- [ ] **`npm run audit`** — PASS (회귀 증가 없음)
- [ ] **`npm run audit:diff`** — PASS, 의미 있는 텍스트 출력
- [ ] **`npm run audit:anomaly`** — PASS, baseline 일치 (Total: 119)
- [ ] **`TRACE_FIXTURE=failing/Buttonsolid TRACE_A=16215:37749 TRACE_B=16215:37612 npm run audit:trace`** — PASS, 신호 표 출력
- [ ] **`npm run test`** — 전체 PASS
- [ ] **삭제된 임시 파일**: `test/tree-builder/`에 `cross-name-merge-*`, `buttonsolid-raw-*`, `buttonsolid-interactions.json`이 더 이상 없음

다음 작업:
- **Spec: ChildrenShape signal 추가** — 본 도구를 사용하여 안전하게 신호 도입.
