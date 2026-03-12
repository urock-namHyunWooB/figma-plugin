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

/**
 * CSS variable의 fallback 값을 추출하여 비교용 정규화 문자열 반환.
 * 예: "var(--Color-bg-01, #F9F9F9)" → "#F9F9F9"
 * var()가 아니면 원래 값 그대로 반환.
 */
function normalizeCssValue(value: string): string {
  const match = value.match(/^var\([^,]+,\s*(.+)\)$/);
  return match ? match[1].trim() : value;
}

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
    }>,
    base?: Record<string, string | number>
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

    // 단일 prop: 같은 condition이면 스타일 병합
    for (const { condition, style } of singlePropEntries) {
      const propInfos = this.extractAllPropInfos(condition);
      for (const { propName, propValue } of propInfos) {
        if (!result.has(propName)) {
          result.set(propName, new Map());
        }
        if (!result.get(propName)!.has(propValue)) {
          result.get(propName)!.set(propValue, { ...style });
        } else {
          // 기존 속성 보존, 새 속성만 추가 (first-write per property)
          const existing = result.get(propName)!.get(propValue)!;
          for (const [k, v] of Object.entries(style)) {
            if (!(k in existing)) {
              existing[k] = v;
            }
          }
        }
      }
    }

    // 다중 prop: dimensional decomposition
    if (multiPropEntries.length > 0) {
      this.decomposeMultiProp(multiPropEntries, result);
    }

    // 후처리: 모든 variant 값이 동일한 CSS 속성 제거 (base와 다르면 유지)
    this.removeUniformProperties(result, base);

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
    if (condition.type === "eq" && (typeof condition.value === "string" || typeof condition.value === "boolean" || typeof condition.value === "number")) {
      return [{ propName: condition.prop, propValue: String(condition.value) }];
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
   * 모든 variant 값에서 동일한 CSS 속성을 제거.
   *
   * 예: activeStyles = { true: { opacity: 0.43 }, false: { opacity: 0.43 } }
   * → opacity가 양쪽 동일 → active가 opacity를 제어하지 않음 → 제거.
   * 결과적으로 빈 스타일 객체가 되면 해당 prop 그룹 전체 제거.
   */
  private static removeUniformProperties(
    result: Map<string, Map<string, Record<string, string | number>>>,
    base?: Record<string, string | number>
  ): void {
    for (const [propName, valueMap] of result) {
      if (valueMap.size <= 1) continue;

      // 모든 CSS 키 수집
      const allCssKeys = new Set<string>();
      for (const style of valueMap.values()) {
        for (const key of Object.keys(style)) {
          allCssKeys.add(key);
        }
      }

      // 각 CSS 키: 모든 variant에서 동일한 값이면 제거
      // 단, base 스타일과 다르거나 base에 없는 속성은 유지 (실제 override임)
      for (const cssKey of allCssKeys) {
        const values = new Set<string>();
        let allPresent = true;
        for (const style of valueMap.values()) {
          if (!(cssKey in style)) {
            allPresent = false;
            break;
          }
          values.add(String(style[cssKey]));
        }
        if (allPresent && values.size === 1) {
          // base가 있으면: base와 다른 값이거나 base에 없는 키는 유지
          if (base) {
            const uniformValue = [...valueMap.values()][0][cssKey];
            if (!(cssKey in base) || base[cssKey] !== uniformValue) {
              continue; // base와 다름 → 실제 override이므로 유지
            }
          }
          // 모든 variant에 존재하고 값이 동일 (+ base와도 동일) → 제거
          for (const style of valueMap.values()) {
            delete style[cssKey];
          }
        }
      }

      // 빈 스타일 객체만 남은 prop 그룹 제거
      const allEmpty = [...valueMap.values()].every(
        (s) => Object.keys(s).length === 0
      );
      if (allEmpty) {
        result.delete(propName);
      }
    }
  }

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
    // prop의 값별로 그룹화 (CSS 속성이 없는 엔트리도 absent로 추적)
    const groups = new Map<
      string,
      { present: (string | number)[]; absentCount: number }
    >();

    for (const entry of matrix) {
      const propValue = entry.propValues.get(propName);
      if (propValue === undefined) continue;

      if (!groups.has(propValue)) {
        groups.set(propValue, { present: [], absentCount: 0 });
      }

      if (cssKey in entry.style) {
        groups.get(propValue)!.present.push(entry.style[cssKey]);
      } else {
        groups.get(propValue)!.absentCount++;
      }
    }

    if (groups.size <= 1) return false;

    // 각 그룹 내에서 일관적이어야 함:
    // - present 값끼리 동일하고
    // - present와 absent가 섞이지 않아야 함
    for (const group of groups.values()) {
      if (group.present.length > 0 && group.absentCount > 0) {
        return false;
      }
      if (group.present.length > 1) {
        const first = normalizeCssValue(String(group.present[0]));
        for (let i = 1; i < group.present.length; i++) {
          if (normalizeCssValue(String(group.present[i])) !== first) return false;
        }
      }
    }

    // 그룹 간에 차이가 있어야 "제어"한다고 판단
    // (값이 다르거나, 있음/없음이 다르거나)
    const groupSignatures = new Set<string>();
    for (const group of groups.values()) {
      if (group.present.length > 0) {
        groupSignatures.add(normalizeCssValue(String(group.present[0])));
      } else {
        groupSignatures.add("__absent__");
      }
    }

    return groupSignatures.size > 1;
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
