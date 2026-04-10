import { describe, it, expect } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import { VariantMerger } from "@code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger";
import { pairAssertions } from "./pairAssertions/assertions";
import { checkAssertion } from "./pairAssertions/checker";

const fixtureLoaders = import.meta.glob("../fixtures/**/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

for (const { fixture, pairs } of pairAssertions) {
  describe(`pairAssertions: ${fixture}`, () => {
    for (const assertion of pairs) {
      it(
        `${assertion.nodeA} ${assertion.shouldMatch ? "==" : "!="} ${assertion.nodeB} — ${assertion.description}`,
        async () => {
          const fixturePath = `../fixtures/${fixture}.json`;
          const loader = fixtureLoaders[fixturePath];
          expect(
            loader,
            `fixture not found: ${fixture} (path: ${fixturePath})`
          ).toBeTruthy();

          const mod = (await loader!()) as { default: any };
          const data = mod.default;
          const doc = data?.info?.document;
          expect(doc, `document not found in fixture: ${fixture}`).toBeTruthy();

          const dm = new DataManager(data);
          const merger = new VariantMerger(dm);
          const tree = merger.merge(doc);

          const result = checkAssertion(tree, assertion);

          if (!result.passed) {
            // 상세 실패 메시지 출력
            const label = assertion.shouldMatch ? "MATCH" : "SEPARATE";
            process.stdout.write(
              `\n` +
                `  --- Pair Assertion FAIL ---\n` +
                `  Fixture: ${fixture}\n` +
                `  ${assertion.nodeA} <-> ${assertion.nodeB}\n` +
                `  Expected: shouldMatch=${assertion.shouldMatch} (${label})\n` +
                `  Actual: ${result.detail}\n` +
                `  Description: ${assertion.description}\n`
            );
          }

          expect(result.passed, result.detail).toBe(true);
        },
        30_000
      );
    }
  });
}
