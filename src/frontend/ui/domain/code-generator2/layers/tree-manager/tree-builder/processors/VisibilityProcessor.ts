import {
  InternalNode,
  ConditionNode,
  VariantOrigin,
  PropDefinition,
  VariantPropDefinition,
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

  // 루트 variant의 prop별 value 분포: propKey → (value → count)
  private rootValueDistribution: Map<string, Map<string, number>> = new Map();

  /**
   * InternalNode에 가시성 조건 적용 (재귀)
   */
  public applyVisibility(root: InternalNode, props: PropDefinition[]): InternalNode {
    const totalVariants = root.mergedNodes?.length || 0;

    // sourceKey → PropDefinition 매핑
    // 여러 형태의 key로 조회 가능하도록 normalized 버전도 함께 등록
    // 예: sourceKey="┗ Required#17042:5" → 아래 3가지 키로 등록
    //   1. "┗ Required#17042:5" (원본)
    //   2. "┗ Required"        (# ID 제거)
    //   3. "Required"          (ASCII 정규화 — variant 이름 기반 조회용)
    this.propMap = new Map();
    for (const p of props) {
      this.propMap.set(p.sourceKey, p);

      // # ID 제거
      const withoutId = p.sourceKey.split("#")[0].trim();
      if (withoutId && !this.propMap.has(withoutId)) {
        this.propMap.set(withoutId, p);
      }

      // ASCII 정규화 (box-drawing 문자 등 특수문자 제거)
      const normalized = withoutId.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
      if (normalized && !this.propMap.has(normalized)) {
        this.propMap.set(normalized, p);
      }
    }

    // 루트 variant의 prop별 value 분포 구축
    this.rootValueDistribution = this.buildValueDistribution(root.mergedNodes || []);

    return this.applyVisibilityRecursive(root, totalVariants);
  }

  /**
   * 재귀적으로 가시성 조건 적용
   *
   * @param guaranteedConditions 조상 노드가 이미 보장하는 atomic 조건 목록
   *   - 부모가 이미 보장한 조건을 자식이 중복 생성하지 않도록 제거
   */
  private applyVisibilityRecursive(
    node: InternalNode,
    totalVariants: number,
    guaranteedConditions: ConditionNode[] = []
  ): InternalNode {
    // visibleCondition 생성 (원래 값)
    const rawCondition = this.createVisibleCondition(node, totalVariants);

    // 조상이 이미 보장하는 조건은 중복이므로 제거
    let visibleCondition = rawCondition;
    if (rawCondition && guaranteedConditions.length > 0) {
      visibleCondition = this.removeGuaranteedSubconditions(rawCondition, guaranteedConditions);
    }

    // 자식에게 전달할 보장 조건: 현재 노드의 raw 조건을 flatten해서 추가
    const childGuaranteedConditions = rawCondition
      ? [...guaranteedConditions, ...this.flattenAndConditions(rawCondition)]
      : guaranteedConditions;

    // children 재귀 처리
    const children = node.children.map((child) =>
      this.applyVisibilityRecursive(child, totalVariants, childGuaranteedConditions)
    );

    return {
      ...node,
      ...(visibleCondition ? { visibleCondition } : {}),
      children,
    };
  }

  /**
   * AND 조건을 flat한 atomic 조건 배열로 분해
   */
  private flattenAndConditions(cond: ConditionNode): ConditionNode[] {
    if (cond.type === "and") {
      return cond.conditions.flatMap((c) => this.flattenAndConditions(c));
    }
    return [cond];
  }

  /**
   * 이미 보장된 조건을 조건 트리에서 제거
   */
  private removeGuaranteedSubconditions(
    condition: ConditionNode,
    guaranteed: ConditionNode[]
  ): ConditionNode | undefined {
    if (condition.type === "and") {
      const remaining = condition.conditions
        .map((c) => this.removeGuaranteedSubconditions(c, guaranteed))
        .filter((c): c is ConditionNode => c !== undefined);

      if (remaining.length === 0) return undefined;
      if (remaining.length === 1) return remaining[0];
      return { type: "and", conditions: remaining };
    }

    if (guaranteed.some((g) => this.conditionEquals(g, condition))) {
      return undefined;
    }
    return condition;
  }

  /**
   * 두 ConditionNode가 구조적으로 동일한지 비교
   */
  private conditionEquals(a: ConditionNode, b: ConditionNode): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case "eq":
        return b.type === "eq" && a.prop === b.prop && a.value === b.value;
      case "neq":
        return b.type === "neq" && a.prop === b.prop && a.value === b.value;
      case "truthy":
        return b.type === "truthy" && a.prop === b.prop;
      case "not":
        return b.type === "not" && this.conditionEquals(a.condition, b.condition);
      case "and":
        return (
          b.type === "and" &&
          a.conditions.length === b.conditions.length &&
          a.conditions.every((c, i) => this.conditionEquals(c, b.conditions[i]))
        );
      case "or":
        return (
          b.type === "or" &&
          a.conditions.length === b.conditions.length &&
          a.conditions.every((c, i) => this.conditionEquals(c, b.conditions[i]))
        );
    }
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
   * mergedNodes에서 조건 추출
   *
   * 1. findCommonProps: 모든 mergedNodes가 동일 value를 공유하는 prop → eq/truthy 조건
   * 2. findSubsetConditions: 일부 value만 완전 커버 → OR 조건 (fallback)
   */
  private extractConditionFromMergedNodes(
    mergedNodes: VariantOrigin[]
  ): ConditionNode | undefined {
    if (mergedNodes.length === 0) return undefined;

    // 각 mergedNode의 variant props 파싱
    const allVariantProps = mergedNodes.map((merged) =>
      this.parseVariantName(merged.variantName || merged.name)
    );

    // 1. 공통 prop 찾기 (모든 mergedNode가 같은 value)
    const commonProps = this.findCommonProps(allVariantProps);

    if (commonProps.length > 0) {
      const conditions = commonProps.map(({ key, value }) =>
        this.createCondition(key, value)
      );
      if (conditions.length === 1) return conditions[0];
      return { type: "and", conditions };
    }

    // 2. 공통 prop이 없으면 subset 조건 시도 (OR 조건)
    return this.findSubsetConditions(allVariantProps);
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
      // State/states prop: heuristic이 처리하므로 여기서 필터링하지 않음
      // (heuristic이 pseudo-class, boolean prop, 또는 다른 조건으로 변환)

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
   * mergedNodes에서 prop별 value 분포 구축
   * propKey → (value → count)
   */
  private buildValueDistribution(
    mergedNodes: VariantOrigin[]
  ): Map<string, Map<string, number>> {
    const dist = new Map<string, Map<string, number>>();
    for (const merged of mergedNodes) {
      const props = this.parseVariantName(merged.variantName || merged.name);
      for (const { key, value } of props) {
        if (!dist.has(key)) dist.set(key, new Map());
        const valMap = dist.get(key)!;
        valMap.set(value, (valMap.get(value) || 0) + 1);
      }
    }
    return dist;
  }

  /**
   * 자식 mergedNodes가 특정 prop의 일부 value만 완전히 커버하는 경우 OR 조건 생성
   *
   * 예: root에 CustomType=text(16), number(16), password(16), search(8), search-gray(2), date(6)
   *     자식의 mergedNodes(50개)가 text(16), number(16), password(16), search(2) 포함
   *     → text, number, password만 "완전 커버" → OR(customType=text, customType=number, customType=password)
   */
  private findSubsetConditions(
    allVariantProps: Array<Array<{ key: string; value: string }>>
  ): ConditionNode | undefined {
    if (allVariantProps.length === 0 || this.rootValueDistribution.size === 0) {
      return undefined;
    }

    // 자식 mergedNodes의 prop별 value 분포
    const childDist = new Map<string, Map<string, number>>();
    for (const variantProps of allVariantProps) {
      for (const { key, value } of variantProps) {
        if (!childDist.has(key)) childDist.set(key, new Map());
        const valMap = childDist.get(key)!;
        valMap.set(value, (valMap.get(value) || 0) + 1);
      }
    }

    // 각 prop에 대해 "완전 커버" value 집합 찾기
    // breakpoint/device/screen prop은 ResponsiveProcessor가 @media로 처리하므로 제외
    const BP_NAME_RE = /breakpoint|device|screen/i;
    const conditions: ConditionNode[] = [];

    for (const [propKey, childValMap] of childDist) {
      // breakpoint prop 스킵 (ResponsiveProcessor가 처리)
      if (BP_NAME_RE.test(propKey)) continue;
      const rootValMap = this.rootValueDistribution.get(propKey);
      if (!rootValMap) continue;

      // 전체 value 수와 자식이 가진 value 수 비교
      const rootValueCount = rootValMap.size;
      const childValues = [...childValMap.keys()];

      // 모든 value를 커버하면 이 prop은 조건에 불필요
      if (childValues.length >= rootValueCount) continue;

      // 완전 커버된 value만 추출 (child count === root count)
      const fullyCovered: string[] = [];
      for (const [value, childCount] of childValMap) {
        const rootCount = rootValMap.get(value) || 0;
        if (rootCount > 0 && childCount >= rootCount) {
          fullyCovered.push(value);
        }
      }

      // 완전 커버된 value가 없거나 전체와 같으면 스킵
      if (fullyCovered.length === 0 || fullyCovered.length >= rootValueCount) continue;

      // OR 조건 생성
      const eqConditions = fullyCovered.map((value) =>
        this.createCondition(propKey, value)
      );

      if (eqConditions.length === 1) {
        conditions.push(eqConditions[0]);
      } else {
        conditions.push({ type: "or", conditions: eqConditions });
      }
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return { type: "and", conditions };
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
