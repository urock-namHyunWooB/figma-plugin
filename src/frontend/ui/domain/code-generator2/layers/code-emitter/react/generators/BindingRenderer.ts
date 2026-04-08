/**
 * BindingRenderer
 *
 * Renders a BindingSource into a JS expression string, suitable for embedding
 * in JSX attribute values, ternary operands, etc.
 *
 * Pure function. No state, no side effects.
 */

import type { BindingSource } from "../../../../types/types";

export class BindingRenderer {
  static toExpression(source: BindingSource): string {
    if ("prop" in source) return source.prop;
    if ("ref" in source) return source.ref;
    if ("expr" in source) return source.expr;
    // Exhaustiveness guard
    const _exhaustive: never = source;
    throw new Error(`Unknown BindingSource: ${JSON.stringify(_exhaustive)}`);
  }
}
