import { AuditReport } from "./runAudit";
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
