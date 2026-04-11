/**
 * NodePresenceScanner
 *
 * merge 전에 모든 variant를 스캔하여 각 (name, type) 조합이
 * 몇 개 variant에 등장하는지 집계한다.
 *
 * 용도: BooleanPositionSwap의 조건부 노드 판별.
 * - 모든 variant에 존재하는 노드 → persistent (position swap 가능)
 * - 일부 variant에만 존재하는 노드 → conditional (별개 노드일 가능성)
 */

export interface NodePresence {
  /** "name:type" → 해당 조합이 등장한 variant 수 */
  readonly presenceMap: ReadonlyMap<string, number>;
  /** 전체 variant 수 */
  readonly totalVariants: number;
}

export class NodePresenceScanner {
  /**
   * 모든 variant를 스캔하여 NodePresence를 반환한다.
   * 각 variant 내에서 같은 (name, type)이 여러 번 나와도 1회로 카운트.
   */
  scan(variants: readonly { id: string; children?: readonly any[] }[]): NodePresence {
    const presenceMap = new Map<string, number>();

    for (const variant of variants) {
      const seen = new Set<string>();
      this.traverse(variant, seen);
      for (const key of seen) {
        presenceMap.set(key, (presenceMap.get(key) ?? 0) + 1);
      }
    }

    return {
      presenceMap,
      totalVariants: variants.length,
    };
  }

  private traverse(
    node: { name?: string; type?: string; children?: readonly any[] },
    seen: Set<string>,
  ): void {
    if (node.name && node.type) {
      seen.add(`${node.name}:${node.type}`);
    }
    if (node.children) {
      for (const child of node.children) {
        this.traverse(child, seen);
      }
    }
  }
}
