/**
 * ConditionRenderer
 *
 * Renders a ConditionNode into a JS condition string. Pure function.
 *
 * Output format matches the existing JsxGenerator.conditionToCode:
 *   - eq/neq: `prop === value` / `prop !== value`  (JSON.stringify for literals)
 *   - truthy: `prop`
 *   - not:    `!<inner>`  (no extra parens on not itself)
 *   - and:    `(<a> && <b> && ...)` (one outer paren pair around the whole expression)
 *   - or:     `(<a> || <b> || ...)` (one outer paren pair around the whole expression)
 *
 * The optional `resolveProp` parameter allows callers (e.g. JsxGenerator) to
 * apply a rename map / camelCase transform on prop names. Defaults to identity.
 */

import type { ConditionNode } from "../../../../types/types";

export class ConditionRenderer {
  static toJs(
    node: ConditionNode,
    resolveProp: (prop: string) => string = (p) => p
  ): string {
    switch (node.type) {
      case "eq":
        return `${resolveProp(node.prop)} === ${JSON.stringify(node.value)}`;

      case "neq":
        return `${resolveProp(node.prop)} !== ${JSON.stringify(node.value)}`;

      case "truthy":
        return resolveProp(node.prop);

      case "not":
        return `!${this.toJs(node.condition, resolveProp)}`;

      case "and":
        return `(${node.conditions.map((c) => this.toJs(c, resolveProp)).join(" && ")})`;

      case "or":
        return `(${node.conditions.map((c) => this.toJs(c, resolveProp)).join(" || ")})`;

      default: {
        const _exhaustive: never = node;
        throw new Error(`Unknown ConditionNode: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
}
