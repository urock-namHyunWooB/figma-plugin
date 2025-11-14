export interface DiffResult {
  [key: string]: {
    prev: unknown;
    next: unknown;
  };
}

export const structuralDiff = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): DiffResult => {
  return Object.keys({ ...a, ...b }).reduce<DiffResult>((acc, k) => {
    if (!Object.is(a[k], b[k])) {
      acc[k] = { prev: a[k], next: b[k] };
    }
    return acc;
  }, {});
};

interface Variant {
  key: string;
  props: Record<string, string>;
  value: unknown;
}

export function findPairsEfficient(
  obj: Record<string, unknown>,
): Array<[unknown, unknown]> {
  const variants = Object.keys(obj).map((key): Variant => {
    const props: Record<string, string> = {};
    key.split(", ").forEach((prop) => {
      const [k, v] = prop.split("=");
      props[k.trim()] = v.trim();
    });
    return { key, props, value: obj[key] };
  });

  const propNames = [...new Set(variants.flatMap((v) => Object.keys(v.props)))];

  const pairs: Array<[unknown, unknown]> = [];
  const seen = new Set<string>();

  propNames.forEach((excludeProp) => {
    const groups = new Map<string, Variant[]>();

    variants.forEach((variant) => {
      const groupKey = propNames
        .filter((p) => p !== excludeProp)
        .map((p) => `${p}=${variant.props[p] ?? ""}`)
        .join("|");

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      const group = groups.get(groupKey);
      if (group) {
        group.push(variant);
      }
    });

    groups.forEach((items) => {
      // 그룹 내의 모든 쌍을 생성 (2개 이상일 때)
      if (items.length >= 2) {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const v1 = items[i];
            const v2 = items[j];
            const pairKey = [v1.key, v2.key].sort().join("|||");

            if (!seen.has(pairKey)) {
              seen.add(pairKey);
              pairs.push([v1.value, v2.value]);
            }
          }
        }
      }
    });
  });

  return pairs;
}

/**
 * Spec을 메타 정보로 단순화
 * 복잡한 객체/배열을 구조적 특성으로 변환
 */
function simplifySpec(spec: Record<string, unknown>): Record<string, unknown> {
  const simplified: Record<string, unknown> = {};

  Object.keys(spec).forEach((key) => {
    const value = spec[key];

    // children 배열 처리
    if (key === "children" && Array.isArray(value)) {
      simplified.children = {
        length: value.length,
        types: value.map((child: any) => child?.type || "unknown"),
      };
    }
    // fills/strokes 배열 처리
    else if ((key === "fills" || key === "strokes") && Array.isArray(value)) {
      simplified[key] = value; // 원본 유지 (색상 정보 필요)
      simplified[`${key}_count`] = value.length;
    }
    // 배열이지만 위에서 처리 안된 경우
    else if (Array.isArray(value)) {
      simplified[`${key}_length`] = value.length;
    }
    // 일반 값
    else {
      simplified[key] = value;
    }
  });

  return simplified;
}

/**
 * 각 variant 속성 값별로 공통 특성을 추출
 * 예: type=primary일 때의 특성, Icon=true일 때의 특성 등
 */
export function extractVariantPatterns(obj: Record<string, unknown>) {
  // 1. 모든 variant를 파싱
  const variants = Object.keys(obj).map((key): Variant => {
    const props: Record<string, string> = {};
    key.split(", ").forEach((prop) => {
      const [k, v] = prop.split("=");
      props[k.trim()] = v.trim();
    });
    return { key, props, value: obj[key] };
  });

  // 2. 모든 속성 이름 수집
  const propNames = [...new Set(variants.flatMap((v) => Object.keys(v.props)))];

  // 3. 각 속성별로 값들을 그룹화
  const patterns: Record<string, Record<string, unknown>> = {};

  propNames.forEach((propName) => {
    patterns[propName] = {};

    // 해당 속성의 모든 고유 값 찾기
    const uniqueValues = [
      ...new Set(variants.map((v) => v.props[propName])),
    ].filter(Boolean);

    uniqueValues.forEach((propValue) => {
      // 해당 속성=값 조합을 가진 모든 variant spec 수집
      const matchingSpecs = variants
        .filter((v) => v.props[propName] === propValue)
        .map((v) => v.value);

      // Spec을 단순화해서 공통 패턴 추출
      const simplifiedSpecs = matchingSpecs.map((spec) =>
        simplifySpec(spec as Record<string, unknown>),
      );
      const commonPattern = findCommonPattern(simplifiedSpecs);

      patterns[propName][propValue] = {
        ...commonPattern,
      };
    });
  });

  return patterns;
}

/**
 * 여러 객체들의 공통 패턴 찾기
 */
function findCommonPattern(specs: unknown[]): Record<string, unknown> {
  if (specs.length === 0) return {};
  if (specs.length === 1) return specs[0] as Record<string, unknown>;

  const firstSpec = specs[0] as Record<string, unknown>;
  const common: Record<string, unknown> = {};

  // 첫 번째 spec의 모든 키를 순회
  Object.keys(firstSpec).forEach((key) => {
    const firstValue = firstSpec[key];

    // cornerRadius가 숫자가 아닌 경우 제외 (객체나 figma.mixed 등)
    if (key === "cornerRadius" && typeof firstValue !== "number") {
      return; // 숫자가 아니면 제외
    }

    // 모든 spec에서 동일한 값인지 확인
    const allSame = specs.every((spec) => {
      const s = spec as Record<string, unknown>;
      const value = s[key];

      // cornerRadius가 숫자가 아닌 경우 제외
      if (key === "cornerRadius" && typeof value !== "number") {
        return false;
      }

      return deepEqual(value, firstValue);
    });

    if (allSame) {
      common[key] = firstValue;
    }
  });

  return common;
}

/**
 * 두 값이 깊은 비교에서 같은지 확인
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}
