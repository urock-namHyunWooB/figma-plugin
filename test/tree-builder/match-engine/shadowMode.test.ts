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
 *
 * Phase 1a invariant (original): zero disagreements across all 84 fixtures.
 * Phase 1b (now): RelativeSize was relaxed 1.3 → 2.0, so engine may now ACCEPT
 * pairs that legacy rejected (the intended 45 size-variant-reject fixes).
 *
 * The new invariant: all disagreements must be in the SAFE direction only —
 *   legacy=false, engine=true (new matches accepted due to relaxed size ratio).
 *
 * The UNSAFE direction would be:
 *   legacy=true, engine=false (engine wrongly rejects a pair legacy accepted)
 *
 * Any unsafe-direction disagreement is a Phase 1a regression and must fail CI.
 */
describe("Shadow mode: Phase 1b direction-constrained drift", () => {
  for (const { name, loader } of entries) {
    it(`${name}: no unsafe-direction drift`, async () => {
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

      const unsafe = disagreements.filter((d) => d.old === true && d.engine === false);
      if (unsafe.length > 0) {
        const sample = unsafe
          .slice(0, 5)
          .map((d) => `  ${d.pair[0]} ↔ ${d.pair[1]}: legacy=true, engine=false`)
          .join("\n");
        expect.fail(
          `${unsafe.length} unsafe-direction disagreements in ${name} (engine rejects what legacy accepts):\n${sample}`,
        );
      }
    }, 30_000);
  }
});
