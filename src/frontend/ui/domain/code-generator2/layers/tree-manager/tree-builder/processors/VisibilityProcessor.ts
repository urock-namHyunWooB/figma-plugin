import {
  InternalNode,
  ConditionNode,
  VariantOrigin,
  PropDefinition,
} from "../../../../types/types";

/**
 * VisibilityProcessor
 *
 * InternalNode의 mergedNodes → visibleCondition 생성
 *
 * 조건부 가시성 판단:
 * 1. 자식 노드가 모든 variant에 존재 → visibleCondition 없음
 * 2. 자식 노드가 일부 variant에만 존재 → visibleCondition 생성
 *
 * 예: Icon 노드가 "Icon=true"인 variant에만 존재
 * → visibleCondition: { type: "truthy", prop: "icon" }
 */
export class VisibilityProcessor {
  // sourceKey → PropDefinition 매핑 (exact match)
  private propMap: Map<string, PropDefinition> = new Map();

  /**
   * InternalNode에 가시성 조건 적용 (재귀)
   */
  public applyVisibility(root: InternalNode, props: PropDefinition[]): InternalNode {
    const totalVariants = root.mergedNodes?.length || 0;

    // sourceKey → PropDefinition 매핑 (exact match, normalize 불필요)
    this.propMap = new Map(
      props.map((p) => [p.sourceKey, p])
    );

    return this.applyVisibilityRecursive(root, totalVariants);
  }

  /**
   * 재귀적으로 가시성 조건 적용
   */
  private applyVisibilityRecursive(
    node: InternalNode,
    totalVariants: number
  ): InternalNode {
    // visibleCondition 생성
    const visibleCondition = this.createVisibleCondition(node, totalVariants);

    // children 재귀 처리
    const children = node.children.map((child) =>
      this.applyVisibilityRecursive(child, totalVariants)
    );

    return {
      ...node,
      ...(visibleCondition ? { visibleCondition } : {}),
      children,
    };
  }

  /**
   * 노드의 가시성 조건 생성
   */
  private createVisibleCondition(
    node: InternalNode,
    totalVariants: number
  ): ConditionNode | undefined {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return undefined;
    }

    // 모든 variant에 존재 → 항상 보임
    if (node.mergedNodes.length === totalVariants) {
      return undefined;
    }

    // 일부 variant에만 존재 → 조건 생성
    return this.extractConditionFromMergedNodes(node.mergedNodes);
  }

  /**
   * mergedNodes에서 공통 조건 추출
   */
  private extractConditionFromMergedNodes(
    mergedNodes: VariantOrigin[]
  ): ConditionNode | undefined {
    if (mergedNodes.length === 0) return undefined;

    // 각 mergedNode의 variant props 파싱
    const allVariantProps = mergedNodes.map((merged) =>
      this.parseVariantName(merged.variantName || merged.name)
    );

    // 공통 prop 찾기
    const commonProps = this.findCommonProps(allVariantProps);

    if (commonProps.length === 0) return undefined;

    // 조건 노드 생성
    const conditions = commonProps.map(({ key, value }) =>
      this.createCondition(key, value)
    );

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];

    return { type: "and", conditions };
  }

  /**
   * variant 이름 파싱
   * "Size=Large, Icon=true" → [{key: "Size", value: "Large"}, {key: "Icon", value: "true"}]
   */
  private parseVariantName(
    variantName: string
  ): Array<{ key: string; value: string }> {
    const result: Array<{ key: string; value: string }> = [];
    const parts = variantName.split(",");

    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key && value) {
        result.push({ key, value });
      }
    }

    return result;
  }

  /**
   * 모든 variant에 공통된 prop 찾기
   */
  private findCommonProps(
    allVariantProps: Array<Array<{ key: string; value: string }>>
  ): Array<{ key: string; value: string }> {
    if (allVariantProps.length === 0) return [];

    const firstProps = allVariantProps[0];
    const common: Array<{ key: string; value: string }> = [];

    for (const prop of firstProps) {
      // State/states prop은 제외 (pseudo-class로 처리됨)
      if (this.isStateProp(prop.key)) {
        continue;
      }

      // 모든 variant에 같은 값이 있는지 확인
      const isCommon = allVariantProps.every((variantProps) =>
        variantProps.some((p) => p.key === prop.key && p.value === prop.value)
      );

      if (isCommon) {
        common.push(prop);
      }
    }

    return common;
  }

  /**
   * State 관련 prop인지 확인
   */
  private isStateProp(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return lowerKey === "state" || lowerKey === "states";
  }

  /**
   * prop 조건 노드 생성
   */
  private createCondition(key: string, value: string): ConditionNode {
    // variant key를 exact match로 PropDefinition 찾기
    const propDef = this.propMap.get(key);

    // PropDefinition이 있으면 name 사용, 없으면 normalize된 key 사용 (fallback)
    const propName = propDef ? propDef.name : this.normalizePropName(key);

    // Boolean 값 처리
    if (value.toLowerCase() === "true") {
      return { type: "truthy", prop: propName };
    }
    if (value.toLowerCase() === "false") {
      return { type: "not", condition: { type: "truthy", prop: propName } };
    }

    // 일반 값
    return { type: "eq", prop: propName, value };
  }

  /**
   * Prop 이름 정규화 (camelCase)
   */
  private normalizePropName(key: string): string {
    return key
      .split(/\s+/)
      .map((word, index) => {
        if (index === 0) {
          return word.charAt(0).toLowerCase() + word.slice(1);
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");
  }
}
