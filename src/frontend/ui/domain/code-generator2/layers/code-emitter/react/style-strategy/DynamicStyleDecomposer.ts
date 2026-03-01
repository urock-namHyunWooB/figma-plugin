/**
 * DynamicStyleDecomposer
 *
 * AND 조건의 dynamic style을 CSS 속성별로 제어 prop에 분리하는 유틸리티.
 *
 * 기존 groupByVariantProp은 AND(size=M, active=T) 스타일 전체를
 * sizeStyles["M"]과 activeStyles["true"] 양쪽에 복사하여 덮어쓰기 충돌 발생.
 *
 * 이 모듈은 각 CSS 속성이 어떤 prop에 의해 제어되는지 일관성 체크로 분석하여,
 * 해당 prop 그룹에만 배치한다.
 */

import type { ConditionNode } from "../../../../types/types";

export interface PropInfo {
  propName: string;
  propValue: string;
}

interface MatrixEntry {
  propValues: Map<string, string>;
  style: Record<string, string | number>;
}

export class DynamicStyleDecomposer {
  /**
   * dynamic style 배열을 prop별 스타일 맵으로 분해.
   *
   * 단일 prop 조건: 기존 동작 유지 (전체 스타일을 해당 prop에 할당).
   * AND 조건: CSS 속성별 소유권 분석 후 제어 prop에만 할당.
   */
  static decompose(
    dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }>
  ): Map<string, Map<string, Record<string, string | number>>> {
    const result = new Map<
      string,
      Map<string, Record<string, string | number>>
    >();

    // 단일 prop vs 다중 prop 분리
    const singlePropEntries: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }> = [];
    const multiPropEntries: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }> = [];

    for (const entry of dynamic) {
      const propInfos = this.extractAllPropInfos(entry.condition);
      if (propInfos.length <= 1) {
        singlePropEntries.push(entry);
      } else {
        multiPropEntries.push(entry);
      }
    }

    // 단일 prop: 기존 로직 (first-write wins)
    for (const { condition, style } of singlePropEntries) {
      const propInfos = this.extractAllPropInfos(condition);
      for (const { propName, propValue } of propInfos) {
        if (!result.has(propName)) {
          result.set(propName, new Map());
        }
        if (!result.get(propName)!.has(propValue)) {
          result.get(propName)!.set(propValue, style);
        }
      }
    }

    // 다중 prop: dimensional decomposition
    if (multiPropEntries.length > 0) {
      this.decomposeMultiProp(multiPropEntries, result);
    }

    return result;
  }

  /**
   * ConditionNode에서 모든 prop 이름 추출 (JsxGenerator용).
   * truthy, not(truthy), eq, and 조건 모두 처리.
   */
  static extractAllPropNames(condition: ConditionNode): string[] {
    return this.extractAllPropInfos(condition).map((p) => p.propName);
  }

  /**
   * ConditionNode에서 모든 prop name+value 쌍 추출.
   * eq → propValue = value
   * truthy → propValue = "true"
   * not(truthy) → propValue = "false"
   */
  static extractAllPropInfos(condition: ConditionNode): PropInfo[] {
    if (condition.type === "eq" && typeof condition.value === "string") {
      return [{ propName: condition.prop, propValue: condition.value }];
    }

    if (condition.type === "truthy") {
      return [{ propName: condition.prop, propValue: "true" }];
    }

    if (
      condition.type === "not" &&
      condition.condition.type === "truthy"
    ) {
      return [{ propName: condition.condition.prop, propValue: "false" }];
    }

    if (condition.type === "and") {
      const results: PropInfo[] = [];
      for (const sub of condition.conditions) {
        results.push(...this.extractAllPropInfos(sub));
      }
      return results;
    }

    return [];
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * AND 조건 엔트리들을 CSS 속성별로 제어 prop에 분배.
   */
  private static decomposeMultiProp(
    entries: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }>,
    result: Map<string, Map<string, Record<string, string | number>>>
  ): void {
    // Step 1: matrix 구성 — 각 엔트리의 prop→value 매핑과 스타일
    const matrix: MatrixEntry[] = entries.map((entry) => ({
      propValues: this.extractPropValueMap(entry.condition),
      style: entry.style,
    }));

    // Step 2: 모든 prop 이름 수집 (순서 유지)
    const allProps: string[] = [];
    const propSet = new Set<string>();
    for (const entry of matrix) {
      for (const propName of entry.propValues.keys()) {
        if (!propSet.has(propName)) {
          propSet.add(propName);
          allProps.push(propName);
        }
      }
    }

    // Step 3: 모든 CSS 속성 수집
    const allCssKeys = new Set<string>();
    for (const entry of matrix) {
      for (const key of Object.keys(entry.style)) {
        allCssKeys.add(key);
      }
    }

    // Step 4: 각 CSS 속성의 소유 prop 결정
    const cssKeyOwner = new Map<string, string>();
    for (const cssKey of allCssKeys) {
      const owner = this.findControllingProp(cssKey, matrix, allProps);
      cssKeyOwner.set(cssKey, owner);
    }

    // Step 5: 결과 맵 구성 — 각 엔트리에서 소유 prop에 해당하는 CSS 속성만 배치
    for (const entry of matrix) {
      for (const [propName, propValue] of entry.propValues) {
        // 이 prop이 소유하는 CSS 속성만 수집
        const ownedStyle: Record<string, string | number> = {};
        for (const [cssKey, cssValue] of Object.entries(entry.style)) {
          if (cssKeyOwner.get(cssKey) === propName) {
            ownedStyle[cssKey] = cssValue;
          }
        }

        if (Object.keys(ownedStyle).length === 0) continue;

        if (!result.has(propName)) {
          result.set(propName, new Map());
        }
        const propMap = result.get(propName)!;

        if (!propMap.has(propValue)) {
          propMap.set(propValue, ownedStyle);
        } else {
          // 이미 존재하면 merge (단일 prop 엔트리가 먼저 들어갔을 수 있음)
          Object.assign(propMap.get(propValue)!, ownedStyle);
        }
      }
    }
  }

  /**
   * 특정 CSS 속성을 제어하는 prop 찾기.
   *
   * "일관성 체크": prop P의 같은 값끼리 묶었을 때,
   * 해당 CSS 속성 값이 모두 동일하면 P가 제어한다고 판단.
   */
  private static findControllingProp(
    cssKey: string,
    matrix: MatrixEntry[],
    allProps: string[]
  ): string {
    for (const propName of allProps) {
      if (this.isPropConsistentForCssKey(propName, cssKey, matrix)) {
        return propName;
      }
    }
    // fallback: 어떤 prop도 단독 제어하지 않음 → 첫 번째 prop에 할당
    return allProps[0];
  }

  /**
   * prop P의 같은 값을 가진 엔트리들에서 cssKey의 값이 동일한지 확인.
   * sparse data: cssKey가 없는 엔트리는 무시.
   */
  private static isPropConsistentForCssKey(
    propName: string,
    cssKey: string,
    matrix: MatrixEntry[]
  ): boolean {
    // prop의 값별로 그룹화
    const groups = new Map<string, (string | number)[]>();

    for (const entry of matrix) {
      const propValue = entry.propValues.get(propName);
      if (propValue === undefined) continue;

      if (!(cssKey in entry.style)) continue;

      if (!groups.has(propValue)) {
        groups.set(propValue, []);
      }
      groups.get(propValue)!.push(entry.style[cssKey]);
    }

    // 데이터가 없으면 제어하지 않는 것으로 판단
    if (groups.size === 0) return false;

    // 각 그룹 내에서 값이 모두 동일해야 함
    for (const values of groups.values()) {
      const first = String(values[0]);
      for (let i = 1; i < values.length; i++) {
        if (String(values[i]) !== first) {
          return false;
        }
      }
    }

    // 추가 체크: 그룹 간에 값이 달라야 "제어"한다고 볼 수 있음
    // (모든 그룹이 같은 값이면 이 prop은 해당 CSS 속성에 영향을 주지 않음)
    const groupValues = new Set<string>();
    for (const values of groups.values()) {
      groupValues.add(String(values[0]));
    }

    // 그룹이 1개뿐이면 (prop 값이 1가지) 제어 판단 불가 → false
    if (groups.size <= 1) return false;

    // 모든 그룹이 같은 값이면 이 prop은 제어하지 않음
    if (groupValues.size <= 1) return false;

    return true;
  }

  /**
   * ConditionNode에서 prop→value 매핑 추출.
   */
  private static extractPropValueMap(
    condition: ConditionNode
  ): Map<string, string> {
    const map = new Map<string, string>();
    const infos = this.extractAllPropInfos(condition);
    for (const { propName, propValue } of infos) {
      map.set(propName, propValue);
    }
    return map;
  }
}
