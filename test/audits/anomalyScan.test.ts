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
