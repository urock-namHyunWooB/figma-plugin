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
import {
  detectBooleanVariants,
  shouldBeInstanceSlot,
  generateInstanceSlotPropName,
  generateBooleanVariantSlotName,
} from "../processors/utils/instanceSlotUtils";

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
   * 특별한 처리 없이 기본값 반환 + TEXT/INSTANCE slot 감지
   */
  apply(ctx: HeuristicContext): HeuristicResult {
    // Boolean variant slot 감지 및 props 추가
    this.detectAndAddBooleanVariantSlots(ctx);

    // TEXT slot 감지 및 props 추가
    this.detectAndAddTextSlots(ctx);

    // INSTANCE slot 감지 및 props 추가
    this.detectAndAddInstanceSlots(ctx);

    return {
      componentType: this.componentType,
    };
  }

  /**
   * Boolean variant slot 감지 및 props 추가
   * (True/False variant를 slot으로 변환)
   */
  private detectAndAddBooleanVariantSlots(ctx: HeuristicContext): void {
    const booleanVariants = detectBooleanVariants(ctx.propDefs);

    for (const boolVariant of booleanVariants) {
      const slotName = generateBooleanVariantSlotName(boolVariant.name);

      // 중복 방지: 이미 같은 이름의 prop이 있으면 skip
      if (ctx.props.some(p => p.name === slotName)) {
        continue;
      }

      // Slot prop 추가
      ctx.props.push({
        type: "slot",
        name: slotName,
        defaultValue: null,
        required: false,
        sourceKey: boolVariant.name,
      });

      // TODO: INSTANCE 노드에 visibility 조건 추가
      // 이 boolean variant에 의해 제어되는 INSTANCE를 찾아야 함
    }
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
   * INSTANCE 노드를 순회하며 slot으로 변환해야 하는 것 감지 및 props 추가
   */
  private detectAndAddInstanceSlots(ctx: HeuristicContext): void {
    const totalVariantCount = ctx.dataManager.totalVariantCount;

    // 트리 순회하며 INSTANCE 노드 찾기 (slot 노드의 자식은 skip)
    this.traverseAndDetectInstanceSlots(ctx.tree, ctx, totalVariantCount, false);
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
      // 1. componentPropertyReferences.characters가 있으면 string prop으로 바인딩 (우선순위 높음)
      //    Figma에서 명시적으로 "이 텍스트는 외부에서 변경 가능하다"고 선언한 경우
      const charRef = node.componentPropertyReferences?.["characters"];
      if (charRef) {
        const matchedProp = ctx.props.find(p => p.sourceKey === charRef);
        if (matchedProp) {
          if (!node.bindings) {
            node.bindings = {};
          }
          node.bindings.content = { prop: matchedProp.name };
          // 바인딩 완료, 자식 탐색 후 return
          for (const child of node.children || []) {
            this.traverseAndDetectTextSlots(child, ctx, totalVariantCount);
          }
          return;
        }
      }

      // 2. 기존 slot 감지 로직 (variant 간 텍스트가 다른 경우)
      const slotInfo = extractTextSlotInfo(node, totalVariantCount, ctx.dataManager);

      if (slotInfo) {
        // 중복 방지: 이미 같은 이름의 prop이 있으면 skip
        if (!ctx.props.some(p => p.name === slotInfo.propName)) {
          // Slot prop 추가
          ctx.props.push({
            type: "slot",
            name: slotInfo.propName,
            defaultValue: slotInfo.defaultValue,
            required: false,
            sourceKey: "", // TEXT slot은 Figma prop이 아님
          });
        }

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

  /**
   * 재귀적으로 INSTANCE 노드 탐색 및 slot 변환
   * @param skipChildren - true이면 자식 노드를 탐색하지 않음 (slot의 자식은 slot으로 만들지 않음)
   */
  private traverseAndDetectInstanceSlots(
    node: InternalNode,
    ctx: HeuristicContext,
    totalVariantCount: number,
    skipChildren: boolean
  ): void {
    let shouldSkipChildren = skipChildren;

    // INSTANCE 노드 slot 판별
    if (node.type === "INSTANCE") {
      // DataManager에서 isExposedInstance 플래그 확인
      const nodeData = ctx.dataManager.getById(node.id);
      const isExposedInstance = (nodeData.node as any)?.isExposedInstance;

      if (shouldBeInstanceSlot(node, totalVariantCount, isExposedInstance)) {
        const slotName = generateInstanceSlotPropName(node.name);

        // 중복 방지: 이미 같은 이름의 prop이 있으면 skip
        if (!ctx.props.some(p => p.name === slotName)) {
          // Slot prop 추가
          ctx.props.push({
            type: "slot",
            name: slotName,
            defaultValue: null,
            required: false,
            sourceKey: "",
          });
        }

        // 노드에 binding 추가 (기존 binding이 없을 때만)
        if (!node.bindings) {
          node.bindings = {};
        }
        if (!node.bindings.content) {
          node.bindings.content = { prop: slotName };
        }

        // 이 노드가 slot이 되었으므로 자식은 탐색하지 않음
        shouldSkipChildren = true;
      }
    }

    // slot의 자식이 아니면 재귀 탐색
    if (!shouldSkipChildren) {
      for (const child of node.children || []) {
        this.traverseAndDetectInstanceSlots(child, ctx, totalVariantCount, false);
      }
    }
  }
}
