/**
 * HeuristicsProcessor
 *
 * TreeBuilder Step 6: 휴리스틱 적용
 *
 * 역할:
 * 1. HeuristicsRunner로 컴포넌트 타입 판별
 * 2. InternalTree에 semanticType 설정
 * 3. componentType 반환
 */

import type { ComponentType, InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";
import { HeuristicsRunner } from "../heuristics/HeuristicsRunner";

export interface HeuristicsResult {
  /** 전체 컴포넌트 타입 (button, input, unknown 등) */
  componentType: ComponentType;
  /** 루트 노드의 UINodeType 변경 여부 */
  rootNodeType?: "button" | "input" | "link";
}

export class HeuristicsProcessor {
  private readonly dataManager: DataManager;
  private readonly runner: HeuristicsRunner;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.runner = new HeuristicsRunner();
  }

  /**
   * 휴리스틱 적용
   *
   * @param tree 내부 트리 (Step 5 완료 상태)
   * @returns 휴리스틱 결과 (componentType, rootNodeType)
   */
  apply(tree: InternalTree): HeuristicsResult {
    const result = this.runner.run(tree, this.dataManager);

    return {
      componentType: result.componentType,
      rootNodeType: result.rootNodeType,
    };
  }

  /**
   * 디버그용: 모든 휴리스틱 점수 반환
   */
  debugScores(tree: InternalTree): Array<{
    name: string;
    score: number;
    selected: boolean;
  }> {
    return this.runner.debugScores(tree, this.dataManager);
  }
}
