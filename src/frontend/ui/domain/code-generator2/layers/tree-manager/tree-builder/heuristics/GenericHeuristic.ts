/**
 * GenericHeuristic
 *
 * 기본 휴리스틱 (fallback)
 * 다른 휴리스틱에 매칭되지 않을 때 사용
 *
 * - score(): 항상 0 반환
 * - apply(): componentType: "unknown" 반환
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { extractTextSlotInfo } from "../processors/utils/textSlotUtils";

export class GenericHeuristic implements IHeuristic {
  readonly name = "GenericHeuristic";
  readonly componentType: ComponentType = "unknown";

  /**
   * 매칭 점수 계산
   * GenericHeuristic은 fallback이므로 항상 0 반환
   */
  score(_ctx: HeuristicContext): number {
    return 0;
  }

  /**
   * semanticType 적용
   * 특별한 처리 없이 기본값 반환 + TEXT slot 감지
   */
  apply(ctx: HeuristicContext): HeuristicResult {
    // TEXT slot 감지 및 props 추가
    this.detectAndAddTextSlots(ctx);

    return {
      componentType: this.componentType,
    };
  }

  /**
   * TEXT 노드를 순회하며 slot으로 변환해야 하는 것 감지 및 props 추가
   */
  private detectAndAddTextSlots(ctx: HeuristicContext): void {
    const totalVariantCount = ctx.dataManager.totalVariantCount;

    // 트리 순회하며 TEXT 노드 찾기
    this.traverseAndDetectTextSlots(ctx.tree, ctx, totalVariantCount);
  }

  /**
   * 재귀적으로 TEXT 노드 탐색 및 slot 변환
   */
  private traverseAndDetectTextSlots(
    node: InternalNode,
    ctx: HeuristicContext,
    totalVariantCount: number
  ): void {
    // TEXT 노드인 경우 slot 판별
    if (node.type === "TEXT") {
      const slotInfo = extractTextSlotInfo(node, totalVariantCount, ctx.dataManager);

      if (slotInfo) {
        // Slot prop 추가
        ctx.props.push({
          type: "slot",
          name: slotInfo.propName,
          defaultValue: slotInfo.defaultValue,
          required: false,
          sourceKey: "", // TEXT slot은 Figma prop이 아님
        });

        // 노드에 binding 추가
        if (!node.bindings) {
          node.bindings = {};
        }
        node.bindings.content = { prop: slotInfo.propName };
      }
    }

    // 자식 노드 재귀 탐색
    for (const child of node.children || []) {
      this.traverseAndDetectTextSlots(child, ctx, totalVariantCount);
    }
  }
}
