// test/audits/hungarianObserver.test.ts

import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import { VariantMerger } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger";
import { createObserverCollector } from "./hungarianObserver/ObserverCollector";
import { formatText } from "./hungarianObserver/formatText";
import fs from "fs";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

describe("Hungarian Observer", () => {
  it(
    "observes merge decisions for a fixture",
    async () => {
      const fixture = process.env.OBSERVE_FIXTURE;
      const _nodeFilter = process.env.OBSERVE_NODE;
      const format = process.env.OBSERVE_FORMAT ?? "text";
      const outPath = process.env.OBSERVE_OUT;

      if (!fixture) {
        process.stdout.write(
          "\nUsage: OBSERVE_FIXTURE=<fixture> npm run audit:observe\n"
        );
        process.stdout.write(
          "Example: OBSERVE_FIXTURE=any/Controlcheckbox npm run audit:observe\n"
        );
        process.stdout.write(
          "Options:\n"
        );
        process.stdout.write(
          "  OBSERVE_NODE=<nodeId>    Filter to merges involving this node\n"
        );
        process.stdout.write(
          "  OBSERVE_FORMAT=text|json Output format (default: text)\n"
        );
        process.stdout.write(
          "  OBSERVE_OUT=<path>       Write to file instead of stdout\n"
        );
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

      // Observer 설정
      const collector = createObserverCollector(fixture);
      (globalThis as any).__HUNGARIAN_OBSERVER__ = collector;

      try {
        const dm = new DataManager(data);
        const merger = new VariantMerger(dm);
        merger.merge(doc);
      } finally {
        delete (globalThis as any).__HUNGARIAN_OBSERVER__;
      }

      const result = collector.toResult();

      // 출력
      let output: string;
      if (format === "json") {
        output = JSON.stringify(result, null, 2);
      } else {
        output = formatText(result);
      }

      if (outPath) {
        fs.writeFileSync(outPath, output, "utf-8");
        process.stdout.write(`\nOutput written to ${outPath}\n`);
      } else {
        process.stdout.write("\n" + output + "\n");
      }

      // 최소 검증: merge가 하나 이상 수집됐는지
      expect(result.merges.length).toBeGreaterThan(0);
      expect(result.variantCount).toBeGreaterThan(0);
    },
    60_000,
  );
});
