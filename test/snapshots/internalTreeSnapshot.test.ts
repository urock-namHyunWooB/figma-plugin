import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import { serializeTree } from "./serializeTree";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

const entries = Object.entries(fixtureLoaders)
  .map(([p, loader]) => ({
    name: p.replace("../fixtures/", "").replace(".json", ""),
    loader,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

describe("InternalTree snapshots", () => {
  for (const { name, loader } of entries) {
    it(`${name}`, async () => {
      const mod = await loader();
      const data = mod.default as any;
      const doc = data?.info?.document;
      if (!doc) {
        expect(data).toBeDefined();
        return;
      }
      const dm = new DataManager(data);
      const tb = new TreeBuilder(dm);
      const tree = tb.buildInternalTreeDebug(doc);
      expect(serializeTree(tree)).toMatchSnapshot();
    });
  }
});
