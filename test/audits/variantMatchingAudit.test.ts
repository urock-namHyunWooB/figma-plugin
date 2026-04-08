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
  compileErrors: number;
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
      const tree = tb.buildInternalTreeDebug(doc);
      pairs = detectDisjointVariants(tree);
    } catch (err) {
      // Audit은 컴파일 실패 fixture도 기록 (회귀 카운트 0)
      byFixture.push({
        ...makeEmptyReport(name),
        fixture: `${name} (COMPILE_ERROR: ${(err as Error).message.slice(0, 80)})`,
      });
      compileErrors++;
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
    compileErrors,
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
        `Compile errors: ${report.compileErrors}`,
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
      // 컴파일 에러가 증가하지 않았는지 검증 — 회귀가 개선처럼 보이는 걸 방지
      expect(report.compileErrors).toBeLessThanOrEqual(
        baseline.compileErrors ?? 0
      );
    },
    120_000
  );
});
