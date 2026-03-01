import { describe, it, expect } from "vitest";
import { DynamicStyleDecomposer } from "../../src/frontend/ui/domain/code-generator2/layers/code-emitter/react/style-strategy/DynamicStyleDecomposer";
import type { ConditionNode } from "../../src/frontend/ui/domain/code-generator2/types/types";

describe("DynamicStyleDecomposer", () => {
  describe("extractAllPropInfos", () => {
    it("eq 조건에서 prop name+value 추출", () => {
      const cond: ConditionNode = { type: "eq", prop: "size", value: "Large" };
      expect(DynamicStyleDecomposer.extractAllPropInfos(cond)).toEqual([
        { propName: "size", propValue: "Large" },
      ]);
    });

    it("truthy 조건에서 propValue='true' 추출", () => {
      const cond: ConditionNode = { type: "truthy", prop: "active" };
      expect(DynamicStyleDecomposer.extractAllPropInfos(cond)).toEqual([
        { propName: "active", propValue: "true" },
      ]);
    });

    it("not(truthy) 조건에서 propValue='false' 추출", () => {
      const cond: ConditionNode = {
        type: "not",
        condition: { type: "truthy", prop: "active" },
      };
      expect(DynamicStyleDecomposer.extractAllPropInfos(cond)).toEqual([
        { propName: "active", propValue: "false" },
      ]);
    });

    it("AND 조건에서 모든 하위 prop 추출 (eq + truthy 혼합)", () => {
      const cond: ConditionNode = {
        type: "and",
        conditions: [
          { type: "eq", prop: "size", value: "M" },
          { type: "truthy", prop: "active" },
        ],
      };
      expect(DynamicStyleDecomposer.extractAllPropInfos(cond)).toEqual([
        { propName: "size", propValue: "M" },
        { propName: "active", propValue: "true" },
      ]);
    });
  });

  describe("extractAllPropNames", () => {
    it("AND(eq, not(truthy))에서 prop 이름만 추출", () => {
      const cond: ConditionNode = {
        type: "and",
        conditions: [
          { type: "eq", prop: "size", value: "L" },
          { type: "not", condition: { type: "truthy", prop: "disabled" } },
        ],
      };
      expect(DynamicStyleDecomposer.extractAllPropNames(cond)).toEqual([
        "size",
        "disabled",
      ]);
    });
  });

  describe("decompose — 단일 prop 조건", () => {
    it("단일 eq 조건은 기존 동작과 동일", () => {
      const dynamic = [
        {
          condition: { type: "eq", prop: "size", value: "Large" } as ConditionNode,
          style: { width: 200, padding: 16 },
        },
        {
          condition: { type: "eq", prop: "size", value: "Small" } as ConditionNode,
          style: { width: 100, padding: 8 },
        },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      expect(result.size).toBe(1);
      expect(result.get("size")?.get("Large")).toEqual({ width: 200, padding: 16 });
      expect(result.get("size")?.get("Small")).toEqual({ width: 100, padding: 8 });
    });

    it("단일 truthy 조건 처리", () => {
      const dynamic = [
        {
          condition: { type: "truthy", prop: "active" } as ConditionNode,
          style: { backgroundColor: "blue" },
        },
        {
          condition: {
            type: "not",
            condition: { type: "truthy", prop: "active" },
          } as ConditionNode,
          style: { backgroundColor: "gray" },
        },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);
      expect(result.size).toBe(1);
      expect(result.get("active")?.get("true")).toEqual({ backgroundColor: "blue" });
      expect(result.get("active")?.get("false")).toEqual({ backgroundColor: "gray" });
    });
  });

  describe("decompose — AND 조건 분해", () => {
    it("AND(size, active): CSS 속성을 제어 prop별로 분리", () => {
      const dynamic = [
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "M" },
              { type: "truthy", prop: "active" },
            ],
          } as ConditionNode,
          style: { backgroundColor: "blue", padding: 8 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "M" },
              { type: "not", condition: { type: "truthy", prop: "active" } },
            ],
          } as ConditionNode,
          style: { backgroundColor: "gray", padding: 8 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "truthy", prop: "active" },
            ],
          } as ConditionNode,
          style: { backgroundColor: "blue", padding: 16 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "not", condition: { type: "truthy", prop: "active" } },
            ],
          } as ConditionNode,
          style: { backgroundColor: "gray", padding: 16 },
        },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);

      // size는 padding만 제어
      expect(result.get("size")?.get("M")).toEqual({ padding: 8 });
      expect(result.get("size")?.get("L")).toEqual({ padding: 16 });

      // active는 backgroundColor만 제어
      expect(result.get("active")?.get("true")).toEqual({ backgroundColor: "blue" });
      expect(result.get("active")?.get("false")).toEqual({ backgroundColor: "gray" });
    });

    it("AND(size, variant): 두 eq prop 간 분리", () => {
      const dynamic = [
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "small" },
              { type: "eq", prop: "variant", value: "primary" },
            ],
          } as ConditionNode,
          style: { padding: 4, backgroundColor: "blue" },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "small" },
              { type: "eq", prop: "variant", value: "secondary" },
            ],
          } as ConditionNode,
          style: { padding: 4, backgroundColor: "gray" },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "large" },
              { type: "eq", prop: "variant", value: "primary" },
            ],
          } as ConditionNode,
          style: { padding: 12, backgroundColor: "blue" },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "large" },
              { type: "eq", prop: "variant", value: "secondary" },
            ],
          } as ConditionNode,
          style: { padding: 12, backgroundColor: "gray" },
        },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);

      expect(result.get("size")?.get("small")).toEqual({ padding: 4 });
      expect(result.get("size")?.get("large")).toEqual({ padding: 12 });
      expect(result.get("variant")?.get("primary")).toEqual({ backgroundColor: "blue" });
      expect(result.get("variant")?.get("secondary")).toEqual({ backgroundColor: "gray" });
    });

    it("3차원 AND(size, variant, icon): 각 CSS 속성이 제어 prop에만 배치", () => {
      const dynamic = [
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "S" },
              { type: "eq", prop: "variant", value: "primary" },
              { type: "truthy", prop: "icon" },
            ],
          } as ConditionNode,
          style: { padding: 4, backgroundColor: "blue", gap: 2 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "S" },
              { type: "eq", prop: "variant", value: "primary" },
              { type: "not", condition: { type: "truthy", prop: "icon" } },
            ],
          } as ConditionNode,
          style: { padding: 4, backgroundColor: "blue", gap: 0 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "eq", prop: "variant", value: "primary" },
              { type: "truthy", prop: "icon" },
            ],
          } as ConditionNode,
          style: { padding: 12, backgroundColor: "blue", gap: 8 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "eq", prop: "variant", value: "primary" },
              { type: "not", condition: { type: "truthy", prop: "icon" } },
            ],
          } as ConditionNode,
          style: { padding: 12, backgroundColor: "blue", gap: 0 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "S" },
              { type: "eq", prop: "variant", value: "danger" },
              { type: "truthy", prop: "icon" },
            ],
          } as ConditionNode,
          style: { padding: 4, backgroundColor: "red", gap: 2 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "S" },
              { type: "eq", prop: "variant", value: "danger" },
              { type: "not", condition: { type: "truthy", prop: "icon" } },
            ],
          } as ConditionNode,
          style: { padding: 4, backgroundColor: "red", gap: 0 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "eq", prop: "variant", value: "danger" },
              { type: "truthy", prop: "icon" },
            ],
          } as ConditionNode,
          style: { padding: 12, backgroundColor: "red", gap: 8 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "eq", prop: "variant", value: "danger" },
              { type: "not", condition: { type: "truthy", prop: "icon" } },
            ],
          } as ConditionNode,
          style: { padding: 12, backgroundColor: "red", gap: 0 },
        },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);

      // padding은 size에 의해 제어
      expect(result.get("size")?.get("S")?.padding).toBe(4);
      expect(result.get("size")?.get("L")?.padding).toBe(12);

      // backgroundColor는 variant에 의해 제어
      expect(result.get("variant")?.get("primary")).toEqual(expect.objectContaining({ backgroundColor: "blue" }));
      expect(result.get("variant")?.get("danger")).toEqual(expect.objectContaining({ backgroundColor: "red" }));

      // gap은 size와 icon 양쪽에 의존 (size별/icon별 모두 불일치)
      // → fallback: 첫 번째 prop(size)에 할당
      expect(result.get("size")?.get("S")?.gap).toBeDefined();
      expect(result.get("size")?.get("L")?.gap).toBeDefined();
    });

    it("단일 prop + AND 혼합 처리", () => {
      const dynamic = [
        // 단일 prop 조건
        {
          condition: { type: "eq", prop: "size", value: "Large" } as ConditionNode,
          style: { fontSize: 18 },
        },
        // AND 조건
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "Large" },
              { type: "truthy", prop: "bold" },
            ],
          } as ConditionNode,
          style: { fontWeight: 700, letterSpacing: 2 },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "Large" },
              { type: "not", condition: { type: "truthy", prop: "bold" } },
            ],
          } as ConditionNode,
          style: { fontWeight: 400, letterSpacing: 0 },
        },
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);

      // fontSize는 단일 prop에서 온 것
      expect(result.get("size")?.get("Large")).toEqual(
        expect.objectContaining({ fontSize: 18 })
      );

      // fontWeight, letterSpacing은 bold에 의해 제어
      expect(result.get("bold")?.get("true")).toEqual({ fontWeight: 700, letterSpacing: 2 });
      expect(result.get("bold")?.get("false")).toEqual({ fontWeight: 400, letterSpacing: 0 });
    });
  });

  describe("decompose — edge cases", () => {
    it("빈 dynamic 배열은 빈 Map 반환", () => {
      const result = DynamicStyleDecomposer.decompose([]);
      expect(result.size).toBe(0);
    });

    it("sparse data: 일부 entry에만 있는 CSS 속성도 올바르게 처리", () => {
      const dynamic = [
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "M" },
              { type: "eq", prop: "variant", value: "primary" },
            ],
          } as ConditionNode,
          style: { padding: 8, borderColor: "blue" },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "L" },
              { type: "eq", prop: "variant", value: "primary" },
            ],
          } as ConditionNode,
          style: { padding: 16, borderColor: "blue" },
        },
        {
          condition: {
            type: "and",
            conditions: [
              { type: "eq", prop: "size", value: "M" },
              { type: "eq", prop: "variant", value: "danger" },
            ],
          } as ConditionNode,
          style: { padding: 8, borderColor: "red" },
        },
        // size=L, variant=danger 엔트리 누락 (sparse)
      ];

      const result = DynamicStyleDecomposer.decompose(dynamic);

      // padding은 size가 제어 (M→8, L→16)
      expect(result.get("size")?.get("M")).toEqual(expect.objectContaining({ padding: 8 }));
      expect(result.get("size")?.get("L")).toEqual(expect.objectContaining({ padding: 16 }));

      // borderColor는 variant가 제어 (primary→blue, danger→red)
      expect(result.get("variant")?.get("primary")).toEqual(
        expect.objectContaining({ borderColor: "blue" })
      );
      expect(result.get("variant")?.get("danger")).toEqual(
        expect.objectContaining({ borderColor: "red" })
      );
    });
  });
});
