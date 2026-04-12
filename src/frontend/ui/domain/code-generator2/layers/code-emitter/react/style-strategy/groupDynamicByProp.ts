/**
 * groupDynamicByProp
 *
 * UITreeOptimizer가 이미 decompose한 dynamic entries를
 * prop별 스타일 맵으로 그룹화하는 유틸리티.
 *
 * DynamicStyleDecomposer의 FD 분석 없이 단순 포맷 변환만 수행.
 * (dynamic[] → Map<propName, Map<propValue, {style, pseudo?}>>)
 */

import type { ConditionNode, PseudoClass } from "../../../../types/types";
import { extractAllPropInfos } from "../../../../types/conditionUtils";

export type DecomposedValue = {
  style: Record<string, string | number>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
};

export type DecomposedResult = Map<string, Map<string, DecomposedValue>>;

interface DynamicEntry {
  condition: ConditionNode;
  style: Record<string, string | number>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
}

/**
 * dynamic entries를 prop별 스타일 맵으로 그룹화.
 *
 * 단일 prop 조건(eq) → result[propName][propValue]
 * 다중 prop AND 조건 → result[prop1+prop2+...][val1+val2+...]
 */
export function groupDynamicByProp(
  dynamic: DynamicEntry[]
): DecomposedResult {
  const result: DecomposedResult = new Map();

  for (const { condition, style, pseudo } of dynamic) {
    const propInfos = extractAllPropInfos(condition);
    if (propInfos.length === 0) continue;

    const propName = propInfos.length === 1
      ? propInfos[0].propName
      : propInfos.map((p) => p.propName).join("+");
    const propValue = propInfos.length === 1
      ? propInfos[0].propValue
      : propInfos.map((p) => p.propValue).join("+");

    if (!result.has(propName)) result.set(propName, new Map());
    const propMap = result.get(propName)!;

    if (!propMap.has(propValue)) {
      propMap.set(propValue, {
        style: { ...style },
        ...(pseudo && { pseudo: clonePseudo(pseudo) }),
      });
    } else {
      const existing = propMap.get(propValue)!;
      for (const [k, v] of Object.entries(style)) {
        if (!(k in existing.style)) {
          existing.style[k] = v;
        }
      }
      if (pseudo) {
        if (!existing.pseudo) {
          existing.pseudo = clonePseudo(pseudo);
        } else {
          for (const [pc, pcStyle] of Object.entries(pseudo)) {
            const pcKey = pc as PseudoClass;
            if (!existing.pseudo[pcKey]) {
              existing.pseudo[pcKey] = { ...(pcStyle as Record<string, string | number>) };
            } else {
              Object.assign(existing.pseudo[pcKey]!, pcStyle);
            }
          }
        }
      }
    }
  }

  return result;
}

function clonePseudo(
  pseudo: Partial<Record<PseudoClass, Record<string, string | number>>>
): Partial<Record<PseudoClass, Record<string, string | number>>> {
  const clone: Partial<Record<PseudoClass, Record<string, string | number>>> = {};
  for (const [pc, pcStyle] of Object.entries(pseudo)) {
    clone[pc as PseudoClass] = { ...pcStyle };
  }
  return clone;
}
