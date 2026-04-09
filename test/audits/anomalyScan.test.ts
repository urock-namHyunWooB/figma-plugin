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
import type { Anomaly } from "./detectors/types";

const BASELINE_PATH = resolve(
  process.cwd(),
  "test/audits/baselines/anomaly-baseline.json"
);

describe("anomalyScan helpers", () => {
  it("diffAnomalies detects new and resolved anomalies by composite key", () => {
    const baseline: AnomalyReport = {
      generatedAt: "t0",
      totalFixtures: 1,
      totalAnomalies: 2,
      compileErrors: 0,
      byDetector: { "cross-name": 2 },
      byFixture: [
        {
          fixture: "fx",
          count: 2,
          anomalies: [
            {
              detectorName: "cross-name",
              fixture: "fx",
              nodeId: "n1",
              primaryName: "Wrapper",
              primaryType: "FRAME",
              payload: {},
            },
            {
              detectorName: "cross-name",
              fixture: "fx",
              nodeId: "n2",
              primaryName: "Wrapper",
              primaryType: "FRAME",
              payload: {},
            },
          ],
        },
      ],
    };
    const current: AnomalyReport = {
      ...baseline,
      generatedAt: "t1",
      totalAnomalies: 2,
      byDetector: { "cross-name": 2 },
      byFixture: [
        {
          fixture: "fx",
          count: 2,
          anomalies: [
            // n1 사라짐
            baseline.byFixture[0].anomalies[1], // n2 유지
            {
              detectorName: "cross-name",
              fixture: "fx",
              nodeId: "n3",
              primaryName: "Wrapper",
              primaryType: "FRAME",
              payload: {},
            }, // 새 anomaly
          ],
        },
      ],
    };

    const diff = diffAnomalies(baseline, current);
    expect(diff.newAnomalies).toHaveLength(1);
    expect(diff.newAnomalies[0].nodeId).toBe("n3");
    expect(diff.resolvedAnomalies).toHaveLength(1);
    expect(diff.resolvedAnomalies[0].nodeId).toBe("n1");
    expect(diff.totalDelta).toBe(0);
  });

  it("formatAnomalyDiff produces text output", () => {
    const diff = {
      totalBefore: 5,
      totalAfter: 3,
      totalDelta: -2,
      newAnomalies: [],
      resolvedAnomalies: [
        {
          detectorName: "cross-name",
          fixture: "fx",
          nodeId: "n1",
          primaryName: "Wrapper",
          primaryType: "FRAME",
          payload: {},
        } as Anomaly,
      ],
    };
    const text = formatAnomalyDiff(diff);
    expect(text).toContain("Total: 5 → 3 (-2)");
    expect(text).toContain("Resolved (1)");
    expect(text).toContain("Wrapper (FRAME) n1");
  });
});

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

      // 두 번째 게이트: fixture 개수 변동 감지
      // 빌드 실패가 갑자기 늘면 다 해소된 것처럼 보이는 false positive 차단
      expect(current.totalFixtures).toBe(baseline.totalFixtures);
      expect(current.compileErrors).toBeLessThanOrEqual(baseline.compileErrors);
    },
    180_000
  );
});
