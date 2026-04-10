// test/audits/pairAssertions/checker.ts

import type {
  InternalNode,
  InternalTree,
} from "@code-generator2/types/types";
import type { PairAssertion } from "./assertions";

/**
 * merge 결과 트리에서 특정 nodeId가 속한 InternalNode를 찾는다.
 * mergedNodes 배열에 해당 ID가 있는 InternalNode를 반환.
 */
export function findMergedHost(
  tree: InternalTree,
  nodeId: string
): InternalNode | null {
  const walk = (node: InternalNode): InternalNode | null => {
    // mergedNodes에 해당 ID가 있으면 이 노드가 host
    if (node.mergedNodes?.some((m) => m.id === nodeId)) {
      return node;
    }
    for (const child of node.children ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(tree);
}

export interface CheckResult {
  passed: boolean;
  detail: string;
}

/**
 * 단언을 검증하고 결과를 반환.
 */
export function checkAssertion(
  tree: InternalTree,
  assertion: PairAssertion
): CheckResult {
  const hostA = findMergedHost(tree, assertion.nodeA);
  const hostB = findMergedHost(tree, assertion.nodeB);

  if (!hostA && !hostB) {
    return {
      passed: !assertion.shouldMatch,
      detail: `Both nodes not found in merge tree (nodeA=${assertion.nodeA}, nodeB=${assertion.nodeB})`,
    };
  }

  if (!hostA || !hostB) {
    const missing = !hostA ? assertion.nodeA : assertion.nodeB;
    if (assertion.shouldMatch) {
      return {
        passed: false,
        detail: `Expected match but node ${missing} not found in merge tree`,
      };
    }
    return {
      passed: true,
      detail: `Nodes in different hosts (one not found: ${missing})`,
    };
  }

  const sameHost = hostA === hostB;

  if (assertion.shouldMatch) {
    if (sameHost) {
      return {
        passed: true,
        detail: `Correctly matched in same host (${hostA.id}, name="${hostA.name}")`,
      };
    }
    return {
      passed: false,
      detail: `Expected match but found in different hosts: nodeA in ${hostA.id} ("${hostA.name}"), nodeB in ${hostB.id} ("${hostB.name}")`,
    };
  } else {
    if (!sameHost) {
      return {
        passed: true,
        detail: `Correctly separated: nodeA in ${hostA.id} ("${hostA.name}"), nodeB in ${hostB.id} ("${hostB.name}")`,
      };
    }
    return {
      passed: false,
      detail: `Expected separation but both merged in same host ${hostA.id} ("${hostA.name}")`,
    };
  }
}
