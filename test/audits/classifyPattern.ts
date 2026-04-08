import type { DisjointPair } from "./detectDisjointVariants";

export type PatternLabel =
  | "size-variant-reject"
  | "variant-prop-position"
  | "unknown";

/**
 * DisjointPair를 §1.1 패턴 중 하나로 분류.
 *
 * 매우 단순한 휴리스틱:
 * - 두 형제 양쪽의 variantName을 각각 파싱해 prop 집합으로 만든다
 * - 두 형제에 걸쳐 값이 다른 prop이 정확히 하나이고:
 *   - 그 prop 이름이 Size 또는 다른 enum 느낌이면 → size-variant-reject
 *   - 그 prop 값이 True/False boolean이면 → variant-prop-position
 * - 그 외 → unknown
 *
 * 이 분류는 Phase 0 리포트의 "분포 감각"을 주기 위한 것이며,
 * 정밀 분류는 Phase 1 이후 신호 단위 로그로 보강한다.
 */
export function classifyPattern(pair: DisjointPair): PatternLabel {
  const propsA = parseVariantProps(pair.variantsA[0]);
  const propsB = parseVariantProps(pair.variantsB[0]);
  if (!propsA || !propsB) return "unknown";

  const allKeys = new Set([...propsA.keys(), ...propsB.keys()]);
  const diffKeys: string[] = [];
  for (const key of allKeys) {
    if (propsA.get(key) !== propsB.get(key)) diffKeys.push(key);
  }
  if (diffKeys.length !== 1) return "unknown";

  const diffKey = diffKeys[0];
  const valA = propsA.get(diffKey);
  const valB = propsB.get(diffKey);
  if (isBoolean(valA) && isBoolean(valB)) return "variant-prop-position";
  if (/^size$/i.test(diffKey)) return "size-variant-reject";
  return "unknown";
}

function parseVariantProps(variantName: string): Map<string, string> | null {
  if (!variantName) return null;
  const pairs = variantName.split(",").map((s) => s.trim());
  const map = new Map<string, string>();
  for (const p of pairs) {
    const eq = p.indexOf("=");
    if (eq < 0) return null;
    map.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
  }
  return map.size > 0 ? map : null;
}

function isBoolean(v: string | undefined): boolean {
  return v === "True" || v === "False" || v === "true" || v === "false";
}
