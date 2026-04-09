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
