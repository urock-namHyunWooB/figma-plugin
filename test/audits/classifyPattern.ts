import type { DisjointPair } from "./detectDisjointVariants";

export type PatternLabel =
  | "size-variant-reject"
  | "variant-prop-position"
  | "same-name-same-type" // 매우 강한 회귀 신호 — 같은 이름+같은 type
  | "same-name-cross-type" // 강한 회귀 신호 — 같은 이름이지만 type 다름 (refactor 가능성)
  | "different-type" // 거의 확실한 distinct — 타입 자체가 다름
  | "different-name" // 아마도 distinct — 이름이 명백히 다름 (다른 노드)
  | "unknown";

const SHAPE_TYPES = new Set([
  "RECTANGLE", "VECTOR", "ELLIPSE", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
]);
const CONTAINER_TYPES = new Set(["GROUP", "FRAME"]);

/**
 * DisjointPair를 패턴별로 분류 (Phase 3 정교화).
 *
 * 우선순위 (위가 먼저 매칭):
 * 1. variantName 단일 prop diff 분석:
 *    - boolean diff → variant-prop-position
 *    - Size 관련 diff → size-variant-reject
 * 2. 노드 metadata 기반 분류:
 *    - 같은 이름 + 호환 type → same-name-same-type (강한 회귀 신호)
 *    - 같은 이름 + 호환 안 되는 type → same-name-cross-type
 *    - 다른 이름 + 호환 안 되는 type → different-type (distinct)
 *    - 다른 이름 + 호환 type → different-name (likely distinct)
 * 3. 그 외 → unknown
 *
 * "호환 type" 정의:
 * - 동일 type
 * - 둘 다 SHAPE_TYPES (cross-shape)
 * - 둘 다 CONTAINER_TYPES (GROUP↔FRAME)
 */
export function classifyPattern(pair: DisjointPair): PatternLabel {
  // Step 1: variantName diff 분석 (기존 로직)
  const propsA = parseVariantProps(pair.variantsA[0]);
  const propsB = parseVariantProps(pair.variantsB[0]);
  if (propsA && propsB) {
    const allKeys = new Set([...propsA.keys(), ...propsB.keys()]);
    const diffKeys: string[] = [];
    for (const key of allKeys) {
      if (propsA.get(key) !== propsB.get(key)) diffKeys.push(key);
    }
    if (diffKeys.length === 1) {
      const diffKey = diffKeys[0];
      const valA = propsA.get(diffKey);
      const valB = propsB.get(diffKey);
      if (isBoolean(valA) && isBoolean(valB)) return "variant-prop-position";
      if (/^size$/i.test(diffKey)) return "size-variant-reject";
    }
  }

  // Step 2: metadata 기반 분류
  const [nodeA, nodeB] = pair.pair;
  const sameName = nodeA.name === nodeB.name;
  const compatibleType = isCompatibleType(nodeA.type, nodeB.type);

  if (sameName && compatibleType) return "same-name-same-type";
  if (sameName && !compatibleType) return "same-name-cross-type";
  if (!compatibleType) return "different-type";
  return "different-name";
}

function isCompatibleType(a: string, b: string): boolean {
  if (a === b) return true;
  if (SHAPE_TYPES.has(a) && SHAPE_TYPES.has(b)) return true;
  if (CONTAINER_TYPES.has(a) && CONTAINER_TYPES.has(b)) return true;
  return false;
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
