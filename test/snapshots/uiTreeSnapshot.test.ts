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

describe("UITree snapshots", () => {
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
      let tree;
      try {
        tree = tb.build(doc);
      } catch (err) {
        // 일부 fixture는 full pipeline 통과 못 할 수 있음 — 그 상태 자체를 스냅샷
        expect(`BUILD_ERROR: ${(err as Error).message}`).toMatchSnapshot();
        return;
      }
      // UITree는 { root: UINode, props, ... } 래퍼이므로 root를 직렬화한다.
      // (serializeTree는 노드 단위 재귀 함수)
      expect(serializeTree(tree.root as any)).toMatchSnapshot();
    });
  }
});
