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
