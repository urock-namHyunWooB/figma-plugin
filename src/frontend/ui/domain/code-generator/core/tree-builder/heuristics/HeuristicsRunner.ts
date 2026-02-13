/**
 * HeuristicsRunner
 *
 * 컴포넌트별 휴리스틱 실행기.
 *
 * 점수 기반 매칭:
 * - 각 휴리스틱이 score()로 매칭 점수 계산
 * - MATCH_THRESHOLD(10) 이상인 휴리스틱 중 최고 점수 선택
 * - 임계점 미달 시 GenericHeuristic (fallback) 사용
 *
 * 새 휴리스틱 추가 시:
 * 1. components/ 폴더에 XxxHeuristic.ts 파일 생성
 * 2. GenericHeuristic 상속
 * 3. score() 구현 (점수 계산)
 * 4. canProcess() 구현 (score >= MATCH_THRESHOLD)
 * 5. 필요한 메서드만 override (processAnalysis, processSlots 등)
 * 6. HeuristicsRunner.heuristics 배열에 등록
 */

import type { BuildContext } from "../workers/BuildContext";
import type { IComponentHeuristic } from "./components/IComponentHeuristic";
import { GenericHeuristic } from "./components/GenericHeuristic";
import { InputHeuristic } from "./components/InputHeuristic";
import { ButtonHeuristic } from "./components/ButtonHeuristic";
import { ButtonSetHeuristic } from "./components/ButtonSetHeuristic";
import { CheckboxHeuristic } from "./components/CheckboxHeuristic";
import { RadioHeuristic } from "./components/RadioHeuristic";
import { ToggleHeuristic } from "./components/ToggleHeuristic";
import { LinkHeuristic } from "./components/LinkHeuristic";

export class HeuristicsRunner {
  /** 매칭 임계점 - 이 점수 이상이어야 해당 휴리스틱으로 판정 */
  private static readonly MATCH_THRESHOLD = 10;

  /** Fallback 휴리스틱 */
  private static readonly fallback: IComponentHeuristic = new GenericHeuristic();

  /**
   * 휴리스틱 목록 (점수 기반 선택이므로 순서 무관)
   */
  private static readonly heuristics: IComponentHeuristic[] = [
    new InputHeuristic(),
    new CheckboxHeuristic(),
    new RadioHeuristic(),
    new ToggleHeuristic(),
    new LinkHeuristic(),
    new ButtonHeuristic(),
    new ButtonSetHeuristic(),
  ];

  /**
   * 컴포넌트에 맞는 휴리스틱 찾기 (점수 기반)
   *
   * 1. 각 휴리스틱의 score() 계산
   * 2. MATCH_THRESHOLD 이상인 것 중 최고 점수 선택
   * 3. 동점 시 먼저 순회된 휴리스틱 유지 (경고 출력)
   * 4. 임계점 미달 시 GenericHeuristic 반환
   */
  static getHeuristic(ctx: BuildContext): IComponentHeuristic {
    let bestHeuristic: IComponentHeuristic | null = null;
    let bestScore = 0;

    for (const heuristic of this.heuristics) {
      const score = heuristic.score(ctx);

      if (score >= this.MATCH_THRESHOLD) {
        if (score > bestScore) {
          bestScore = score;
          bestHeuristic = heuristic;
        } else if (score === bestScore && bestHeuristic) {
          // 동점 경고 - 먼저 순회된 휴리스틱 유지
          console.warn(
            `[HeuristicsRunner] Tie detected for "${ctx.data.document.name}": ` +
            `${bestHeuristic.name}(${bestScore}) vs ${heuristic.name}(${score}). ` +
            `Using ${bestHeuristic.name}.`
          );
        }
      }
    }

    return bestHeuristic ?? this.fallback;
  }

  /**
   * 전체 파이프라인 실행 (COMPONENT_SET용)
   *
   * 적절한 휴리스틱을 찾아 전체 파이프라인 실행:
   * processStructure → processAnalysis → processTransform → processBuild
   *
   * @param ctx BuildContext
   * @returns 처리된 BuildContext (root, props, slots 등 포함)
   */
  static run(ctx: BuildContext): BuildContext {
    const heuristic = this.getHeuristic(ctx);
    return heuristic.process({
      ...ctx,
      componentType: heuristic.componentType,
    });
  }

  /**
   * @deprecated Phase 3-1: Props 처리 (구 인터페이스 호환용)
   *
   * 새 구조에서는 process() 내에서 processTransform()이 호출되어
   * processProps()가 실행됨. 이 메서드는 호환성을 위해 유지.
   */
  static processProps(ctx: BuildContext): BuildContext {
    // 새 구조에서는 process()가 모든 것을 처리하므로 그냥 반환
    return ctx;
  }

  /**
   * @deprecated Phase 3-2: Slot 처리 (구 인터페이스 호환용)
   *
   * 새 구조에서는 process() 내에서 processTransform()이 호출되어
   * processSlots()가 실행됨. 이 메서드는 호환성을 위해 유지.
   */
  static processSlots(ctx: BuildContext): BuildContext {
    // 새 구조에서는 process()가 모든 것을 처리하므로 그냥 반환
    return ctx;
  }
}
