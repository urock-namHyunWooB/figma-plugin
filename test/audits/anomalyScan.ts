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
