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
