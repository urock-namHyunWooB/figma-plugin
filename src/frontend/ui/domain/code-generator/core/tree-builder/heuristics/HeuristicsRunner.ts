/**
 * HeuristicsRunner
 *
 * 컴포넌트별 휴리스틱 실행기.
 *
 * 각 휴리스틱이 canProcess()로 자신이 처리할 수 있는지 판별하고,
 * 매칭되는 휴리스틱이 process()를 실행합니다.
 *
 * 휴리스틱은 COMPONENT_SET에서만 작동합니다.
 * (variant 비교가 필요하기 때문)
 *
 * 새 휴리스틱 추가 시:
 * 1. components/ 폴더에 XxxHeuristic.ts 파일 생성
 * 2. IComponentHeuristic 인터페이스 구현 (canProcess, process)
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
   * 휴리스틱 실행
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
}
