/**
 * TreeBuilder
 *
 * PreparedDesignData를 DesignTree로 변환하는 파이프라인 오케스트레이터.
 *
 * 변환 파이프라인:
 * 1. 구조 생성: VariantProcessor.merge → PropsProcessor.extract
 * 2. 분석: NodeProcessor.detectSemanticRoles → VisibilityProcessor.processHidden
 * 3. 노드별 변환: mapTypes → build → applyPositions → handleRotation → bindProps → ...
 * 4. 최종 조립: NodeConverter.assemble
 *
 * @see types/architecture.ts - ITreeBuilder 인터페이스
 */

import type {
  ITreeBuilder,
  TreeBuilderPolicy,
  DesignTree,
  PreparedDesignData,
} from "@code-generator/types/architecture";

import type { BuildContext, SemanticRoleEntry } from "./workers";
import {
  VariantProcessor,
  PropsProcessor,
  NodeProcessor,
  StyleProcessor,
  SlotProcessor,
  VisibilityProcessor,
  InstanceProcessor,
  NodeConverter,
  CleanupProcessor,
} from "./workers";
import { HeuristicsRunner } from "./heuristics";

class TreeBuilder implements ITreeBuilder {
  public build(
    data: PreparedDesignData,
    policy?: TreeBuilderPolicy
  ): DesignTree {
    let ctx = this.createBuildContext(data, policy);

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1: 구조 생성
    // ─────────────────────────────────────────────────────────────────────────
    ctx = VariantProcessor.merge(ctx); // → internalTree
    ctx = CleanupProcessor.removeInstanceInternalNodes(ctx); // INSTANCE 내부 노드 제거
    ctx = PropsProcessor.extract(ctx); // → propsMap

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2: 분석
    // ─────────────────────────────────────────────────────────────────────────
    ctx = NodeProcessor.detectSemanticRoles(ctx); // → semanticRoles
    ctx = VisibilityProcessor.processHidden(ctx); // → hiddenConditions

    // ─────────────────────────────────────────────────────────────────────────
    // Heuristics: COMPONENT_SET 전용 패턴 감지 (Phase 3 전에 실행)
    // 스타일 생성 전에 실행하여 linkedProp이 스타일에서 제거되도록 함
    // ─────────────────────────────────────────────────────────────────────────
    if (ctx.data.document.type === "COMPONENT_SET") {
      ctx = HeuristicsRunner.run(ctx); // → nodeSemanticTypes, excludePropsFromStyles
      ctx = this.removeExcludedProps(ctx); // propsMap에서 excludePropsFromStyles 제거
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: 노드별 변환
    // ─────────────────────────────────────────────────────────────────────────
    ctx = NodeProcessor.mapTypes(ctx); // → nodeTypes
    ctx = StyleProcessor.build(ctx); // → nodeStyles
    ctx = StyleProcessor.applyPositions(ctx); // nodeStyles에 position 추가
    ctx = StyleProcessor.handleRotation(ctx); // nodeStyles에 rotation 처리
    ctx = InstanceProcessor.buildExternalRefs(ctx); // → nodeExternalRefs
    ctx = VisibilityProcessor.resolve(ctx); // → conditionals

    if (ctx.data.document.type === "COMPONENT_SET") {
      ctx = PropsProcessor.bindProps(ctx); // → nodePropBindings
      ctx = SlotProcessor.detectTextSlots(ctx); // propsMap, nodePropBindings 업데이트
      ctx = SlotProcessor.detectSlots(ctx); // → slots (개별 slot 먼저 감지)
      ctx = SlotProcessor.detectArraySlots(ctx); // → arraySlots (slot으로 감지된 노드 제외)
      ctx = SlotProcessor.enrichArraySlotsWithComponentNames(ctx); // arraySlots에 itemComponentName 추가
    }

    ctx = NodeConverter.assemble(ctx); // → root

    return {
      root: ctx.root!,
      componentType: ctx.componentType,
      props: Array.from(ctx.propsMap!.values()),
      slots: ctx.slots,
      conditionals: ctx.conditionals,
      arraySlots: ctx.arraySlots,
    };
  }

  /**
   * excludePropsFromStyles에 포함된 prop을 propsMap에서 제거
   *
   * 휴리스틱에서 제거 대상으로 마킹된 prop(guideText 등)은
   * 불필요하므로 propsMap에서 제거합니다.
   */
  private removeExcludedProps(ctx: BuildContext): BuildContext {
    if (!ctx.excludePropsFromStyles || ctx.excludePropsFromStyles.size === 0 || !ctx.propsMap) {
      return ctx;
    }

    const newPropsMap = new Map(ctx.propsMap);
    for (const propName of ctx.excludePropsFromStyles) {
      newPropsMap.delete(propName);
    }

    return {
      ...ctx,
      propsMap: newPropsMap,
    };
  }

  private createBuildContext(
    data: PreparedDesignData,
    policy?: TreeBuilderPolicy
  ): BuildContext {
    const isComponentSet = data.document.type === "COMPONENT_SET";
    const doc = data.document as { children?: unknown[] };
    const totalVariantCount =
      isComponentSet && doc.children ? doc.children.length : 1;

    return {
      data,
      policy,
      totalVariantCount,
      conditionals: [],
      slots: [],
      arraySlots: [],
    };
  }
}

export default TreeBuilder;

export type { SemanticRoleEntry };
