import { describe, it, expect } from "vitest";
import { ConditionRenderer } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/generators/ConditionRenderer";

describe("ConditionRenderer.toJs", () => {
  it("eq with string value", () => {
    expect(ConditionRenderer.toJs({ type: "eq", prop: "size", value: "lg" }))
      .toBe('size === "lg"');
  });

  it("eq with boolean value", () => {
    expect(ConditionRenderer.toJs({ type: "eq", prop: "checked", value: true }))
      .toBe("checked === true");
  });

  it("eq with number value", () => {
    expect(ConditionRenderer.toJs({ type: "eq", prop: "count", value: 3 }))
      .toBe("count === 3");
  });

  it("neq", () => {
    expect(ConditionRenderer.toJs({ type: "neq", prop: "size", value: "lg" }))
      .toBe('size !== "lg"');
  });

  it("truthy", () => {
    expect(ConditionRenderer.toJs({ type: "truthy", prop: "leftIcon" }))
      .toBe("leftIcon");
  });

  it("not", () => {
    // existing conditionToCode: !expr (no outer parens on not itself)
    expect(ConditionRenderer.toJs({ type: "not", condition: { type: "truthy", prop: "x" } }))
      .toBe("!x");
  });

  it("and", () => {
    // existing conditionToCode: (a && b) — outer parens wrapping the whole expression
    expect(ConditionRenderer.toJs({
      type: "and",
      conditions: [
        { type: "truthy", prop: "a" },
        { type: "eq", prop: "b", value: "1" },
      ],
    })).toBe('(a && b === "1")');
  });

  it("or", () => {
    // existing conditionToCode: (a || b) — outer parens wrapping the whole expression
    expect(ConditionRenderer.toJs({
      type: "or",
      conditions: [
        { type: "truthy", prop: "a" },
        { type: "truthy", prop: "b" },
      ],
    })).toBe("(a || b)");
  });

  it("nested: not wrapping and", () => {
    // not around an and: !(a && b)  — the parens come from the and node
    expect(ConditionRenderer.toJs({
      type: "not",
      condition: {
        type: "and",
        conditions: [
          { type: "truthy", prop: "disabled" },
          { type: "eq", prop: "state", value: "Hover" },
        ],
      },
    })).toBe('!(disabled && state === "Hover")');
  });

  it("nested: and with not branch", () => {
    // not-inside-and: !(x) is just !x
    expect(ConditionRenderer.toJs({
      type: "and",
      conditions: [
        { type: "not", condition: { type: "truthy", prop: "disabled" } },
        { type: "eq", prop: "state", value: "Hover" },
      ],
    })).toBe('(!disabled && state === "Hover")');
  });

  it("resolveProp: applies provided prop resolver", () => {
    // With a rename map supplied, prop names should be resolved
    const renameMap = new Map([["State", "state"]]);
    const resolveProp = (p: string) => renameMap.get(p) ?? p;
    expect(
      ConditionRenderer.toJs({ type: "eq", prop: "State", value: "Hover" }, resolveProp)
    ).toBe('state === "Hover"');
  });
});
