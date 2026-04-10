import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import { VariantMerger } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger";
import { LayoutNormalizer } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/LayoutNormalizer";
import { NodeMatcher } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/NodeMatcher";
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
  // getPositionCost는 호출당 정확히 1개 entry를 push하므로 마지막 entry만 사용.
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
    const reason = sr.result.reason ?? "";
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

      // 병합 후 두 ID가 같은 InternalNode로 수렴할 수 있음 (e.g. Wrapper↔Interaction).
      // 이 경우 (node, node) 쌍에 대해 IdMatch가 즉시 accept → trace가 예상과 다르게
      // 보일 수 있지만, 이는 post-merge 상태를 보여주는 의도된 동작.

      const log: SignalLogEntry[] = [];
      const layoutNormalizer = new LayoutNormalizer(dm);
      const matcher = new NodeMatcher(dm, nodeToVariantRoot, layoutNormalizer);

      (globalThis as any).__MATCH_REASON_LOG__ = log;
      try {
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
    30_000
  );
});
