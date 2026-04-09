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
 *
 * pseudo-class 데이터도 동일한 cssKeyOwner 매핑을 따라 올바른 prop 그룹에 배치된다.
 */

import type { ConditionNode, PseudoClass, VariantInconsistency } from "../../../types/types";
import { extractAllPropInfos, type PropInfo } from "../../../types/conditionUtils";

/**
 * CSS variable의 fallback 값을 추출하여 비교용 정규화 문자열 반환.
 * 예: "var(--Color-bg-01, #F9F9F9)" → "#F9F9F9"
 * var()가 아니면 원래 값 그대로 반환.
 */
function normalizeCssValue(value: string): string {
  const match = value.match(/^var\([^,]+,\s*(.+)\)$/);
  return match ? match[1].trim() : value;
}

// PropInfo, VariantInconsistency는 types/에서 import
export type { PropInfo } from "../../../types/conditionUtils";
export type { VariantInconsistency } from "../../../types/types";

/** Decompose 결과의 개별 값 (style + optional pseudo) */
export type DecomposedValue = {
  style: Record<string, string | number>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
};

/** Decompose 결과: Map<propName, Map<propValue, DecomposedValue>> */
export type DecomposedResult = Map<string, Map<string, DecomposedValue>>;

/** dynamic entry 입력 타입 */
interface DynamicEntry {
  condition: ConditionNode;
  style: Record<string, string | number>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
  /** fix-assist용 raw figma node id (optional, best-effort) */
  sourceVariantNodeId?: string;
}

interface MatrixEntry {
  propValues: Map<string, string>;
  style: Record<string, string | number>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
  /** fix-assist용 raw figma node id (optional, best-effort) */
  sourceVariantNodeId?: string;
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
   * pseudo-class 데이터도 동일한 cssKeyOwner 매핑을 따라 분배.
   */
  static decompose(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>
  ): DecomposedResult {
    return this.decomposeInternal(dynamic, base);
  }

  /**
   * 자동 판별: UITreeOptimizer가 이미 decompose한 entries면 직접 변환,
   * 아니면 기존 분석 기반 decompose.
   *
   * 판별 기준: multi-prop entries 중 서로 다른 prop set이 존재하면 pre-decomposed.
   */
  static decomposeAuto(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>
  ): DecomposedResult {
    if (this.isPreDecomposed(dynamic)) {
      return this.fromPreDecomposed(dynamic, base);
    }
    return this.decompose(dynamic, base);
  }

  static decomposeAutoWithDiagnostics(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>
  ): { result: DecomposedResult; diagnostics: VariantInconsistency[] } {
    if (this.isPreDecomposed(dynamic)) {
      return { result: this.fromPreDecomposed(dynamic, base), diagnostics: [] };
    }
    return this.decomposeWithDiagnostics(dynamic, base);
  }

  /**
   * UITreeOptimizer가 이미 decompose한 entries인지 판별.
   *
   * UITreeOptimizer decompose 후 rebuild된 entries의 특징:
   * - single-prop(eq) entries와 multi-prop(AND) entries가 공존
   * - multi-prop entries의 prop set이 2종류 이상일 수 있음
   *
   * Normal AND-exploded data는 모든 entries가 동일한 multi-prop AND 조건.
   */
  private static isPreDecomposed(dynamic: DynamicEntry[]): boolean {
    let hasSingle = false;
    let hasMulti = false;
    const propSets = new Set<string>();
    for (const entry of dynamic) {
      const infos = extractAllPropInfos(entry.condition);
      if (infos.length <= 1) {
        hasSingle = true;
      } else {
        hasMulti = true;
        propSets.add(infos.map((p) => p.propName).sort().join("+"));
      }
    }
    // single + multi 공존 → UITreeOptimizer가 decompose한 결과
    if (hasSingle && hasMulti) return true;
    // multi-prop의 prop set이 2종류 이상
    if (propSets.size > 1) return true;
    return false;
  }

