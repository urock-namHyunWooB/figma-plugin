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

/** variant 불일치 진단 정보 */
export interface VariantInconsistency {
  cssProperty: string;
  propName: string;
  propValue: string;
  variants: Array<{
    props: Record<string, string>;
    value: string;
  }>;
  expectedValue: string | null;
}

interface MatrixEntry {
  propValues: Map<string, string>;
  style: Record<string, string | number>;
}

interface PropGroup {
  entries: MatrixEntry[];
  presentValues: (string | number)[];
  absentCount: number;
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
    return this.decomposeInternal(dynamic, base);
  }

  /**
   * decompose + variant 불일치 진단 정보 반환.
   *
   * AND 조건에서 어떤 prop도 CSS 속성을 완전히 제어하지 못할 때,
   * 가장 적합한 축(best-fit)에 배치하고 불일치 그룹을 diagnostics로 보고한다.
   */
  static decomposeWithDiagnostics(
    dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }>,
    base?: Record<string, string | number>
  ): {
    result: Map<string, Map<string, Record<string, string | number>>>;
    diagnostics: VariantInconsistency[];
  } {
    const diagnostics: VariantInconsistency[] = [];
    const result = this.decomposeInternal(dynamic, base, diagnostics);
    return { result, diagnostics };
  }

  private static decomposeInternal(
    dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
    }>,
    base?: Record<string, string | number>,
    diagnostics?: VariantInconsistency[]
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
      this.decomposeMultiProp(multiPropEntries, result, diagnostics);
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
      // 이 prop이 해당 CSS 속성을 제어하지 않음을 의미
      // 단, base에 해당 속성이 없으면 유일한 source이므로 유지
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
          // base에 해당 속성이 없으면: 유일한 source → 유지
          if (base && !(cssKey in base)) {
            continue;
          }
          // base에 있거나 base 없음 → uniform이므로 제거
          // (base가 default 제공, 다른 dimension이 override 담당)
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
    result: Map<string, Map<string, Record<string, string | number>>>,
    diagnostics?: VariantInconsistency[]
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
      const owner = this.findControllingProp(cssKey, matrix, allProps, diagnostics);
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
   * 1차: 엄격한 일관성 체크 — 모든 그룹이 내부적으로 일관적인 prop
   * 2차: best-fit — 일관적 그룹이 가장 많은 prop (불일치 시 diagnostics 수집)
   */
  private static findControllingProp(
    cssKey: string,
    matrix: MatrixEntry[],
    allProps: string[],
    diagnostics?: VariantInconsistency[]
  ): string {
    // 1차: 엄격한 일관성 체크
    for (const propName of allProps) {
      if (this.isPropConsistentForCssKey(propName, cssKey, matrix)) {
        return propName;
      }
    }

    // 2차: best-fit — 일관적 그룹이 가장 많은 prop 선택
    let bestProp = allProps[0];
    let bestConsistent = -1;

    for (const propName of allProps) {
      const groups = this.buildPropGroups(propName, cssKey, matrix);
      if (groups.size <= 1) continue;

      let consistentCount = 0;
      for (const group of groups.values()) {
        if (this.isGroupConsistent(group)) consistentCount++;
      }
      if (consistentCount > bestConsistent) {
        bestConsistent = consistentCount;
        bestProp = propName;
      }
    }

    // diagnostics 수집: bestProp의 불일치 그룹 보고
    if (diagnostics) {
      this.collectDiagnostics(cssKey, bestProp, matrix, diagnostics);
    }

    return bestProp;
  }

  /**
   * prop P의 같은 값을 가진 엔트리들에서 cssKey의 값이 동일한지 확인.
   */
  private static isPropConsistentForCssKey(
    propName: string,
    cssKey: string,
    matrix: MatrixEntry[]
  ): boolean {
    const groups = this.buildPropGroups(propName, cssKey, matrix);
    if (groups.size <= 1) return false;

    for (const group of groups.values()) {
      if (!this.isGroupConsistent(group)) return false;
    }

    // 그룹 간에 차이가 있어야 "제어"한다고 판단
    const groupSignatures = new Set<string>();
    for (const group of groups.values()) {
      if (group.presentValues.length > 0) {
        groupSignatures.add(normalizeCssValue(String(group.presentValues[0])));
      } else {
        groupSignatures.add("__absent__");
      }
    }

    return groupSignatures.size > 1;
  }

  /** prop별로 엔트리를 그룹화 (진단 + 일관성 체크 공용) */
  private static buildPropGroups(
    propName: string,
    cssKey: string,
    matrix: MatrixEntry[]
  ): Map<string, PropGroup> {
    const groups = new Map<string, PropGroup>();

    for (const entry of matrix) {
      const propValue = entry.propValues.get(propName);
      if (propValue === undefined) continue;

      if (!groups.has(propValue)) {
        groups.set(propValue, { entries: [], presentValues: [], absentCount: 0 });
      }

      const group = groups.get(propValue)!;
      group.entries.push(entry);

      if (cssKey in entry.style) {
        group.presentValues.push(entry.style[cssKey]);
      } else {
        group.absentCount++;
      }
    }

    return groups;
  }

  /** 그룹 내 CSS 값이 모두 동일한지 확인 */
  private static isGroupConsistent(group: PropGroup): boolean {
    if (group.presentValues.length > 0 && group.absentCount > 0) return false;
    if (group.presentValues.length <= 1) return true;

    const first = normalizeCssValue(String(group.presentValues[0]));
    for (let i = 1; i < group.presentValues.length; i++) {
      if (normalizeCssValue(String(group.presentValues[i])) !== first) return false;
    }
    return true;
  }

  /** best-fit prop의 불일치 그룹에 대한 진단 정보 수집 */
  private static collectDiagnostics(
    cssKey: string,
    bestProp: string,
    matrix: MatrixEntry[],
    diagnostics: VariantInconsistency[]
  ): void {
    const groups = this.buildPropGroups(bestProp, cssKey, matrix);

    for (const [propValue, group] of groups) {
      if (this.isGroupConsistent(group)) continue;

      // 모든 present 값이 동일하면 absent만 있는 경우 → 디자인 실수 아님
      if (group.presentValues.length > 0) {
        const first = normalizeCssValue(String(group.presentValues[0]));
        const allSame = group.presentValues.every(
          (v) => normalizeCssValue(String(v)) === first
        );
        if (allSame) continue;
      }

      // 불일치 그룹 — variant 상세 수집
      const variants: VariantInconsistency["variants"] = [];
      for (const entry of group.entries) {
        if (!(cssKey in entry.style)) continue;
        const props: Record<string, string> = {};
        for (const [k, v] of entry.propValues) {
          props[k] = v;
        }
        variants.push({
          props,
          value: normalizeCssValue(String(entry.style[cssKey])),
        });
      }

      // 다수결로 expectedValue 결정
      const valueCounts = new Map<string, number>();
      for (const v of variants) {
        valueCounts.set(v.value, (valueCounts.get(v.value) || 0) + 1);
      }
      let maxCount = 0;
      let maxValue: string | null = null;
      let isTie = false;
      for (const [val, count] of valueCounts) {
        if (count > maxCount) {
          maxCount = count;
          maxValue = val;
          isTie = false;
        } else if (count === maxCount) {
          isTie = true;
        }
      }

      diagnostics.push({
        cssProperty: cssKey,
        propName: bestProp,
        propValue,
        variants,
        expectedValue: isTie ? null : maxValue,
      });
    }
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
