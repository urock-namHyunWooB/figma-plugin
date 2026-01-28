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
} from "@compiler/types/architecture";

import type { BuildContext, SemanticRoleEntry } from "./workers/interfaces";
import { VariantProcessor } from "./workers/VariantProcessor";
import { PropsProcessor } from "./workers/PropsProcessor";
import { NodeProcessor } from "./workers/NodeProcessor";
import { StyleProcessor } from "./workers/StyleProcessor";
import { SlotProcessor } from "./workers/SlotProcessor";
import { VisibilityProcessor } from "./workers/VisibilityProcessor";
import { InstanceProcessor } from "./workers/InstanceProcessor";
import { NodeConverter } from "./workers/NodeConverter";

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
    ctx = PropsProcessor.extract(ctx); // → propsMap

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2: 분석
    // ─────────────────────────────────────────────────────────────────────────
    ctx = NodeProcessor.detectSemanticRoles(ctx); // → semanticRoles
    ctx = VisibilityProcessor.processHidden(ctx); // → hiddenConditions

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: 노드별 변환
    // ─────────────────────────────────────────────────────────────────────────
    ctx = NodeProcessor.mapTypes(ctx); // → nodeTypes
    ctx = StyleProcessor.build(ctx); // → nodeStyles
    ctx = StyleProcessor.applyPositions(ctx); // nodeStyles에 position 추가
    ctx = StyleProcessor.handleRotation(ctx); // nodeStyles에 rotation 처리
    ctx = PropsProcessor.bindProps(ctx); // → nodePropBindings
    ctx = SlotProcessor.detectTextSlots(ctx); // propsMap, nodePropBindings 업데이트
    ctx = VisibilityProcessor.resolve(ctx); // → conditionals
    ctx = SlotProcessor.detectSlots(ctx); // → slots
    ctx = SlotProcessor.detectArraySlots(ctx); // → arraySlots
    ctx = InstanceProcessor.buildExternalRefs(ctx); // → nodeExternalRefs

    ctx = NodeConverter.assemble(ctx); // → root

    return {
      root: ctx.root!,
      props: Array.from(ctx.propsMap!.values()),
      slots: ctx.slots,
      conditionals: ctx.conditionals,
      arraySlots: ctx.arraySlots,
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
