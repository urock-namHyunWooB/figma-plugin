/**
 * HeuristicsRunner
 *
 * 컴포넌트별 휴리스틱 실행기.
 *
 * 새 구조 (휴리스틱 중심):
 * - COMPONENT_SET일 경우 모든 처리를 휴리스틱에 위임
 * - 휴리스틱의 process() 메서드가 전체 파이프라인 실행
 *   (processStructure → processAnalysis → processTransform → processBuild)
 *
 * 휴리스틱 우선순위:
 * 1. InputHeuristic (input, textfield, searchbar, caret 패턴)
 * 2. CheckboxHeuristic (checkbox 패턴)
 * 3. RadioHeuristic (radio 패턴)
 * 4. ToggleHeuristic (toggle, switch 패턴)
 * 5. LinkHeuristic (link, anchor 패턴)
 * 6. ButtonHeuristic (button, btn, cta 패턴)
 * 7. GenericHeuristic (fallback - 항상 true)
 *
 * 새 휴리스틱 추가 시:
 * 1. components/ 폴더에 XxxHeuristic.ts 파일 생성
 * 2. GenericHeuristic 상속
 * 3. canProcess() 구현 (컴포넌트 판별)
 * 4. 필요한 메서드만 override (processAnalysis, processSlots 등)
 * 5. HeuristicsRunner.heuristics 배열에 등록 (GenericHeuristic 앞에)
 */

import type { BuildContext } from "../workers/BuildContext";
import type { IComponentHeuristic } from "./components/IComponentHeuristic";
import { GenericHeuristic } from "./components/GenericHeuristic";
import { InputHeuristic } from "./components/InputHeuristic";
import { ButtonHeuristic } from "./components/ButtonHeuristic";
import { CheckboxHeuristic } from "./components/CheckboxHeuristic";
import { RadioHeuristic } from "./components/RadioHeuristic";
import { ToggleHeuristic } from "./components/ToggleHeuristic";
import { LinkHeuristic } from "./components/LinkHeuristic";

export class HeuristicsRunner {
  /**
   * 휴리스틱 목록 (우선순위 순)
   *
   * GenericHeuristic은 항상 마지막에 위치 (fallback)
   */
  private static readonly heuristics: IComponentHeuristic[] = [
    new InputHeuristic(),
    new CheckboxHeuristic(),
    new RadioHeuristic(),
    new ToggleHeuristic(),
    new LinkHeuristic(),
    new ButtonHeuristic(),
    new GenericHeuristic(), // fallback - 항상 마지막
  ];

  /**
   * 컴포넌트에 맞는 휴리스틱 찾기
   */
  static getHeuristic(ctx: BuildContext): IComponentHeuristic {
    for (const heuristic of this.heuristics) {
      if (heuristic.canProcess(ctx)) {
        return heuristic;
      }
    }
    // GenericHeuristic이 항상 true 반환하므로 여기 도달 안 함
    return this.heuristics[this.heuristics.length - 1];
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
