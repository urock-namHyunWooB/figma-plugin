/**
 * ChipHeuristic
 *
 * Chip/Tag/Badge 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: chip, tag, badge (+10)
 *
 * 특수 처리:
 * - 플레이스홀더 텍스트 감지 → string prop 생성
 *   (TEXT 내용이 레이어 이름과 동일하면 동적 텍스트로 판단)
 * - INSTANCE slot 감지 (아이콘 등)
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import {
  extractTextSlotInfo,
  getTextCharacters,
  isPlaceholderText,
  generateTextSlotPropName,
} from "../processors/utils/textSlotUtils";
import {
  shouldBeInstanceSlot,
  generateInstanceSlotPropName,
} from "../processors/utils/instanceSlotUtils";

export class ChipHeuristic implements IHeuristic {
  readonly name = "ChipHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    const name = ctx.componentName.toLowerCase();
    if (/chip|tag|badge/i.test(name)) return 10;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    ctx.tree.semanticType = "button";

    const totalVariantCount = ctx.dataManager.totalVariantCount;

    // TEXT slot 감지 (플레이스홀더 포함)
    this.traverseAndDetectTextSlots(ctx.tree, ctx, totalVariantCount);

    // INSTANCE slot 감지
    this.traverseAndDetectInstanceSlots(ctx.tree, ctx, totalVariantCount, false);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * 재귀적으로 TEXT 노드 탐색 및 prop 변환
   *
   * 3단계 우선순위:
   * 1. componentPropertyReferences.characters 바인딩
   * 2. variant 간 텍스트 차이 → slot
   * 3. 플레이스홀더 텍스트 감지 → string prop
   */
  private traverseAndDetectTextSlots(
    node: InternalNode,
    ctx: HeuristicContext,
    totalVariantCount: number
  ): void {
    if (node.type === "TEXT") {
      // 1. Figma 명시 바인딩
      const charRef = node.componentPropertyReferences?.["characters"];
      if (charRef) {
        const matchedProp = ctx.props.find(p => p.sourceKey === charRef);
        if (matchedProp) {
          node.bindings ??= {};
          node.bindings.content = { prop: matchedProp.name };
          for (const child of node.children || []) {
            this.traverseAndDetectTextSlots(child, ctx, totalVariantCount);
          }
          return;
        }
      }

      // 2. variant 간 텍스트 차이 → slot
      const slotInfo = extractTextSlotInfo(node, totalVariantCount, ctx.dataManager);
      if (slotInfo) {
        if (!ctx.props.some(p => p.name === slotInfo.propName)) {
          ctx.props.push({
            type: "string",
            name: slotInfo.propName,
            defaultValue: slotInfo.defaultValue,
            required: false,
            sourceKey: "",
          });
        }
        node.bindings ??= {};
        node.bindings.content = { prop: slotInfo.propName };
      } else if (node.mergedNodes && node.mergedNodes.length > 0) {
        // 3. 플레이스홀더 텍스트 → string prop
        const textContent = getTextCharacters(node.mergedNodes[0].id, ctx.dataManager);
        if (textContent && isPlaceholderText(textContent, node.name)) {
          const propName = generateTextSlotPropName(node.name);
          if (!ctx.props.some(p => p.name === propName)) {
            ctx.props.push({
              type: "string",
              name: propName,
              defaultValue: textContent,
              required: false,
              sourceKey: "",
            });
          }
          node.bindings ??= {};
          node.bindings.content = { prop: propName };
        }
      }
    }

    for (const child of node.children || []) {
      this.traverseAndDetectTextSlots(child, ctx, totalVariantCount);
    }
  }

  /**
   * 재귀적으로 INSTANCE 노드 탐색 및 slot 변환
   */
  private traverseAndDetectInstanceSlots(
    node: InternalNode,
    ctx: HeuristicContext,
    totalVariantCount: number,
    skipChildren: boolean
  ): void {
    let shouldSkipChildren = skipChildren;

    if (node.type === "INSTANCE") {
      const nodeData = ctx.dataManager.getById(node.id);
      const isExposedInstance = (nodeData.node as any)?.isExposedInstance;

      if (shouldBeInstanceSlot(node, totalVariantCount, isExposedInstance)) {
        const slotName = generateInstanceSlotPropName(node.name);
        if (!ctx.props.some(p => p.name === slotName)) {
          ctx.props.push({
            type: "slot",
            name: slotName,
            defaultValue: null,
            required: false,
            sourceKey: "",
          });
        }
        node.bindings ??= {};
        if (!node.bindings.content) {
          node.bindings.content = { prop: slotName };
        }
        shouldSkipChildren = true;
      }
    }

    if (!shouldSkipChildren) {
      for (const child of node.children || []) {
        this.traverseAndDetectInstanceSlots(child, ctx, totalVariantCount, false);
      }
    }
  }
}
