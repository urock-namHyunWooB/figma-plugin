import type { InternalNode, InternalTree } from "@code-generator2/types/types";
import type DataManager from "@code-generator2/layers/data-manager/DataManager";

export interface AnomalyContext {
  dataManager: DataManager;
  rootTree: InternalTree;
}

export interface Anomaly {
  detectorName: string;
  fixture: string;
  nodeId: string;
  primaryName: string;
  primaryType: string;
  payload: Record<string, unknown>;
}

export interface AnomalyDetector {
  readonly name: string;
  /**
   * 노드 하나에 대해 anomaly 여부를 판단.
   * - 이상 없음: null 반환
   * - 이상 있음: Anomaly 객체 반환 (fixture는 caller가 채움)
   *
   * @param node 검사할 InternalNode
   * @param depth 트리 깊이 (0 = variant root)
   * @param ctx
   */
  detect(
    node: InternalNode,
    depth: number,
    ctx: AnomalyContext
  ): Omit<Anomaly, "fixture"> | null;
}
