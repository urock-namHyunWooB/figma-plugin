import type { InternalNode } from "@code-generator2/types/types";

export interface DisjointPair {
  parentId: string;
  pair: [{ id: string; name: string }, { id: string; name: string }];
  variantsA: string[];
  variantsB: string[];
}

/**
 * 주어진 InternalTree를 순회하며, 같은 부모 아래에서
 * 서로 disjoint한 variantName 집합을 가진 형제 쌍을 모두 수집한다.
 *
 * "Disjoint"란 두 형제의 variantName 집합 교집합이 공집합임을 뜻한다.
 * 이는 "같은 노드였어야 하는데 매칭 실패로 분리되었을 가능성이 높은" 패턴이다.
 *
 * 빈 variantName 집합을 가진 노드는 스킵한다 (단일 컴포넌트의 노드로 간주).
 */
export function detectDisjointVariants(root: InternalNode): DisjointPair[] {
  const out: DisjointPair[] = [];
  walk(root, out);
  return out;
}

function walk(node: InternalNode, out: DisjointPair[]): void {
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];
      const setA = variantSet(a);
      const setB = variantSet(b);
      if (setA.size === 0 || setB.size === 0) continue;
      if (isDisjoint(setA, setB)) {
        out.push({
          parentId: node.id,
          pair: [
            { id: a.id, name: a.name },
            { id: b.id, name: b.name },
          ],
          variantsA: [...setA].sort(),
          variantsB: [...setB].sort(),
        });
      }
    }
  }
  for (const child of children) walk(child, out);
}

function variantSet(node: InternalNode): Set<string> {
  const merged = node.mergedNodes;
  if (!merged || merged.length === 0) return new Set();
  return new Set(
    merged
      .map((m) => m.variantName)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
  );
}

function isDisjoint(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return false;
  return true;
}
