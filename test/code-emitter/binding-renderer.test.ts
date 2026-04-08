import { describe, it, expect } from "vitest";
import { BindingRenderer } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/BindingRenderer";

describe("BindingRenderer.toExpression", () => {
  it("renders prop binding as the variable name", () => {
    expect(BindingRenderer.toExpression({ prop: "size" })).toBe("size");
  });

  it("renders ref binding as the literal reference", () => {
    expect(BindingRenderer.toExpression({ ref: "Constants.MAX" })).toBe("Constants.MAX");
  });

  it("renders expr binding as the raw expression", () => {
    expect(BindingRenderer.toExpression({ expr: "checked && !disabled" }))
      .toBe("checked && !disabled");
  });
});
