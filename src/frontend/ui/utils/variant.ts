import { StyleTree, DiffTree } from "../domain/transpiler/types/figma-api";
import type { BaseStyleProperties } from "@backend/types/styles";
import { VariantStyleMap } from "../domain/transpiler/types/variant";

export default class VariantUtils {
  /**
   * @param obj
   * @returns
   */
  public static extractVariantPatterns(
    obj: Record<string, StyleTree>,
    baseVariants: Record<string, unknown>
  ): VariantStyleMap {
    const variantTypes = this.extractVariantTypes(obj);

    const componentHash = new Map<string, StyleTree>();

    Object.keys(obj).forEach((key) => {
      componentHash.set(key.replace(/,\s+/g, ","), obj[key]);
    });

    const result = this._baseUtil(componentHash, baseVariants, variantTypes);

    return result;
  }

  /**
   * obj에서 variant 타입 정보만 추출
   * 반환: [{ Size: ["Large", "Medium", "Small"] }, { State: ["Enabled", "Disabled"] }]
   */
  private static extractVariantTypes(obj: Record<string, StyleTree>): {
    [x: string]: string[];
  }[] {
    const p: Record<string, Record<string, boolean>> = {};

    for (const [key] of Object.entries(obj)) {
      const nameSplit = key.split(", ");
      nameSplit.forEach((name) => {
        const [variantKey, variantValue] = name.split("=");
        if (!p[variantKey]) {
          p[variantKey] = {};
        }
        p[variantKey][variantValue] = true;
      });
    }

    return Array.from(Object.entries(p)).map(([key, value]) => {
      const values = Object.keys(value);
      return { [key]: values };
    });
  }

  /**
   * 두 StyleTree를 비교하여 차이(delta)만 추출
   * baseTree와 variantTree의 차이만 반환
   * 두 트리 노드 구조는 같다고 가정한다.
   */
  private static diffStyleTree(
    baseTree: StyleTree | null,
    variantTree: StyleTree | null
  ): DiffTree | null {
    if (!baseTree || !variantTree) {
      return null;
    }

    // CSS 스타일 차이 계산 - variant에만 있거나 다른 값을 가진 속성들만 추출
    const diffCssStyle: Record<string, string> = {};

    for (const [key, value] of Object.entries(variantTree.cssStyle)) {
      if (baseTree.cssStyle[key] !== value) {
        diffCssStyle[key] = value;
      }
    }

    // 재귀적으로 children도 diff
    const diffChildren: DiffTree[] = [];
    for (
      let i = 0;
      i < Math.max(baseTree.children.length, variantTree.children.length);
      i++
    ) {
      const childDiff = this.diffStyleTree(
        baseTree.children[i] || null,
        variantTree.children[i] || null
      );
      if (childDiff) {
        diffChildren.push(childDiff);
      }
    }

    return {
      id: variantTree.id,
      cssStyle: diffCssStyle,
      figmaStyle: variantTree.figmaStyle,
      children: diffChildren,
      _diff: { status: "MODIFIED" },
    };
  }

