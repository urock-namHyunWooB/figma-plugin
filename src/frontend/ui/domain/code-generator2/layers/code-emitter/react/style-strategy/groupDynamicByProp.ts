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

  // 고정 prop 제거: compound 키에서 값이 1종류뿐인 차원을 제거
  eliminateFixedPropsFromCompoundKeys(result);

  return result;
}

/**
 * compound 키(예: "size+iconOnly")에서 값이 1종류뿐인 prop을 제거.
 * branch 안에서 branchProp은 모든 entry에서 같은 값이므로 키에 불필요.
 */
function eliminateFixedPropsFromCompoundKeys(result: DecomposedResult): void {
  for (const [propName, valueMap] of [...result.entries()]) {
    if (!propName.includes("+")) continue;

    const parts = propName.split("+");
    if (parts.length < 2) continue;

    // 각 차원별 고유 값 수집
    const dimValues: Set<string>[] = parts.map(() => new Set<string>());
    for (const compoundValue of valueMap.keys()) {
      const vals = compoundValue.split("+");
      for (let i = 0; i < parts.length && i < vals.length; i++) {
        dimValues[i].add(vals[i]);
      }
    }

    // 값이 1종류인 차원 찾기
    const fixedIndices = new Set<number>();
    for (let i = 0; i < parts.length; i++) {
      if (dimValues[i].size <= 1) {
        fixedIndices.add(i);
      }
    }

    if (fixedIndices.size === 0) continue;

    // 고정 차원 제거한 새 키 생성
    const remainingParts = parts.filter((_, i) => !fixedIndices.has(i));
    if (remainingParts.length === 0) continue; // 모든 차원이 고정이면 건드리지 않음

    const newPropName = remainingParts.join("+");

    // 기존 엔트리를 새 키로 이동
    const newValueMap: Map<string, DecomposedValue> = new Map();
    for (const [compoundValue, decomposed] of valueMap) {
      const vals = compoundValue.split("+");
      const newValue = vals.filter((_, i) => !fixedIndices.has(i)).join("+");
      if (!newValueMap.has(newValue)) {
        newValueMap.set(newValue, decomposed);
      } else {
        // 같은 키로 합쳐지면 스타일 병합
        const existing = newValueMap.get(newValue)!;
        for (const [k, v] of Object.entries(decomposed.style)) {
          if (!(k in existing.style)) existing.style[k] = v;
        }
        if (decomposed.pseudo) {
          if (!existing.pseudo) {
            existing.pseudo = clonePseudo(decomposed.pseudo);
          } else {
            for (const [pc, pcStyle] of Object.entries(decomposed.pseudo)) {
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

    result.delete(propName);
    // 기존에 같은 이름의 키가 있으면 병합
    if (result.has(newPropName)) {
      const existingMap = result.get(newPropName)!;
      for (const [val, decomposed] of newValueMap) {
        if (!existingMap.has(val)) {
          existingMap.set(val, decomposed);
        } else {
          const existing = existingMap.get(val)!;
          for (const [k, v] of Object.entries(decomposed.style)) {
            if (!(k in existing.style)) existing.style[k] = v;
          }
        }
      }
    } else {
      result.set(newPropName, newValueMap);
    }
  }
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
