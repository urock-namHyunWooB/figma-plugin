/**
 * HeuristicsRunner
 *
 * 휴리스틱 실행기
 *
 * 점수 기반 매칭:
 * 1. 각 휴리스틱의 score() 계산
 * 2. MATCH_THRESHOLD(10) 이상인 것 중 최고 점수 선택
 * 3. 임계점 미달 시 GenericHeuristic (fallback) 사용
 */

import type { InternalTree } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
  ComponentPropertyDef,
} from "./IHeuristic";

import { GenericHeuristic } from "./GenericHeuristic";
import { ButtonHeuristic } from "./ButtonHeuristic";

export class HeuristicsRunner {
  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /** Fallback 휴리스틱 */
  private readonly fallback: IHeuristic = new GenericHeuristic();

  /** 등록된 휴리스틱 목록 */
  private readonly heuristics: IHeuristic[] = [
    new ButtonHeuristic(),
    // TODO: InputHeuristic, LinkHeuristic, CheckboxHeuristic 등 추가
  ];

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 휴리스틱 실행
   *
   * @param tree 내부 트리 (variant 병합 완료)
   * @param dataManager 데이터 매니저
   * @returns 휴리스틱 적용 결과
   */
  run(tree: InternalTree, dataManager: DataManager): HeuristicResult {
    const ctx = this.createContext(tree, dataManager);

    // 1. 최적 휴리스틱 선택
    const heuristic = this.selectHeuristic(ctx);

    // 2. 휴리스틱 적용
    const result = heuristic.apply(ctx);

    return result;
  }

  /**
   * 디버그용: 모든 휴리스틱 점수 반환
   */
  debugScores(tree: InternalTree, dataManager: DataManager): Array<{
    name: string;
    score: number;
    selected: boolean;
  }> {
    const ctx = this.createContext(tree, dataManager);
    const selectedHeuristic = this.selectHeuristic(ctx);

    const scores = this.heuristics.map((h) => ({
      name: h.name,
      score: h.score(ctx),
      selected: h === selectedHeuristic,
    }));

    // fallback 추가
    scores.push({
      name: this.fallback.name,
      score: 0,
      selected: selectedHeuristic === this.fallback,
    });

    return scores;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * HeuristicContext 생성
   */
  private createContext(
    tree: InternalTree,
    dataManager: DataManager
  ): HeuristicContext {
    // 루트 document 조회
    const mainId = dataManager.getMainComponentId();
    const { node: rootNode } = dataManager.getById(mainId);

    const componentName = (rootNode as any)?.name || tree.name;
    const propDefs = (rootNode as any)?.componentPropertyDefinitions as
      | Record<string, ComponentPropertyDef>
      | undefined;

    return {
      tree,
      dataManager,
      componentName,
      propDefs,
    };
  }

  /**
   * 최적 휴리스틱 선택
   */
  private selectHeuristic(ctx: HeuristicContext): IHeuristic {
    let bestHeuristic: IHeuristic | null = null;
    let bestScore = 0;

    for (const heuristic of this.heuristics) {
      const score = heuristic.score(ctx);

      if (score >= HeuristicsRunner.MATCH_THRESHOLD) {
        if (score > bestScore) {
          bestScore = score;
          bestHeuristic = heuristic;
        } else if (score === bestScore && bestHeuristic) {
          // 동점 경고
          console.warn(
            `[HeuristicsRunner] Tie: ${bestHeuristic.name}(${bestScore}) vs ${heuristic.name}(${score}). Using ${bestHeuristic.name}.`
          );
        }
      }
    }

    return bestHeuristic ?? this.fallback;
  }
}
