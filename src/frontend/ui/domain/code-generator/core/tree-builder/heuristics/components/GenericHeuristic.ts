/**
 * GenericHeuristic
 *
 * 모든 컴포넌트 휴리스틱의 기본 클래스.
 * 현재 Processor들의 모든 로직을 포함하며, 서브클래스에서 필요한 부분만 override.
 *
 * 파이프라인:
 * process() → processStructure() → processAnalysis() → processTransform() → processBuild()
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";

// 기존 Processor들 import (점진적 마이그레이션을 위해)
import { VariantProcessor } from "../../workers/VariantProcessor";
import { CleanupProcessor } from "../../workers/CleanupProcessor";
import { PropsProcessor } from "../../workers/PropsProcessor";
import { NodeProcessor } from "../../workers/NodeProcessor";
import { VisibilityProcessor } from "../../workers/VisibilityProcessor";
import { StyleProcessor } from "../../workers/StyleProcessor";
import { InstanceProcessor } from "../../workers/InstanceProcessor";
import { SlotProcessor } from "../../workers/SlotProcessor";
import { NodeConverter } from "../../workers/NodeConverter";

export class GenericHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "unknown";
  readonly name: string = "GenericHeuristic";

  // ===========================================================================
  // State Mapping
  // ===========================================================================

  protected readonly baseStateMapping: Record<string, PseudoClass | null> = {
    // Hover states
    hover: ":hover",
    hovered: ":hover",
    hovering: ":hover",

    // Active/Pressed states
    active: ":active",
    pressed: ":active",
    pressing: ":active",
    clicked: ":active",

    // Focus states
    focus: ":focus",
    focused: ":focus",
    "focus-visible": ":focus-visible",

    // Disabled states
    disabled: ":disabled",
    inactive: ":disabled",

    // Checked/Selected states
    checked: ":checked",
    selected: ":checked",

    // Visited state
    visited: ":visited",

    // Default states (no pseudo-class)
    default: null,
    normal: null,
    enabled: null,
    rest: null,
    idle: null,
  };

  get stateMapping(): Record<string, PseudoClass | null> {
    return this.baseStateMapping;
  }

  stateToPseudo(state: string): PseudoClass | null | undefined {
    const normalized = state.toLowerCase();
    const mapping = this.stateMapping;
    if (normalized in mapping) {
      return mapping[normalized];
    }
    return undefined;
  }

  // ===========================================================================
  // 컴포넌트 판별
  // ===========================================================================

  /**
   * 매칭 점수 계산
   * GenericHeuristic은 fallback이므로 항상 0 반환
   */
  score(_ctx: BuildContext): number {
    return 0;
  }

  /**
   * 처리 가능 여부 판별
   * GenericHeuristic은 fallback이므로 항상 true
   */
  canProcess(_ctx: BuildContext): boolean {
    return true;
  }

  // ===========================================================================
  // 메인 파이프라인
  // ===========================================================================

  process(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.processStructure(result);
    result = this.processAnalysis(result);
    result = this.processTransform(result);
    result = this.processBuild(result);
    return result;
  }

  // ===========================================================================
  // Phase 1: 구조 생성
  // ===========================================================================

  processStructure(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.processVariants(result);
    result = this.processInstanceCleanup(result);
    result = this.processPropsExtract(result);
    return result;
  }

  processVariants(ctx: BuildContext): BuildContext {
    return VariantProcessor.merge(ctx);
  }

  processInstanceCleanup(ctx: BuildContext): BuildContext {
    return CleanupProcessor.removeInstanceInternalNodes(ctx);
  }

  processPropsExtract(ctx: BuildContext): BuildContext {
    return PropsProcessor.extract(ctx);
  }

  // ===========================================================================
  // Phase 2: 분석
  // ===========================================================================

  processAnalysis(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = NodeProcessor.detectSemanticRoles(result);
    result = VisibilityProcessor.processHidden(result);
    // 서브클래스에서 추가 분석 (예: InputHeuristic의 placeholder 감지)
    return result;
  }

  // ===========================================================================
  // Phase 3: 노드 변환
  // ===========================================================================

  processTransform(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.processNodeTypes(result);
    result = this.processStyles(result);
    result = this.processPositions(result);
    result = this.processRotation(result);
    result = this.processExternalRefs(result);
    result = this.processVisibility(result);
    result = this.processProps(result);
    result = this.processSlots(result);
    return result;
  }

  processNodeTypes(ctx: BuildContext): BuildContext {
    return NodeProcessor.mapTypes(ctx);
  }

  processStyles(ctx: BuildContext): BuildContext {
    // 현재 StyleProcessor는 stateUtils의 stateToPseudo를 직접 사용
    // 향후 커스텀 stateMapping이 필요하면 StyleProcessor를 확장
    return StyleProcessor.build(ctx);
  }

  processPositions(ctx: BuildContext): BuildContext {
    return StyleProcessor.applyPositions(ctx);
  }

  processRotation(ctx: BuildContext): BuildContext {
    return StyleProcessor.handleRotation(ctx);
  }

  processExternalRefs(ctx: BuildContext): BuildContext {
    return InstanceProcessor.buildExternalRefs(ctx);
  }

  processVisibility(ctx: BuildContext): BuildContext {
    return VisibilityProcessor.resolve(ctx);
  }

  processProps(ctx: BuildContext): BuildContext {
    return PropsProcessor.bindProps(ctx);
  }

  processSlots(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = SlotProcessor.detectTextSlots(result);
    result = SlotProcessor.detectSlots(result);
    result = SlotProcessor.detectArraySlots(result);
    result = SlotProcessor.enrichArraySlotsWithComponentNames(result);
    return result;
  }

  // ===========================================================================
  // Phase 4: 최종 조립
  // ===========================================================================

  processBuild(ctx: BuildContext): BuildContext {
    let result = ctx;
    result = this.buildDesignTree(result);
    result = this.processCleanup(result);
    return result;
  }

  buildDesignTree(ctx: BuildContext): BuildContext {
    return NodeConverter.assemble(ctx);
  }

  processCleanup(ctx: BuildContext): BuildContext {
    // 현재는 별도 cleanup 없음
    return ctx;
  }
}
