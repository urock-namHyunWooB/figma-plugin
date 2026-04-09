import { describe, it, expect } from "vitest";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { runAudit, AuditReport } from "./runAudit";

const BASELINE_PATH = resolve(
  process.cwd(),
  "test/audits/audit-baseline.json"
);

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
        `  size-variant-reject:    ${report.patternTotals["size-variant-reject"]}`,
        `  variant-prop-position:  ${report.patternTotals["variant-prop-position"]}`,
        `  same-name-same-type:    ${report.patternTotals["same-name-same-type"]}  (강한 회귀)`,
        `  same-name-cross-type:   ${report.patternTotals["same-name-cross-type"]}  (refactor 후보)`,
        `  different-type:         ${report.patternTotals["different-type"]}  (likely distinct)`,
        `  different-name:         ${report.patternTotals["different-name"]}  (likely distinct)`,
        `  unknown:                ${report.patternTotals.unknown}`,
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