  /**
   * 두 StyleTree의 노드 구조가 동일한지 체크
   */
  private static hasSameStructure(tree1: StyleTree, tree2: StyleTree): boolean {
    // children 개수가 다르면 구조가 다름
    if (tree1.children.length !== tree2.children.length) {
      return false;
    }

    // 재귀적으로 모든 children의 구조도 비교
    for (let i = 0; i < tree1.children.length; i++) {
      if (!this.hasSameStructure(tree1.children[i], tree2.children[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 컴포넌트 이름에서 variant 속성들을 파싱
   * 예: "Size=Large, State=Disabled" -> { Size: "Large", State: "Disabled" }
   */
  private static parseVariantString(str: string): Record<string, string> {
    const result: Record<string, string> = {};
    str.split(",").forEach((pair) => {
      const [rawKey, rawValue] = pair.split("=");
      if (!rawKey || !rawValue) return;
      const key = rawKey.trim();
      const value = rawValue.trim();
      result[key] = value;
    });
    return result;
  }

  /**
   * variant 속성들을 문자열로 변환
   * 예: { Size: "Large", State: "Disabled" } -> "Size=Large,State=Disabled"
   */
  private static buildVariantString(variants: Record<string, string>): string {
    return Object.entries(variants)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");
  }

  private static _baseUtil(
    componentHash: Map<string, StyleTree>,
    baseVariants: Record<string, unknown>,
    variantTypes: {
      [x: string]: string[];
    }[]
  ): VariantStyleMap {
    const result: Record<string, Record<string, DiffTree | null> | "SLOT"> = {};

    for (const variantTypeObj of variantTypes) {
      const variantTypeName = Object.keys(variantTypeObj)[0];
      const variantValues = variantTypeObj[variantTypeName];

      result[variantTypeName] = {};
      let foundValidDiff = false;

      // 1. 해당 variant type을 제외한 나머지 조합으로 그룹화
      const groups = new Map<string, Map<string, StyleTree>>();

      componentHash.forEach((styleTree, key) => {
        const parsed = this.parseVariantString(key);
        const currentVariantValue = parsed[variantTypeName];
        delete parsed[variantTypeName]; // 현재 처리 중인 variant 제거

        const groupKey = this.buildVariantString(parsed); // 나머지 조합

        if (!groups.has(groupKey)) {
          groups.set(groupKey, new Map());
        }
        groups.get(groupKey)!.set(currentVariantValue, styleTree);
      });

      // 2. 각 그룹에서 비교 가능한 조합 찾기
      groups.forEach((variantMap) => {
        // 이 그룹에 모든 variant 값이 존재하는지 체크
        const hasAllValues = variantValues.every((value) =>
          variantMap.has(value)
        );

        if (!hasAllValues) {
          // 이 그룹은 불완전하므로 skip
          return;
        }

        // 첫 번째 variant 값을 base로 사용
        const baseValue = variantValues[0];
        const baseComponent = variantMap.get(baseValue)!;

        // 나머지 variant 값들과 비교
        for (let i = 1; i < variantValues.length; i++) {
          const variantValue = variantValues[i];
          const comparisonComponent = variantMap.get(variantValue)!;

          // 구조 체크
          if (!this.hasSameStructure(baseComponent, comparisonComponent)) {
            result[variantTypeName] = "SLOT";
            foundValidDiff = true;
            return; // 구조가 다르면 SLOT 처리하고 종료
          }

          // 같은 이름이면 기본값으로 표시
          if (
            baseComponent?.figmaStyle?.name ===
            comparisonComponent?.figmaStyle?.name
          ) {
            (result[variantTypeName] as Record<string, DiffTree | null>)[
              variantValue
            ] = {
              ...baseComponent,
              _diff: { status: "IS_DEFAULT" },
            } as DiffTree;
            foundValidDiff = true;
            continue;
          }

          // diff 계산
          const diff = this.diffStyleTree(baseComponent, comparisonComponent);
          if (diff) {
            (result[variantTypeName] as Record<string, DiffTree>)[
              variantValue
            ] = diff;
            foundValidDiff = true;
          }
        }

        // base 값도 결과에 추가 (차이 없음)
        if (foundValidDiff && result[variantTypeName] !== "SLOT") {
          if (
            !(result[variantTypeName] as Record<string, DiffTree>)[baseValue]
          ) {
            (result[variantTypeName] as Record<string, DiffTree>)[baseValue] = {
              ...baseComponent,
              cssStyle: {}, // base는 차이 없음
              _diff: { status: "UNCHANGED" },
            } as DiffTree;
          }
        }
      });

      // 3. 비교 가능한 조합이 하나도 없으면 경고
      if (!foundValidDiff) {
        console.warn(
          `[VariantUtils] Incomplete ComponentSet: "${variantTypeName}" - no valid comparison pairs found. All groups are missing some variant values.`
        );
        // 결과에서 제외
        delete result[variantTypeName];
      } else if (result[variantTypeName] === "SLOT") {
        console.info(
          `[VariantUtils] "${variantTypeName}" has structural differences - marked as SLOT for conditional rendering.`
        );
      }
    }

    return result;
  }
}
