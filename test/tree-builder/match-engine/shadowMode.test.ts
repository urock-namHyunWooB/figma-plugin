import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";

const fixtureLoaders = import.meta.glob("../../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const entries = Object.entries(fixtureLoaders)
  .map(([p, loader]) => ({
    name: p.replace("../../fixtures/", "").replace(".json", ""),
    loader,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Shadow-mode verification:
 * For each fixture, collect all pairs passed to isSameNode during VariantMerger
 * (via a global __SHADOW_MODE_COLLECTOR__ hook) and verify engine.decide returns
 * the same match/no-match decision as the legacy NodeMatcher.isSameNodeLegacy.
 *
 * Phase 1a invariant: zero disagreements across all 84 fixtures.
 * Phase 1b will intentionally relax the expectation (size-variant-reject fixes).
 */
describe("Shadow mode: NodeMatcher ↔ MatchDecisionEngine agreement (Phase 1a)", () => {
  for (const { name, loader } of entries) {
    it(`${name}: zero drift`, async () => {
      const mod = await loader();
      const data = mod.default as any;
      const doc = data?.info?.document;
      if (!doc) {
        expect(data).toBeDefined();
        return;
      }

      const disagreements: Array<{ pair: [string, string]; old: boolean; engine: boolean }> = [];
      (globalThis as any).__SHADOW_MODE_COLLECTOR__ = disagreements;

      try {
        const dm = new DataManager(data);
        const tb = new TreeBuilder(dm);
        tb.buildInternalTreeDebug(doc);
      } finally {
        delete (globalThis as any).__SHADOW_MODE_COLLECTOR__;
      }

      if (disagreements.length > 0) {
        const sample = disagreements
          .slice(0, 5)
          .map((d) => `  ${d.pair[0]} ↔ ${d.pair[1]}: legacy=${d.old} engine=${d.engine}`)
          .join("\n");
        expect.fail(`${disagreements.length} disagreements in ${name}:\n${sample}`);
      }
    }, 30_000);
  }
});