  /**
   * UITreeOptimizer가 이미 decompose한 dynamic entries를 직접 DecomposedResult로 변환.
   *
   * 단일 prop 조건 → result[propName][propValue]
   * 다중 prop AND 조건 → result[prop1+prop2+...][val1+val2+...]
   *
   * 재분석하지 않으므로 compound 탐지 실패 문제가 없다.
   */
  static fromPreDecomposed(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>
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
          ...(pseudo && { pseudo: this.clonePseudo(pseudo) }),
        });
      } else {
        const existing = propMap.get(propValue)!;
        for (const [k, v] of Object.entries(style)) {
          if (!(k in existing.style)) existing.style[k] = v;
        }
        if (pseudo) this.mergePseudoInto(existing, pseudo);
      }
    }

    // 후처리: 모든 variant 값이 동일한 CSS 속성 제거
    this.removeUniformProperties(result, base);

    return result;
  }

  /**
   * decompose + variant 불일치 진단 정보 반환.
   *
   * AND 조건에서 어떤 prop도 CSS 속성을 완전히 제어하지 못할 때,
   * 가장 적합한 축(best-fit)에 배치하고 불일치 그룹을 diagnostics로 보고한다.
   */
  static decomposeWithDiagnostics(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>
  ): {
    result: DecomposedResult;
    diagnostics: VariantInconsistency[];
  } {
    const diagnostics: VariantInconsistency[] = [];
    const result = this.decomposeInternal(dynamic, base, diagnostics);
    return { result, diagnostics };
  }

  private static decomposeInternal(
    dynamic: DynamicEntry[],
    base?: Record<string, string | number>,
    diagnostics?: VariantInconsistency[]
  ): DecomposedResult {
    const result: DecomposedResult = new Map();

    // 단일 prop vs 다중 prop 분리
    const singlePropEntries: DynamicEntry[] = [];
    const multiPropEntries: DynamicEntry[] = [];

    for (const entry of dynamic) {
      const propInfos = extractAllPropInfos(entry.condition);
      if (propInfos.length <= 1) {
        singlePropEntries.push(entry);
      } else {
        multiPropEntries.push(entry);
      }
    }

    // 단일 prop: 같은 condition이면 스타일 병합
    for (const { condition, style, pseudo } of singlePropEntries) {
      const propInfos = extractAllPropInfos(condition);
      for (const { propName, propValue } of propInfos) {
        if (!result.has(propName)) {
          result.set(propName, new Map());
        }
        if (!result.get(propName)!.has(propValue)) {
          result.get(propName)!.set(propValue, {
            style: { ...style },
            ...(pseudo && { pseudo: this.clonePseudo(pseudo) }),
          });
        } else {
          // 기존 속성 보존, 새 속성만 추가 (first-write per property)
          const existing = result.get(propName)!.get(propValue)!;
          for (const [k, v] of Object.entries(style)) {
            if (!(k in existing.style)) {
              existing.style[k] = v;
            }
          }
          // pseudo 병합
          if (pseudo) {
            this.mergePseudoInto(existing, pseudo);
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
  /** @deprecated conditionUtils.extractAllPropNames 사용 */
  static extractAllPropNames(condition: ConditionNode): string[] {
    return extractAllPropInfos(condition).map((p) => p.propName);
  }

  /** @deprecated conditionUtils.extractAllPropInfos 사용 */
  static extractAllPropInfos(condition: ConditionNode): PropInfo[] {
    return extractAllPropInfos(condition);
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * pseudo 데이터를 기존 DecomposedValue에 병합.
   */
  private static mergePseudoInto(
    existing: DecomposedValue,
    pseudo: Partial<Record<PseudoClass, Record<string, string | number>>>
  ): void {
    if (!existing.pseudo) {
      existing.pseudo = this.clonePseudo(pseudo);
    } else {
      for (const [pc, pcStyle] of Object.entries(pseudo)) {
        const pcKey = pc as PseudoClass;
        if (!existing.pseudo[pcKey]) {
          existing.pseudo[pcKey] = { ...pcStyle };
        } else {
          Object.assign(existing.pseudo[pcKey]!, pcStyle);
        }
      }
    }
  }

  /**
   * pseudo 데이터 얕은 복제 (원본 변형 방지).
   */
  private static clonePseudo(
    pseudo: Partial<Record<PseudoClass, Record<string, string | number>>>
  ): Partial<Record<PseudoClass, Record<string, string | number>>> {
    const clone: Partial<Record<PseudoClass, Record<string, string | number>>> = {};
    for (const [pc, pcStyle] of Object.entries(pseudo)) {
      clone[pc as PseudoClass] = { ...pcStyle };
    }
    return clone;
  }

  /**
   * 모든 variant 값에서 동일한 CSS 속성을 제거.
   *
   * 예: activeStyles = { true: { opacity: 0.43 }, false: { opacity: 0.43 } }
   * → opacity가 양쪽 동일 → active가 opacity를 제어하지 않음 → 제거.
   * 결과적으로 빈 스타일 객체가 되면 해당 prop 그룹 전체 제거.
   */
  private static removeUniformProperties(
    result: DecomposedResult,
    base?: Record<string, string | number>
  ): void {
    for (const [propName, valueMap] of result) {
      if (valueMap.size <= 1) continue;

      // 모든 CSS 키 수집
      const allCssKeys = new Set<string>();
      for (const dv of valueMap.values()) {
        for (const key of Object.keys(dv.style)) {
          allCssKeys.add(key);
        }
      }

      // 각 CSS 키: 모든 variant에서 동일한 값이면 제거
      // 이 prop이 해당 CSS 속성을 제어하지 않음을 의미
      // 단, base에 해당 속성이 없으면 유일한 source이므로 유지
      for (const cssKey of allCssKeys) {
        const values = new Set<string>();
        let allPresent = true;
        for (const dv of valueMap.values()) {
          if (!(cssKey in dv.style)) {
            allPresent = false;
            break;
          }
          values.add(String(dv.style[cssKey]));
        }
        if (allPresent && values.size === 1) {
          const rawUniformValue = [...valueMap.values()][0].style[cssKey];

          if (base && !(cssKey in base)) {
            // base에 없을 때: 다른 prop 그룹이 이 CSS 키를 소유하는지 확인
            const ownedByOther = [...result.entries()].some(
              ([otherProp, otherMap]) =>
                otherProp !== propName &&
                [...otherMap.values()].some((dv) => cssKey in dv.style)
            );
            if (!ownedByOther) continue; // 유일한 source → 유지

            // uniform 값을 base에 추가 (compound 그룹에 빠진 조합의 fallback)
            base[cssKey] = rawUniformValue;
          }
          // uniform이므로 제거
          for (const dv of valueMap.values()) {
            delete dv.style[cssKey];
          }
        }
      }

      // 빈 스타일 객체 + pseudo 없음인 prop 그룹 제거
      const allEmpty = [...valueMap.values()].every(
        (dv) => Object.keys(dv.style).length === 0 && !dv.pseudo
      );
      if (allEmpty) {
        result.delete(propName);
      }
    }
  }

  /**
   * AND 조건 엔트리들을 CSS 속성별로 제어 prop에 분배.
   * pseudo-class CSS 키도 동일한 cssKeyOwner 매핑을 따라 분배.
   */
  private static decomposeMultiProp(
    entries: DynamicEntry[],
    result: DecomposedResult,
    diagnostics?: VariantInconsistency[]
  ): void {
    // Step 0: prop set별로 분리 — convertStateDynamicToPseudo가 state를 제거한
    // entries(3-prop)와 loading entries(4-prop)가 혼재하면 compound 탐지 실패.
    // 동일 prop set끼리 독립 분석하여 cross-dimension 오염 방지.
    const propSetGroups = new Map<string, DynamicEntry[]>();
    for (const entry of entries) {
      const propInfos = extractAllPropInfos(entry.condition);
      const key = propInfos.map((p) => p.propName).sort().join("+");
      if (!propSetGroups.has(key)) propSetGroups.set(key, []);
      propSetGroups.get(key)!.push(entry);
    }
    if (propSetGroups.size > 1) {
      for (const groupEntries of propSetGroups.values()) {
        this.decomposeMultiProp(groupEntries, result, diagnostics);
      }
      return;
    }

    // Step 0.5: 같은 prop set 내에서 CSS key set이 다른 entries 병합.
    // convertStateDynamicToPseudo가 compound(background)와 nonStateVarying(height)를
    // 별도 entries로 분리하면 decomposer에서 absent 오염 발생.
    // 같은 condition의 entries를 하나로 병합하여 absent를 제거.
    let mergedEntries = entries;
    if (entries.length >= 2) {
      const conditionMap = new Map<string, DynamicEntry>();
      let hasMerges = false;
      for (const entry of entries) {
        const condKey = JSON.stringify(entry.condition);
        if (conditionMap.has(condKey)) {
          const existing = conditionMap.get(condKey)!;
          Object.assign(existing.style, entry.style);
          if (entry.pseudo) {
            if (!existing.pseudo) {
              existing.pseudo = entry.pseudo;
            } else {
              for (const [pc, pcStyle] of Object.entries(entry.pseudo)) {
                (existing.pseudo as any)[pc] = { ...((existing.pseudo as any)[pc] || {}), ...(pcStyle as any) };
              }
            }
          }
          hasMerges = true;
        } else {
          conditionMap.set(condKey, {
            condition: entry.condition,
            style: { ...entry.style },
            ...(entry.pseudo && { pseudo: JSON.parse(JSON.stringify(entry.pseudo)) }),
            ...(entry.sourceVariantNodeId && { sourceVariantNodeId: entry.sourceVariantNodeId }),
          });
        }
      }
      if (hasMerges) {
        mergedEntries = [...conditionMap.values()];
      }
    }

    // Step 1: matrix 구성 — 각 엔트리의 prop→value 매핑과 스타일
    const matrix: MatrixEntry[] = mergedEntries.map((entry) => ({
      propValues: this.extractPropValueMap(entry.condition),
      style: entry.style,
      ...(entry.pseudo && { pseudo: entry.pseudo }),
      ...(entry.sourceVariantNodeId && { sourceVariantNodeId: entry.sourceVariantNodeId }),
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

    // pseudo에만 존재하는 CSS 키도 cssKeyOwner에 추가
    // (style에 같은 CSS 키가 있으면 그 owner를 따름, 없으면 별도 분석)
    const pseudoCssKeys = new Set<string>();
    for (const entry of matrix) {
      if (!entry.pseudo) continue;
      for (const pcStyle of Object.values(entry.pseudo)) {
        for (const key of Object.keys(pcStyle as Record<string, string | number>)) {
          if (!cssKeyOwner.has(key)) {
            pseudoCssKeys.add(key);
          }
        }
      }
    }
    // pseudo-only CSS 키: style의 같은 키가 이미 owner를 가지면 그것을 사용,
    // 없으면 findControllingProp으로 분석 (pseudo 값을 style처럼 취급)
    for (const cssKey of pseudoCssKeys) {
      // pseudo 값을 matrix의 style로 임시 투영하여 controlling prop 분석
      const pseudoMatrix: MatrixEntry[] = matrix
        .filter((e) => {
          if (!e.pseudo) return false;
          for (const pcStyle of Object.values(e.pseudo)) {
            if (cssKey in (pcStyle as Record<string, string | number>)) return true;
          }
          return false;
        })
        .map((e) => {
          // pseudo에서 해당 CSS 키의 값을 style로 투영
          let val: string | number = "";
          for (const pcStyle of Object.values(e.pseudo!)) {
            if (cssKey in (pcStyle as Record<string, string | number>)) {
              val = (pcStyle as Record<string, string | number>)[cssKey];
              break;
            }
          }
          return { propValues: e.propValues, style: { [cssKey]: val } };
        });
      if (pseudoMatrix.length > 0) {
        const owner = this.findControllingProp(cssKey, pseudoMatrix, allProps);
        cssKeyOwner.set(cssKey, owner);
      }
    }

    // Step 5: 결과 맵 구성 — 각 엔트리에서 소유 prop에 해당하는 CSS 속성만 배치
    for (const entry of matrix) {
      for (const [propName, propValue] of entry.propValues) {
        // 이 prop이 소유하는 CSS 속성만 수집 (compound owner는 건너뜀)
        const ownedStyle: Record<string, string | number> = {};
        for (const [cssKey, cssValue] of Object.entries(entry.style)) {
          if (cssKeyOwner.get(cssKey) === propName) {
            ownedStyle[cssKey] = cssValue;
          }
        }

        // pseudo CSS 키도 cssKeyOwner에 따라 분배
        let ownedPseudo: Partial<Record<PseudoClass, Record<string, string | number>>> | undefined;
        if (entry.pseudo) {
          for (const [pc, pcStyle] of Object.entries(entry.pseudo)) {
            for (const [cssKey, cssValue] of Object.entries(pcStyle as Record<string, string | number>)) {
              if (cssKeyOwner.get(cssKey) === propName) {
                if (!ownedPseudo) ownedPseudo = {};
                const pcKey = pc as PseudoClass;
                if (!ownedPseudo[pcKey]) ownedPseudo[pcKey] = {};
                ownedPseudo[pcKey]![cssKey] = cssValue;
              }
            }
          }
        }

        if (Object.keys(ownedStyle).length === 0 && !ownedPseudo) continue;

        if (!result.has(propName)) {
          result.set(propName, new Map());
        }
        const propMap = result.get(propName)!;

        if (!propMap.has(propValue)) {
          propMap.set(propValue, {
            style: ownedStyle,
            ...(ownedPseudo && { pseudo: ownedPseudo }),
          });
        } else {
          // 이미 존재하면 merge (단일 prop 엔트리가 먼저 들어갔을 수 있음)
          const existing = propMap.get(propValue)!;
          Object.assign(existing.style, ownedStyle);
          if (ownedPseudo) {
            this.mergePseudoInto(existing, ownedPseudo);
          }
        }
      }
    }

    // Step 5b: compound owner 처리 — "propA+propB" 형태의 복합 키
    const compoundOwners = new Set(
      [...cssKeyOwner.values()].filter((o) => o.includes("+"))
    );
    for (const owner of compoundOwners) {
      const parts = owner.split("+");
      if (!result.has(owner)) result.set(owner, new Map());
      const propMap = result.get(owner)!;

      for (const entry of matrix) {
        const values = parts.map((p) => entry.propValues.get(p));
        if (values.some((v) => v === undefined)) continue;
        const compoundValue = values.join("+");

        const ownedStyle: Record<string, string | number> = {};
        for (const [cssKey, cssValue] of Object.entries(entry.style)) {
          if (cssKeyOwner.get(cssKey) === owner) {
            ownedStyle[cssKey] = cssValue;
          }
        }

        // compound owner의 pseudo 분배
        let ownedPseudo: Partial<Record<PseudoClass, Record<string, string | number>>> | undefined;
        if (entry.pseudo) {
          for (const [pc, pcStyle] of Object.entries(entry.pseudo)) {
            for (const [cssKey, cssValue] of Object.entries(pcStyle as Record<string, string | number>)) {
              if (cssKeyOwner.get(cssKey) === owner) {
                if (!ownedPseudo) ownedPseudo = {};
                const pcKey = pc as PseudoClass;
                if (!ownedPseudo[pcKey]) ownedPseudo[pcKey] = {};
                ownedPseudo[pcKey]![cssKey] = cssValue;
              }
            }
          }
        }

        if (Object.keys(ownedStyle).length === 0 && !ownedPseudo) continue;

        if (!propMap.has(compoundValue)) {
          propMap.set(compoundValue, {
            style: ownedStyle,
            ...(ownedPseudo && { pseudo: ownedPseudo }),
          });
        } else {
          const existing = propMap.get(compoundValue)!;
          for (const [k, v] of Object.entries(ownedStyle)) {
            if (!(k in existing.style)) existing.style[k] = v;
          }
          if (ownedPseudo) {
            this.mergePseudoInto(existing, ownedPseudo);
          }
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
        // Owner-scoped 안전망 audit (선정된 prop 그룹 내 숨은 불일치 재확인)
        if (diagnostics) {
          this.auditOwnerConsistency(cssKey, propName, matrix, diagnostics);
        }
        return propName;
      }
    }

    // 2차: 복합 prop — N-prop 조합이 일관적인지 확인 (2-prop → 3-prop 순)
    // 같은 prop 수에서 여러 후보가 consistent하면 그룹 수가 최소인 것 선택
    // (불필요한 prop이 포함된 compound는 그룹이 더 많아짐)
    if (allProps.length >= 2) {
      const n = allProps.length;

      // 2-prop compound
      let best2: { name: string; groups: number } | null = null;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (this.isCompoundConsistent([allProps[i], allProps[j]], cssKey, matrix)) {
            const groupCount = this.countCompoundGroups([allProps[i], allProps[j]], matrix);
            const name = `${allProps[i]}+${allProps[j]}`;
            if (!best2 || groupCount < best2.groups) {
              best2 = { name, groups: groupCount };
            }
          }
        }
      }
      if (best2) return best2.name;

      // 3-prop compound
      if (n >= 3) {
        let best3: { name: string; groups: number } | null = null;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            for (let k = j + 1; k < n; k++) {
              if (this.isCompoundConsistent([allProps[i], allProps[j], allProps[k]], cssKey, matrix)) {
                const groupCount = this.countCompoundGroups([allProps[i], allProps[j], allProps[k]], matrix);
                const name = `${allProps[i]}+${allProps[j]}+${allProps[k]}`;
                if (!best3 || groupCount < best3.groups) {
                  best3 = { name, groups: groupCount };
                }
              }
            }
          }
        }
        if (best3) return best3.name;
      }
    }

    // 3차: best-fit — 일관적 그룹 비율이 가장 높은 prop 선택
    let bestRatio = -1;
    const tiedProps: string[] = [];

    for (const propName of allProps) {
      const groups = this.buildPropGroups(propName, cssKey, matrix);
      if (groups.size <= 1) continue;

      let consistentCount = 0;
      for (const group of groups.values()) {
        if (this.isGroupConsistent(group)) consistentCount++;
      }
      const ratio = consistentCount / groups.size;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        tiedProps.length = 0;
        tiedProps.push(propName);
      } else if (ratio === bestRatio) {
        tiedProps.push(propName);
      }
    }

    const bestProp = tiedProps[0] ?? allProps[0];

    // diagnostics 수집: 동률인 모든 prop의 불일치 그룹 보고
    if (diagnostics) {
      for (const prop of tiedProps) {
        this.collectDiagnostics(cssKey, prop, matrix, diagnostics);
      }
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

  /**
   * N개 prop의 복합 조합이 CSS 속성을 일관적으로 제어하는지 확인.
   * 예: [style, tone] → style=filled + tone=blue 조합에서 background가 항상 동일한 값
   */
  private static isCompoundConsistent(
    props: string[],
    cssKey: string,
    matrix: MatrixEntry[]
  ): boolean {
    const groups = new Map<string, PropGroup>();

    for (const entry of matrix) {
      const values = props.map((p) => entry.propValues.get(p));
      if (values.some((v) => v === undefined)) continue;

      const compoundKey = values.join("+");
      if (!groups.has(compoundKey)) {
        groups.set(compoundKey, { entries: [], presentValues: [], absentCount: 0 });
      }

      const group = groups.get(compoundKey)!;
      group.entries.push(entry);

      if (cssKey in entry.style) {
        group.presentValues.push(entry.style[cssKey]);
      } else {
        group.absentCount++;
      }
    }

    if (groups.size <= 1) return false;

    // 각 그룹 내부 일관성 검증
    let hasMultiEntryGroup = false;
    for (const group of groups.values()) {
      if (!this.isGroupConsistent(group)) return false;
      if (group.entries.length > 1) hasMultiEntryGroup = true;
    }
    // 모든 그룹이 1 entry면 단순 열거일 수 있음.
    // 단, 그룹 수 < 전체 entry 수이면 compound가 실제로 entry를 묶고 있으므로 유효.
    // (누락된 조합이 있어서 1 entry 그룹이 생긴 경우)
    if (!hasMultiEntryGroup && groups.size >= matrix.length) return false;

    // 그룹 간 차이가 있어야 "제어"한다고 판단
    const signatures = new Set<string>();
    for (const group of groups.values()) {
      if (group.presentValues.length > 0) {
        signatures.add(normalizeCssValue(String(group.presentValues[0])));
      } else {
        signatures.add("__absent__");
      }
    }
    if (signatures.size <= 1) return false;

    // 모든 prop이 필수인지 검증: 각 prop을 제거해도 consistent하면 불필요한 prop
    // 불필요한 prop이 있으면 이 compound는 과도하게 넓음 → 거부
    if (props.length >= 2) {
      for (let i = 0; i < props.length; i++) {
        const subset = [...props.slice(0, i), ...props.slice(i + 1)];
        if (subset.length >= 1 && this.isCompoundConsistent(subset, cssKey, matrix)) {
          return false; // subset만으로 충분 → 현재 compound는 불필요한 prop 포함
        }
      }
    }

    return true;
  }

  /** compound 조합이 생성하는 고유 그룹 수 계산 (min-groups 선택용) */
  private static countCompoundGroups(props: string[], matrix: MatrixEntry[]): number {
    const groups = new Set<string>();
    for (const entry of matrix) {
      const values = props.map((p) => entry.propValues.get(p));
      if (values.some((v) => v === undefined)) continue;
      groups.add(values.join("+"));
    }
    return groups.size;
  }

  /** 그룹 내 CSS 값이 모두 동일한지 확인 (absent는 무관으로 처리) */
  private static isGroupConsistent(group: PropGroup): boolean {
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
          ...(entry.sourceVariantNodeId ? { nodeId: entry.sourceVariantNodeId } : {}),
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
   * Owner-scoped 전수 audit.
   * 1차 single-prop FD로 소유자가 결정된 후, 해당 prop의 모든 값 그룹이
   * 실제로 내부 일관적인지 재검증하여 숨은 불일치를 진단으로 수집한다.
   *
   * isPropConsistentForCssKey가 true를 반환한 경우 진단이 추가될 가능성은
   * 낮지만 (같은 isGroupConsistent를 사용), normalize edge case나 향후
   * 분기 차이에 대한 안전망으로 남긴다. 또한 향후 전수 검사 경로 승격을
   * 위한 구조적 진입점.
   */
  private static auditOwnerConsistency(
    cssKey: string,
    ownerProp: string,
    matrix: MatrixEntry[],
    diagnostics: VariantInconsistency[]
  ): void {
    const groups = this.buildPropGroups(ownerProp, cssKey, matrix);

    for (const [propValue, group] of groups) {
      if (this.isGroupConsistent(group)) continue;

      // absent-only/모두 동일은 디자인 실수 아님
      if (group.presentValues.length > 0) {
        const first = normalizeCssValue(String(group.presentValues[0]));
        const allSame = group.presentValues.every(
          (v) => normalizeCssValue(String(v)) === first
        );
        if (allSame) continue;
      }

      const variants: VariantInconsistency["variants"] = [];
      for (const entry of group.entries) {
        if (!(cssKey in entry.style)) continue;
        const props: Record<string, string> = {};
        for (const [k, v] of entry.propValues) props[k] = v;
        variants.push({
          props,
          value: normalizeCssValue(String(entry.style[cssKey])),
          ...(entry.sourceVariantNodeId ? { nodeId: entry.sourceVariantNodeId } : {}),
        });
      }

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
        propName: ownerProp,
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
    const infos = extractAllPropInfos(condition);
    for (const { propName, propValue } of infos) {
      map.set(propName, propValue);
    }
    return map;
  }
}
