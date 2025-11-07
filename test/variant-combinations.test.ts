import { describe, test, expect } from "vitest";
import {
  extractVariantProps,
  generateRepresentativeCombinations,
  generateGridCombinations,
  generateAllCombinations,
} from "../src/ui/utils/variantCombinations";

/**
 * Variant 조합 생성 유틸리티 테스트
 */
describe("variantCombinations 유틸리티", () => {
  const sampleProps = [
    {
      name: "size",
      type: "string",
      defaultValue: "M",
      variantOptions: ["S", "M", "L"],
      readonly: true,
    },
    {
      name: "type",
      type: "string",
      defaultValue: "filled",
      variantOptions: ["filled", "outlined", "text"],
      readonly: true,
    },
    {
      name: "disabled",
      type: "boolean",
      defaultValue: false,
    },
  ];

  describe("extractVariantProps", () => {
    test("variantOptions가 있는 props만 추출", () => {
      const result = extractVariantProps(sampleProps);
      expect(result.length).toBe(2);
      expect(result[0].name).toBe("size");
      expect(result[1].name).toBe("type");
    });

    test("variantOptions가 없으면 빈 배열 반환", () => {
      const result = extractVariantProps([
        { name: "text", type: "string", defaultValue: "" },
      ]);
      expect(result.length).toBe(0);
    });
  });

  describe("generateRepresentativeCombinations", () => {
    test("기본 조합 + 각 variant의 대표 옵션 생성", () => {
      const result = generateRepresentativeCombinations(sampleProps);

      // Default + size 2개(S, L) + type 2개(outlined, text) = 5개
      expect(result.length).toBeGreaterThan(0);

      // 첫 번째는 기본 조합
      expect(result[0].label).toBe("Default");
      expect(result[0].props.size).toBe("M");
      expect(result[0].props.type).toBe("filled");
    });

    test("variant가 없으면 기본 조합만 반환", () => {
      const result = generateRepresentativeCombinations([
        { name: "text", type: "string", defaultValue: "Hello" },
      ]);

      expect(result.length).toBe(1);
      expect(result[0].label).toBe("Default");
    });
  });

  describe("generateGridCombinations", () => {
    test("2개 이상의 variant가 있으면 2차원 그리드 생성", () => {
      const result = generateGridCombinations(sampleProps);

      expect(result).not.toBeNull();
      expect(result!.rowVariant.name).toBe("size");
      expect(result!.colVariant.name).toBe("type");
      expect(result!.combinations.length).toBe(3); // size 3개
      expect(result!.combinations[0].length).toBe(3); // type 3개
    });

    test("variant가 2개 미만이면 null 반환", () => {
      const result = generateGridCombinations([
        {
          name: "size",
          type: "string",
          defaultValue: "M",
          variantOptions: ["S", "M", "L"],
        },
      ]);

      expect(result).toBeNull();
    });
  });

  describe("generateAllCombinations", () => {
    test("모든 가능한 조합 생성", () => {
      const result = generateAllCombinations(sampleProps, 100);

      // size 3개 × type 3개 = 9개 조합
      expect(result.length).toBe(9);
    });

    test("maxCombinations 제한 적용", () => {
      const result = generateAllCombinations(sampleProps, 5);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    test("각 조합이 올바른 props 포함", () => {
      const result = generateAllCombinations(sampleProps, 100);

      // 첫 번째 조합 확인
      expect(result[0].props).toHaveProperty("size");
      expect(result[0].props).toHaveProperty("type");
      expect(result[0].props).toHaveProperty("disabled");

      // 라벨 확인
      expect(result[0].label).toContain("size=");
      expect(result[0].label).toContain("type=");
    });
  });

  describe("복잡한 케이스", () => {
    test("실제 버튼 컴포넌트 케이스", () => {
      const buttonProps = [
        {
          name: "size",
          type: "string",
          defaultValue: "L",
          variantOptions: ["L", "M", "S"],
          readonly: true,
        },
        {
          name: "type",
          type: "string",
          defaultValue: "filled",
          variantOptions: [
            "filled",
            "outlined_black",
            "outlined_blue",
            "text",
            "text-black",
            "outlined_red",
            "filled-red",
          ],
          readonly: true,
        },
        {
          name: "isDisable",
          type: "boolean",
          defaultValue: false,
        },
      ];

      // 대표 조합
      const representative = generateRepresentativeCombinations(buttonProps);
      expect(representative.length).toBeGreaterThan(0);

      // 그리드 조합 (옵션이 더 많은 type이 row, size가 col)
      const grid = generateGridCombinations(buttonProps);
      expect(grid).not.toBeNull();
      expect(grid!.rowVariant.name).toBe("type"); // 7개 옵션
      expect(grid!.colVariant.name).toBe("size"); // 3개 옵션
      expect(grid!.combinations.length).toBe(7); // type 7개 (row)
      expect(grid!.combinations[0].length).toBe(3); // size 3개 (col)

      // 모든 조합 (제한)
      const all = generateAllCombinations(buttonProps, 50);
      expect(all.length).toBeLessThanOrEqual(50);
    });
  });
});

