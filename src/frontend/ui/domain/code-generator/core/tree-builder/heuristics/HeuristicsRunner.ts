/**
 * HeuristicsRunner
 *
 * 컴포넌트별 휴리스틱 실행기.
 *
 * 3단계 실행:
 * - Phase 2: run() - 메타데이터 생성 (canProcess → process)
 * - Phase 3-1: processProps() - props 수정 (bindProps 이후)
 * - Phase 3-2: processSlots() - slot 생성
 *
 * 휴리스틱은 COMPONENT_SET에서만 작동합니다.
 * (variant 비교가 필요하기 때문)
 *
 * 새 휴리스틱 추가 시:
 * 1. components/ 폴더에 XxxHeuristic.ts 파일 생성
 * 2. IComponentHeuristic 인터페이스 구현 (canProcess, process, processProps?, processSlots?)
 * 3. HeuristicsRunner.componentHeuristics 배열에 등록
 */

import type { BuildContext } from "../workers/BuildContext";
import type { IComponentHeuristic } from "./components/IComponentHeuristic";
import { InputHeuristic } from "./components/InputHeuristic";

export class HeuristicsRunner {
  /**
   * 컴포넌트별 휴리스틱 목록
   * 새 휴리스틱은 여기에 추가
   */
  private static componentHeuristics: IComponentHeuristic[] = [
    new InputHeuristic(),
    // 향후 휴리스틱 추가:
    // new ButtonHeuristic(),
    // new ModalHeuristic(),
    // new CheckboxHeuristic(),
  ];

  /**
   * Phase 2: 휴리스틱 실행 (메타데이터 생성)
   *
   * @param ctx BuildContext
   * @returns 휴리스틱 결과가 추가된 BuildContext
   */
  static run(ctx: BuildContext): BuildContext {
    // COMPONENT_SET만 처리 (variant 비교 필요)
    if (ctx.data.document.type !== "COMPONENT_SET") {
      return ctx;
    }

    // 처리 가능한 휴리스틱 찾아서 실행
    for (const heuristic of this.componentHeuristics) {
      if (heuristic.canProcess(ctx)) {
        const result = heuristic.process({
          ...ctx,
          componentType: heuristic.componentType,
        });
        return result;
      }
    }

    return ctx;
  }

  /**
   * Phase 3-1: Props 처리 (bindProps 이후)
   *
   * componentType이 설정된 경우에만 해당 휴리스틱의 processProps 실행
   * propsMap에 props 추가/수정/삭제
   *
   * @param ctx BuildContext (propsMap 포함)
   * @returns propsMap이 수정된 BuildContext
   */
  static processProps(ctx: BuildContext): BuildContext {
    if (!ctx.componentType) {
      return ctx;
    }

    const heuristic = this.findHeuristic(ctx.componentType);
    if (heuristic?.processProps) {
      return heuristic.processProps(ctx);
    }

    return ctx;
  }

  /**
   * Phase 3-2: Slot 처리 (processProps 이후)
   *
   * componentType이 설정된 경우에만 해당 휴리스틱의 processSlots 실행
   *
   * @param ctx BuildContext (nodePropBindings 포함)
   * @returns slot이 추가된 BuildContext
   */
  static processSlots(ctx: BuildContext): BuildContext {
    if (!ctx.componentType) {
      return ctx;
    }

    const heuristic = this.findHeuristic(ctx.componentType);
    if (heuristic?.processSlots) {
      return heuristic.processSlots(ctx);
    }

    return ctx;
  }

  /**
   * componentType으로 해당 휴리스틱 찾기
   */
  private static findHeuristic(
    componentType: string
  ): IComponentHeuristic | undefined {
    return this.componentHeuristics.find(
      (h) => h.componentType === componentType
    );
  }
}
