type Obj = Record<string, any>;

/**
 * 여러 객체에서 공통된 (key, value) 쌍을 제거하고 차이점만 반환
 * 얕은 비교(shallow comparison)를 수행하며, 모든 객체에서 동일한 값을 가진 키는 제거됨
 * @param objs - 비교할 객체들 (가변 인자)
 * @returns 각 객체에서 공통 속성이 제거된 부분 객체 배열
 * @example
 * const [a, b] = removeCommonShallow(
 *   { x: 1, y: 2, z: 3 },
 *   { x: 1, y: 5, z: 3 }
 * );
 * // a = { y: 2 }, b = { y: 5 } (x와 z는 공통이므로 제거됨)
 */
export function removeCommonShallow<T extends Obj>(
  ...objs: T[]
): Array<Partial<T>> {
  if (objs.length === 0) return [];

  // 모든 키의 합집합
  const keys = new Set<string>();
  for (const o of objs) {
    for (const k of Object.keys(o)) keys.add(k);
  }

  // 결과 객체들
  const outs: Array<Partial<T>> = objs.map(() => ({}));

  for (const k of keys) {
    // 모든 객체가 이 키를 "자기 소유"로 가지고 있는지
    const allHave = objs.every((o) =>
      Object.prototype.hasOwnProperty.call(o, k)
    );
    if (allHave) {
      const first = (objs[0] as any)[k];
      const allSame = objs.every((o) => (o as any)[k] === first);
      if (allSame) continue; // 공통 (key,value) 제거
    }

    // 공통이 아니면, 원래 있던 객체에만 남김
    objs.forEach((o, i) => {
      if (Object.prototype.hasOwnProperty.call(o, k)) {
        (outs[i] as any)[k] = (o as any)[k];
      }
    });
  }

  return outs;
}
