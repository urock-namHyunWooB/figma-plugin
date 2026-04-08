import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { findMergedNodeByOriginalId } from "./pairAssertions";
import { pairAssertions } from "./pairAssertions.data";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

function getLoader(
  fixturePath: string
): (() => Promise<{ default: unknown }>) | null {
  const key = `../fixtures/${fixturePath}.json`;
  return fixtureLoaders[key] ?? null;
}

describe("Pair assertions", () => {
  if (pairAssertions.length === 0) {
    it("(no assertions defined yet — Phase 0 infrastructure only)", () => {
      expect(pairAssertions).toEqual([]);
    });
    return;
  }

  for (const a of pairAssertions) {
    it(`${a.fixture}: ${a.description}`, async () => {
      const loader = getLoader(a.fixture);
      expect(loader, `Fixture not found: ${a.fixture}`).not.toBeNull();
      const mod = await loader!();
      const data = mod.default as any;
      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      const tree = tb.buildInternalTreeDebug(data.info.document);

      const mergedA = findMergedNodeByOriginalId(tree as any, a.nodeIdA);
      const mergedB = findMergedNodeByOriginalId(tree as any, a.nodeIdB);
      expect(mergedA, `nodeIdA not found: ${a.nodeIdA}`).not.toBeNull();
      expect(mergedB, `nodeIdB not found: ${a.nodeIdB}`).not.toBeNull();

      if (a.kind === "must-match") {
        expect(
          mergedA!.id,
          `Expected ${a.nodeIdA} and ${a.nodeIdB} to merge into the same node`
        ).toBe(mergedB!.id);
      } else {
        expect(
          mergedA!.id,
          `Expected ${a.nodeIdA} and ${a.nodeIdB} to remain as different nodes`
        ).not.toBe(mergedB!.id);
      }
    });
  }
});
