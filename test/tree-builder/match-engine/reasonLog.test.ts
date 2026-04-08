import { describe, it, expect, beforeEach, afterEach } from "vitest";
import DataManager from "@code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import switchFixture from "../../fixtures/failing/Switch.json";

describe("Match decision reason log", () => {
  beforeEach(() => {
    (globalThis as any).__MATCH_REASON_LOG__ = [];
  });

  afterEach(() => {
    delete (globalThis as any).__MATCH_REASON_LOG__;
  });

  it("captures entries for every matching decision when enabled", () => {
    const dm = new DataManager(switchFixture as any);
    const tb = new TreeBuilder(dm);
    tb.buildInternalTreeDebug((switchFixture as any).info.document);

    const log = (globalThis as any).__MATCH_REASON_LOG__ as Array<any>;
    expect(log).toBeDefined();
    expect(log.length).toBeGreaterThan(0);
    for (const entry of log) {
      expect(entry).toHaveProperty("pair");
      expect(entry).toHaveProperty("decision");
      expect(entry).toHaveProperty("totalCost");
    }
  });

  it("does not collect when log is not set up", () => {
    delete (globalThis as any).__MATCH_REASON_LOG__;
    const dm = new DataManager(switchFixture as any);
    const tb = new TreeBuilder(dm);
    tb.buildInternalTreeDebug((switchFixture as any).info.document);
    expect((globalThis as any).__MATCH_REASON_LOG__).toBeUndefined();
  });
});
