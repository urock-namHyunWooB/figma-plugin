export type PairAssertionKind = "must-match" | "must-not-match";

export interface PairAssertion {
  /** fixture 파일명 (test/fixtures/ 기준 상대경로, 확장자 제외) */
  fixture: string;
  /** 사람이 읽는 설명 (디버깅용) */
  description: string;
  /** 원본 fixture에서의 variant A 노드 ID */
  nodeIdA: string;
  /** 원본 fixture에서의 variant B 노드 ID */
  nodeIdB: string;
  kind: PairAssertionKind;
}

/**
 * InternalTree에서 특정 원본 ID가 어느 merged node에 속하는지 찾는다.
 * mergedNodes[].id 로 조회한다.
 */
export function findMergedNodeByOriginalId(
  root: { id: string; children?: any[]; mergedNodes?: Array<{ id: string }> },
  originalId: string
): { id: string } | null {
  if (root.mergedNodes?.some((m) => m.id === originalId)) {
    return { id: root.id };
  }
  if (root.id === originalId) return { id: root.id };
  for (const child of root.children ?? []) {
    const hit = findMergedNodeByOriginalId(child, originalId);
    if (hit) return hit;
  }
  return null;
}
