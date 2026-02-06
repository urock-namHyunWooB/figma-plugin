type Obj = Record<string, any>;

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
