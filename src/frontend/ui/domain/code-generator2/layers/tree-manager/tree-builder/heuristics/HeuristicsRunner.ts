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

import type { InternalTree, PropDefinition } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
  ComponentPropertyDef,
} from "./IHeuristic";

import { GenericHeuristic } from "./GenericHeuristic";
import { ButtonHeuristic } from "./ButtonHeuristic";
import { InputHeuristic } from "./InputHeuristic";
import { LinkHeuristic } from "./LinkHeuristic";
import { SwitchHeuristic } from "./SwitchHeuristic";
import { SegmentedControlHeuristic } from "./SegmentedControlHeuristic";
import { SearchFieldHeuristic } from "./SearchFieldHeuristic";
import { CheckboxHeuristic } from "./CheckboxHeuristic";
import { RadioHeuristic } from "./RadioHeuristic";
import { ChipHeuristic } from "./ChipHeuristic";
import { BadgeHeuristic } from "./BadgeHeuristic";
import { DropdownHeuristic } from "./DropdownHeuristic";
import { FabHeuristic } from "./FabHeuristic";

export class HeuristicsRunner {
  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /** Fallback 휴리스틱 */
  private readonly fallback: IHeuristic = new GenericHeuristic();

  /** 등록된 휴리스틱 목록 */
  private readonly heuristics: IHeuristic[] = [
    new SearchFieldHeuristic(), // SearchField를 먼저 (score 20, SwitchHeuristic의 10보다 높음)
    new DropdownHeuristic(),    // Dropdown/Select (score 20, dropdown/select 이름 패턴)
    new CheckboxHeuristic(),    // Checkbox (score 20, checkbox 이름 패턴)
    new RadioHeuristic(),       // Radio (score 20, radio 이름 패턴)
    new FabHeuristic(),         // FAB (score 15, ELLIPSE + INSTANCE 패턴)
    new BadgeHeuristic(),       // Badge notification (score 15, badge + 단일 컴포넌트)
    new ChipHeuristic(),        // Chip/Tag/Badge (score 10, 이름 패턴)
    new InputHeuristic(),  // Input을 먼저 (Caret 패턴이 더 특수)
    new SwitchHeuristic(), // Switch를 Button보다 먼저 (더 특수한 패턴)
    new SegmentedControlHeuristic(), // SegmentedControl (Tab props 패턴)
    new LinkHeuristic(),
    new ButtonHeuristic(),
  ];

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 휴리스틱 실행
   *
   * @param tree 내부 트리 (variant 병합 완료)
   * @param dataManager 데이터 매니저
   * @param props Props 배열 (휴리스틱이 수정 가능)
   * @param componentContext 현재 컴포넌트 고유 컨텍스트 (이름, propDefs)
   * @returns 휴리스틱 적용 결과
   */
  run(
    tree: InternalTree,
    dataManager: DataManager,
    props: PropDefinition[],
    componentContext?: {
      componentName?: string;
      propDefs?: Record<string, ComponentPropertyDef>;
    }
  ): HeuristicResult {
    const ctx = this.createContext(tree, dataManager, props, componentContext);

    // 1. 최적 휴리스틱 선택
    const heuristic = this.selectHeuristic(ctx);

    // 2. 휴리스틱 적용
    const result = heuristic.apply(ctx);

    return result;
  }

  /**
   * 디버그용: 모든 휴리스틱 점수 반환
   */
  debugScores(
    tree: InternalTree,
    dataManager: DataManager,
    props: PropDefinition[],
    componentContext?: {
      componentName?: string;
      propDefs?: Record<string, ComponentPropertyDef>;
    }
  ): Array<{
    name: string;
    score: number;
    selected: boolean;
  }> {
    const ctx = this.createContext(tree, dataManager, props, componentContext);
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
   *
   * componentContext가 제공되면 그 값 우선 사용.
   * 없으면 메인 컴포넌트 데이터로 fallback (기존 동작).
   *
   * NOTE: VariantMerger가 COMPONENT_SET의 id를 merged tree에 보존하지 않으므로
   * tree.id로 직접 조회하면 첫 번째 variant의 id(variant 이름, propDefs 없음)가
   * 반환됨. 따라서 TreeBuilder.build()에서 원본 node의 정보를 componentContext로
   * 명시적으로 전달해야 함.
   */
  private createContext(
    tree: InternalTree,
    dataManager: DataManager,
    props: PropDefinition[],
    componentContext?: {
      componentName?: string;
      propDefs?: Record<string, ComponentPropertyDef>;
    }
  ): HeuristicContext {
    let componentName: string;
    let propDefs: Record<string, ComponentPropertyDef> | undefined;

    if (componentContext?.componentName !== undefined) {
      componentName = componentContext.componentName;
      propDefs = componentContext.propDefs;
    } else {
      // fallback: 메인 컴포넌트 데이터 사용
      const mainId = dataManager.getMainComponentId();
      const { node: rootNode } = dataManager.getById(mainId);
      componentName = (rootNode as any)?.name || tree.name;
      propDefs = (rootNode as any)?.componentPropertyDefinitions as
        | Record<string, ComponentPropertyDef>
        | undefined;
    }

    return {
      tree,
      dataManager,
      componentName,
      propDefs,
      props,
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
