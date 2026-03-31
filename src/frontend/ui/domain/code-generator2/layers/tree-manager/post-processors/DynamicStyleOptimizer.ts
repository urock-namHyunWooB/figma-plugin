/**
 * DynamicStyleOptimizer
 *
 * Decomposer 전에 dynamic entries를 최적화.
 * 중복 제거 및 단순화를 통해 decomposer에 깨끗한 입력 제공.
 *
 * 최적화:
 * 1. pseudo 중복 제거: hover/active 값이 base와 동일하면 제거
 * 2. 동일 스타일 entry 병합: 같은 CSS를 가진 entry들의 조건 단순화
 */

import type { ConditionNode, PseudoClass } from "../../../types/types";

interface DynamicEntry {
  condition: ConditionNode;
  style: Record<string, string | number>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
}

export class DynamicStyleOptimizer {
  /**
   * dynamic entries를 최적화하여 반환
   */
  static optimize(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>
  ): DynamicEntry[] {
    let result = dynamic;
    result = this.removeRedundantPseudo(result);
    // mergeIdenticalStyles는 decomposer 결과에 영향을 줘서 비활성화
    // TODO: decomposer 이후에 조건 단순화하는 방식으로 재구현
    result = this.removeEmptyEntries(result);
    return result;
  }

  /**
   * pseudo 값이 base style과 동일하면 제거
   *
   * 예: hover의 box-shadow가 default의 box-shadow와 같으면
   * hover:shadow-[...] 를 출력할 필요 없음
   */
  private static removeRedundantPseudo(entries: DynamicEntry[]): DynamicEntry[] {
    return entries.map((entry) => {
      if (!entry.pseudo) return entry;

      const cleanedPseudo: Partial<Record<PseudoClass, Record<string, string | number>>> = {};
      let hasAnyPseudo = false;

      for (const [pseudoKey, pseudoStyle] of Object.entries(entry.pseudo)) {
        const cleanedStyle: Record<string, string | number> = {};
        let hasAnyProp = false;

        for (const [prop, val] of Object.entries(pseudoStyle as Record<string, string | number>)) {
          // pseudo 값이 같은 entry의 base style과 다르면 유지
          if (entry.style[prop] !== val) {
            cleanedStyle[prop] = val;
            hasAnyProp = true;
          }
        }

        if (hasAnyProp) {
          cleanedPseudo[pseudoKey as PseudoClass] = cleanedStyle;
          hasAnyPseudo = true;
        }
      }

      if (!hasAnyPseudo) {
        const { pseudo: _, ...rest } = entry;
        return rest;
      }

      return { ...entry, pseudo: cleanedPseudo };
    });
  }

  /**
   * 동일한 style+pseudo를 가진 entry들의 조건을 단순화.
   *
   * 예: AND(state=loading, size=L, style=filled) → {font: Pretendard}
   *     AND(state=default, size=L, style=filled) → {font: Pretendard}
   * → AND(size=L, style=filled) → {font: Pretendard}  (state 제거)
   */
  private static mergeIdenticalStyles(entries: DynamicEntry[]): DynamicEntry[] {
    // style+pseudo를 직렬화하여 그룹핑
    const groups = new Map<string, DynamicEntry[]>();
    for (const entry of entries) {
      const key = this.serializeStyleAndPseudo(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const result: DynamicEntry[] = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        result.push(group[0]);
        continue;
      }

      // AND 조건만 처리 (단일 eq는 병합 불필요)
      const andEntries = group.filter(
        (e) => e.condition.type === "and" && (e.condition as any).conditions
      );
      const nonAndEntries = group.filter(
        (e) => e.condition.type !== "and" || !(e.condition as any).conditions
      );

      if (andEntries.length <= 1) {
        result.push(...group);
        continue;
      }

      // 각 AND 조건의 prop→value 맵 추출
      const condMaps = andEntries.map((e) => this.extractConditionProps(e.condition));
      if (condMaps.some((m) => !m)) {
        result.push(...group);
        continue;
      }

      // 공통 prop 찾기 (모든 entry에서 같은 값)
      const commonProps = new Map<string, string>();
      const firstMap = condMaps[0]!;
      for (const [prop, val] of firstMap) {
        if (condMaps.every((m) => m!.get(prop) === val)) {
          commonProps.set(prop, val);
        }
      }

      // 공통 prop만으로 조건 재구성 (차이 나는 prop 제거)
      if (commonProps.size > 0 && commonProps.size < firstMap.size) {
        const newConditions: ConditionNode[] = [...commonProps.entries()].map(
          ([prop, value]) => ({ type: "eq" as const, prop, value })
        );
        const newCondition: ConditionNode =
          newConditions.length === 1
            ? newConditions[0]
            : { type: "and", conditions: newConditions };

        result.push({
          condition: newCondition,
          style: { ...group[0].style },
          ...(group[0].pseudo && { pseudo: group[0].pseudo }),
        });
      } else {
        // 공통 prop이 없거나 전부 공통 → 원본 유지
        result.push(...andEntries);
      }

      result.push(...nonAndEntries);
    }

    return result;
  }

  /** style+pseudo를 직렬화 (비교용) */
  private static serializeStyleAndPseudo(entry: DynamicEntry): string {
    const parts = [JSON.stringify(entry.style, Object.keys(entry.style).sort())];
    if (entry.pseudo) {
      parts.push(JSON.stringify(entry.pseudo, Object.keys(entry.pseudo).sort()));
    }
    return parts.join("|");
  }

  /** AND 조건에서 prop→value 맵 추출 */
  private static extractConditionProps(
    condition: ConditionNode
  ): Map<string, string> | null {
    if (condition.type === "eq") {
      return new Map([[condition.prop, condition.value]]);
    }
    if (condition.type === "and" && (condition as any).conditions) {
      const map = new Map<string, string>();
      for (const c of (condition as any).conditions) {
        if (c.type === "eq") {
          map.set(c.prop, c.value);
        } else if (c.type === "and" && c.conditions) {
          // 중첩 AND 풀기
          for (const inner of c.conditions) {
            if (inner.type === "eq") {
              map.set(inner.prop, inner.value);
            }
          }
        } else {
          return null; // 지원하지 않는 조건 구조
        }
      }
      return map;
    }
    return null;
  }

  /**
   * style과 pseudo가 모두 비어있는 entry 제거
   */
  private static removeEmptyEntries(entries: DynamicEntry[]): DynamicEntry[] {
    return entries.filter((entry) => {
      const hasStyle = Object.keys(entry.style).length > 0;
      const hasPseudo = entry.pseudo && Object.keys(entry.pseudo).some(
        (k) => Object.keys((entry.pseudo as any)[k]).length > 0
      );
      return hasStyle || hasPseudo;
    });
  }
}
