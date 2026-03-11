/**
 * FrameHeuristic
 *
 * 컨테이너/래퍼 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: frame, card, container, wrapper, panel, box (+10)
 * 2. 구조: 대부분의 variant에 의미 있는 children이 없음 (빈 배열 또는 장식용 요소만)
 *
 * apply() 동작:
 * - children?: React.ReactNode prop 추가
 * - 루트 노드에 childrenSlot = "children" 설정 → JsxGenerator가 {children} 렌더링
 */

import type { ComponentType } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

/** 컨테이너 컴포넌트 이름 패턴 */
const CONTAINER_NAME_PATTERN = /^(frame|card|container|wrapper|panel|box)$/i;

export class FrameHeuristic implements IHeuristic {
  readonly name = "FrameHeuristic";
  readonly componentType: ComponentType = "frame";

  score(ctx: HeuristicContext): number {
    const name = ctx.componentName.toLowerCase().trim();

    // 이름 패턴 매칭
    if (!CONTAINER_NAME_PATTERN.test(name)) return 0;

    return 10;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // children prop 추가
    if (!ctx.props.some((p) => p.name === "children")) {
      ctx.props.push({
        type: "slot",
        name: "children",
        required: false,
        sourceKey: "children",
      });
    }

    // 루트 노드에 childrenSlot 설정 → JsxGenerator가 {children} 렌더링
    ctx.tree.childrenSlot = "children";

    return {
      componentType: this.componentType,
    };
  }
}
