#!/usr/bin/env node
/**
 * audit-baseline.json의 size-variant-reject pairs를 pairAssertions.data.ts로 자동 생성.
 *
 * 사용:
 *   npx tsx scripts/generate-pair-assertions.ts
 *
 * 결과:
 *   test/matching/pairAssertions.data.ts 를 덮어쓰기. size-variant-reject 케이스를
 *   must-match assertion으로 변환.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface AuditReport {
  byFixture: Array<{
    fixture: string;
    pairs: Array<{
      parentId: string;
      a: string;
      b: string;
      variantsA: string[];
      variantsB: string[];
      pattern: "size-variant-reject" | "variant-prop-position" | "unknown";
    }>;
  }>;
}

const ROOT = process.cwd();
const BASELINE = resolve(ROOT, "test/audits/audit-baseline.json");
const OUTPUT = resolve(ROOT, "test/matching/pairAssertions.data.ts");

const baseline = JSON.parse(readFileSync(BASELINE, "utf-8")) as AuditReport;

interface Assertion {
  fixture: string;
  description: string;
  nodeIdA: string;
  nodeIdB: string;
  kind: "must-match" | "must-not-match";
}

const assertions: Assertion[] = [];
for (const fx of baseline.byFixture) {
  // Skip COMPILE_ERROR fixtures
  if (fx.fixture.includes("COMPILE_ERROR")) continue;
  for (const p of fx.pairs) {
    if (p.pattern !== "size-variant-reject") continue;
    // Sort pair ids for deterministic ordering
    const [idA, idB] = [p.a, p.b].sort();
    assertions.push({
      fixture: fx.fixture,
      description: `size-variant-reject: ${idA} ↔ ${idB} under ${p.parentId}`,
      nodeIdA: idA,
      nodeIdB: idB,
      kind: "must-match",
    });
  }
}

// Deterministic sort by fixture, then nodeIdA
assertions.sort((a, b) => {
  if (a.fixture !== b.fixture) return a.fixture.localeCompare(b.fixture);
  return a.nodeIdA.localeCompare(b.nodeIdA);
});

const body = `import type { PairAssertion } from "./pairAssertions";

/**
 * Auto-generated from test/audits/audit-baseline.json
 * by scripts/generate-pair-assertions.ts
 *
 * Contents: all \`size-variant-reject\` pairs identified by Phase 0 audit.
 * These assertions should FAIL in Phase 1a (engine behavior-preserving, still 1.3 ratio)
 * and PASS in Phase 1b (relaxed to 2.0 ratio).
 *
 * Do NOT hand-edit. Re-run \`npx tsx scripts/generate-pair-assertions.ts\` to regenerate.
 */
export const pairAssertions: PairAssertion[] = ${JSON.stringify(assertions, null, 2)};
`;

writeFileSync(OUTPUT, body);
process.stdout.write(`Wrote ${assertions.length} assertions to ${OUTPUT}\n`);
