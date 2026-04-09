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

    // 루트 노드는 모든 variant에 존재하므로 null 반환 불가
    return this.applyVisibilityRecursive(root, totalVariants)!;
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
  ): InternalNode | null {
    // visibleCondition 생성 (원래 값)
    const rawCondition = this.createVisibleCondition(node, totalVariants);

    // 조상이 이미 보장하는 조건은 중복이므로 제거
    let visibleCondition = rawCondition;
    if (rawCondition && guaranteedConditions.length > 0) {
      visibleCondition = this.removeGuaranteedSubconditions(rawCondition, guaranteedConditions);
    }

    // 조상 조건과 모순되는 노드는 dead code → 제거
    // 예: 조상이 customType==="date" 보장, 자식이 customType==="search" 요구 → 불가
    if (visibleCondition && guaranteedConditions.length > 0) {
      if (this.isContradictedByGuaranteed(visibleCondition, guaranteedConditions)) {
        return null;
      }
      // OR 분기 중 불가능한 분기만 제거 (TS2367 방지)
      // 예: OR(customType=search, customType=text) → 조상이 text|number|password 보장
      //     → search 분기 제거 → customType=text만 남음
      visibleCondition = this.simplifyConditionAgainstGuaranteed(
        visibleCondition,
        guaranteedConditions
      );
      if (!visibleCondition) return null;
    }

    // 자식에게 전달할 보장 조건: 현재 노드의 raw 조건을 flatten해서 추가
    const childGuaranteedConditions = rawCondition
      ? [...guaranteedConditions, ...this.flattenAndConditions(rawCondition)]
      : guaranteedConditions;

    // children 재귀 처리 (null 반환 = dead code 제거)
    const children = node.children
      .map((child) =>
        this.applyVisibilityRecursive(child, totalVariants, childGuaranteedConditions)
      )
      .filter((child): child is InternalNode => child !== null);

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
   * 조건이 보장된 조상 조건과 모순되는지 판별.
   * 조상이 prop===X를 보장하는데, 자식이 prop===Y(X≠Y)를 요구하면 절대 true 불가.
   *
   * - eq: 같은 prop에 다른 value → 모순
   * - and: 하위 조건 중 하나라도 모순 → 전체 모순
   * - or: 모든 분기가 모순 → 전체 모순
   */
  private isContradictedByGuaranteed(
    condition: ConditionNode,
    guaranteed: ConditionNode[]
  ): boolean {
    // 보장된 eq 조건을 prop → value 맵으로 구축
    const guaranteedEqs = new Map<string, string>();
    for (const g of guaranteed) {
      if (g.type === "eq") {
        guaranteedEqs.set(g.prop, String(g.value));
      }
    }
    if (guaranteedEqs.size === 0) return false;

    return this.isImpossibleCondition(condition, guaranteedEqs);
  }

  /**
   * 보장된 조건으로부터 prop별 허용 값 집합을 추출.
   *
   * - eq(prop, val) → prop ∈ {val}
   * - OR(eq(prop, v1), eq(prop, v2)) → prop ∈ {v1, v2}
   *
   * 반환: prop → Set<allowed values>
   */
  private buildAllowedValues(
    guaranteed: ConditionNode[]
  ): Map<string, Set<string>> {
    const allowed = new Map<string, Set<string>>();

    for (const g of guaranteed) {
      if (g.type === "eq") {
        // 단일 eq → 정확히 하나의 값만 허용
        allowed.set(g.prop, new Set([String(g.value)]));
      } else if (g.type === "or") {
        // OR의 모든 분기가 같은 prop의 eq인 경우 → 허용 값 집합
        const props = new Set<string>();
        const values: string[] = [];
        let allEq = true;
        for (const c of g.conditions) {
          if (c.type === "eq") {
            props.add(c.prop);
            values.push(String(c.value));
          } else {
            allEq = false;
            break;
          }
        }
        if (allEq && props.size === 1) {
          const prop = [...props][0];
          // 기존에 더 제한적인 값이 있으면 intersection
          const existing = allowed.get(prop);
          if (existing) {
            const intersection = new Set(
              values.filter((v) => existing.has(v))
            );
            allowed.set(prop, intersection);
          } else {
            allowed.set(prop, new Set(values));
          }
        }
      }
    }

    return allowed;
  }

  /**
   * 조건 트리에서 보장된 조건에 의해 불가능한 분기를 제거/단순화.
   *
   * - OR: 불가능 분기 제거 후 남은 분기만 유지
   * - AND: 각 자식 단순화
   * - eq: 허용 값 집합에 없으면 undefined (제거 대상)
   */
  private simplifyConditionAgainstGuaranteed(
    condition: ConditionNode,
    guaranteed: ConditionNode[]
  ): ConditionNode | undefined {
    const allowedValues = this.buildAllowedValues(guaranteed);
    if (allowedValues.size === 0) return condition;

    return this.simplifyRecursive(condition, allowedValues);
  }

  private simplifyRecursive(
    condition: ConditionNode,
    allowedValues: Map<string, Set<string>>
  ): ConditionNode | undefined {
    switch (condition.type) {
      case "eq": {
        const allowed = allowedValues.get(condition.prop);
        if (allowed && !allowed.has(String(condition.value))) {
          return undefined; // 불가능한 값
        }
        return condition;
      }
      case "or": {
        const simplified = condition.conditions
          .map((c) => this.simplifyRecursive(c, allowedValues))
          .filter((c): c is ConditionNode => c !== undefined);
        if (simplified.length === 0) return undefined;
        if (simplified.length === 1) return simplified[0];
        return { type: "or", conditions: simplified };
      }
      case "and": {
        const simplified = condition.conditions
          .map((c) => this.simplifyRecursive(c, allowedValues))
          .filter((c): c is ConditionNode => c !== undefined);
        if (simplified.length === 0) return undefined;
        // AND에서 하나라도 제거되면 전체가 불가능할 수 있음 — 아닌 경우도 있음
        // 여기서는 보수적으로: 제거된 조건은 "항상 false"이므로 AND 전체 false
        if (simplified.length < condition.conditions.length) {
          // 제거된 분기가 있다는 것은 해당 eq가 불가능 → AND 전체 불가능
          return undefined;
        }
        if (simplified.length === 1) return simplified[0];
        return { type: "and", conditions: simplified };
      }
      default:
        return condition;
    }
  }

  private isImpossibleCondition(
    condition: ConditionNode,
    guaranteedEqs: Map<string, string>
  ): boolean {
    switch (condition.type) {
      case "eq": {
        const guaranteedVal = guaranteedEqs.get(condition.prop);
        return guaranteedVal !== undefined && guaranteedVal !== condition.value;
      }
      case "and":
        // AND의 하위 조건 중 하나라도 불가능 → 전체 불가능
        return condition.conditions.some((c) =>
          this.isImpossibleCondition(c, guaranteedEqs)
        );
      case "or":
        // OR의 모든 분기가 불가능 → 전체 불가능
        return condition.conditions.every((c) =>
          this.isImpossibleCondition(c, guaranteedEqs)
        );
      default:
        return false;
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

    const conditions: ConditionNode[] = commonProps.map(({ key, value }) =>
      this.createCondition(key, value)
    );

    // 2. 비공통 prop의 부분 커버리지 확인
    // 예: icon_delete가 State=loading(공통) + Size=M,S(비공통, L 미포함)인 경우
    //     → AND(state=loading, OR(size=M, size=S))
    if (commonProps.length > 0) {
      const commonKeys = new Set(commonProps.map((p) => p.key));
      const partialConditions = this.findPartialCoverageConditions(
        allVariantProps,
        commonKeys
      );
      conditions.push(...partialConditions);
    }

    if (conditions.length > 0) {
      if (conditions.length === 1) return conditions[0];
      return { type: "and", conditions };
    }

    // 3. 공통 prop이 없으면 subset 조건 시도 (OR 조건)
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
   * 공통 prop 이외의 prop에서 부분 커버리지 조건 생성
   *
   * 공통 prop이 이미 조건을 제한하므로, 나머지 prop은 value 집합 비교만으로 충분.
   * (count 기반이 아닌 set 기반 — 공통 조건이 count 차이를 설명하기 때문)
   *
   * 예: icon_delete → State=loading(공통), Size={M,S} vs root Size={L,M,S}
   *     → OR(size=M, size=S)
   */
  private findPartialCoverageConditions(
    allVariantProps: Array<Array<{ key: string; value: string }>>,
    commonKeys: Set<string>
  ): ConditionNode[] {
    const BP_NAME_RE = /breakpoint|device|screen/i;

    // 비공통 prop의 value 집합 수집
    const childValueSets = new Map<string, Set<string>>();
    for (const variantProps of allVariantProps) {
      for (const { key, value } of variantProps) {
        if (commonKeys.has(key)) continue;
        if (!childValueSets.has(key)) childValueSets.set(key, new Set());
        childValueSets.get(key)!.add(value);
      }
    }

    const conditions: ConditionNode[] = [];
    for (const [propKey, childValues] of childValueSets) {
      if (BP_NAME_RE.test(propKey)) continue;
      const rootValMap = this.rootValueDistribution.get(propKey);
      if (!rootValMap) continue;

      // child가 root의 모든 value를 가지면 제약 불필요
      if (childValues.size >= rootValMap.size) continue;

      // 부분 커버리지 → OR 조건
      const eqConditions = [...childValues].map((v) =>
        this.createCondition(propKey, v)
      );
      if (eqConditions.length === 1) {
        conditions.push(eqConditions[0]);
      } else {
        conditions.push({ type: "or", conditions: eqConditions });
      }
    }

    return conditions;
  }

  /**
   * prop 조건 노드 생성
   */
  private createCondition(key: string, value: string): ConditionNode {
    // variant key를 exact match로 PropDefinition 찾기
    // → 못 찾으면 lowercase로 재시도 (variant 이름은 titlecase, sourceKey는 lowercase 가능)
    const propDef = this.propMap.get(key) ?? this.propMap.get(key.toLowerCase());

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

    // String prop이면 truthy 조건 (문자열 존재 여부로 컨테이너 가시성 제어)
    if (propDef.type === "string") {
      return { type: "truthy", prop: propDef.name };
    }

    // 기타 타입은 지원하지 않음 (필요시 확장)
    return undefined;
  }
}
