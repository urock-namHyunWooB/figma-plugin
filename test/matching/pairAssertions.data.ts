import type { PairAssertion } from "./pairAssertions";

/**
 * Phase 0: empty — populated during Phase 1~2 as specific matching cases
 * are debugged. Each entry represents a "should be the same node" or
 * "should NOT be the same node" claim verified by the engine.
 *
 * Format example (add during Phase 1):
 *   {
 *     fixture: "failing/Switch",
 *     description: "Switch Knob — Off/On variants are the same node",
 *     nodeIdA: "<id in State=Off variant>",
 *     nodeIdB: "<id in State=On variant>",
 *     kind: "must-match",
 *   }
 */
export const pairAssertions: PairAssertion[] = [];
