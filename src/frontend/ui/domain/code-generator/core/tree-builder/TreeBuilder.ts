/**
 * TreeBuilder
 *
 * PreparedDesignData를 DesignTree로 변환하는 파이프라인 오케스트레이터.
 *
 * 변환 파이프라인:
 * - COMPONENT_SET: HeuristicsRunner에 전체 위임
 *   (processStructure → processAnalysis → processTransform → processBuild)
 * - 그 외: 기본 Processor 파이프라인 사용
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
  NodeProcessor,
  StyleProcessor,
  InstanceProcessor,
  NodeConverter,
  PropsProcessor,
  CleanupProcessor,
  VisibilityProcessor,
} from "./workers";
import { HeuristicsRunner } from "./heuristics";

class TreeBuilder implements ITreeBuilder {
  public build(
    data: PreparedDesignData,
    policy?: TreeBuilderPolicy
  ): DesignTree {
    let ctx = this.createBuildContext(data, policy);

    // ─────────────────────────────────────────────────────────────────────────
    // 파이프라인 분기
    // ─────────────────────────────────────────────────────────────────────────
    if (data.document.type === "COMPONENT_SET") {
      // ─── COMPONENT_SET: 휴리스틱에 전체 위임 ───
      ctx = HeuristicsRunner.run(ctx);
    } else {
      // ─── Non-COMPONENT_SET: 기본 파이프라인 ───
      ctx = this.buildNonComponentSet(ctx);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 결과 반환
    // ─────────────────────────────────────────────────────────────────────────
    return {
      root: ctx.root!,
      componentType: ctx.componentType,
      props: Array.from(ctx.propsMap?.values() ?? []),
      slots: ctx.slots,
      conditionals: ctx.conditionals,
      arraySlots: ctx.arraySlots,
    };
  }

  /**
   * Non-COMPONENT_SET 처리 (COMPONENT, FRAME, INSTANCE 등)
   *
   * 간단한 파이프라인:
   * 1. Variant 병합 (단일 variant이므로 그대로)
   * 2. Node type 매핑
   * 3. Style 빌드
   * 4. Position 적용
   * 5. External refs 빌드
   * 6. DesignTree 생성
   */
  private buildNonComponentSet(ctx: BuildContext): BuildContext {
    let result = ctx;

    // Phase 1: 구조 생성
    result = VariantProcessor.merge(result);
    result = CleanupProcessor.removeInstanceInternalNodes(result);
    result = PropsProcessor.extract(result);

    // Phase 2: 분석
    result = NodeProcessor.detectSemanticRoles(result);
    result = VisibilityProcessor.processHidden(result);

    // Phase 3: 노드 변환
    result = NodeProcessor.mapTypes(result);
    result = StyleProcessor.build(result);
    result = StyleProcessor.applyPositions(result);
    result = StyleProcessor.handleRotation(result);
    result = InstanceProcessor.buildExternalRefs(result);
    result = VisibilityProcessor.resolve(result);

    // Phase 3.5: Props 바인딩 (dependency의 TEXT override prop 지원)
    result = PropsProcessor.bindProps(result);

    // Phase 4: 최종 조립
    result = NodeConverter.assemble(result);

    return result;
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
