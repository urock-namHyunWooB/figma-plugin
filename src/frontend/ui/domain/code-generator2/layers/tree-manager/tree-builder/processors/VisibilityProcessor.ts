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
    // 1. componentPropertyReferences.visible 우선 처리 (INSTANCE visibility)
    if (node.componentPropertyReferences?.visible) {
      const condition = this.extractConditionFromPropertyRef(
        node.componentPropertyReferences.visible
      );
      if (condition) return condition;
    }

    // 2. variant 병합 기반 조건 생성 (기존 로직)
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
      // State/states prop: CSS 변환 가능한 값만 제외 (pseudo-class로 처리됨)
      // Error, Press, Insert 등 CSS 변환 불가능한 State는 런타임 조건으로 유지
      if (this.isStateProp(prop.key) && this.isCssConvertibleStateValue(prop.value)) {
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
   * CSS pseudo-class로 변환 가능한 State 값인지 확인
   * Hover, Pressed, Disabled 등은 CSS로 변환 가능
   * Error, Press, Insert 등은 변환 불가 → 런타임 조건으로 유지
   */
  private static readonly CSS_CONVERTIBLE_STATES = new Set([
    "default", "normal", "enabled", "rest", "idle",
    "hover", "hovered", "hovering",
    "active", "pressed", "pressing", "clicked",
    "focus", "focused", "focus-visible",
    "disabled", "inactive",
    "selected", "checked",
    "visited",
  ]);

  private isCssConvertibleStateValue(value: string): boolean {
    return VisibilityProcessor.CSS_CONVERTIBLE_STATES.has(value.toLowerCase());
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

  /**
   * componentPropertyReferences.visible에서 조건 추출
   * 예: "icon left#373:58" → { type: "truthy", prop: "iconLeft" }
   */
  private extractConditionFromPropertyRef(
    visibleRef: string
  ): ConditionNode | undefined {
    // "#" 앞부분이 prop sourceKey (예: "icon left")
    const sourceKey = visibleRef.split("#")[0].trim();
    if (!sourceKey) return undefined;

    // propMap에서 PropDefinition 찾기
    const propDef = this.propMap.get(sourceKey);
    if (!propDef) {
      // propMap에 없으면 normalize해서 사용 (fallback)
      const propName = this.normalizePropName(sourceKey);
      return { type: "truthy", prop: propName };
    }

    // Boolean prop이면 truthy 조건
    if (propDef.type === "boolean") {
      return { type: "truthy", prop: propDef.name };
    }

    // Slot prop이면 truthy 조건 (React.ReactNode 존재 여부)
    if (propDef.type === "slot") {
      return { type: "truthy", prop: propDef.name };
    }

    // 기타 타입은 지원하지 않음 (필요시 확장)
    return undefined;
  }
}
