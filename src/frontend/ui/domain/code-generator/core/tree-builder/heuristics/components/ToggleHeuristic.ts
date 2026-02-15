/**
 * ToggleHeuristic
 *
 * 토글/스위치 컴포넌트 휴리스틱 (Composition 패턴).
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: toggle, switch
 *
 * stateMapping 확장:
 * - on → :checked
 * - off → null (기본 상태)
 */

import type { PseudoClass } from "@code-generator/types/customType";
import type { ComponentType } from "@code-generator/types/architecture";
import type { BuildContext } from "../../workers/BuildContext";
import type { IComponentHeuristic } from "./IComponentHeuristic";

// Processors (Composition)
import { VariantProcessor } from "../../workers/VariantProcessor";
import { CleanupProcessor } from "../../workers/CleanupProcessor";
import { PropsProcessor } from "../../workers/PropsProcessor";
import { NodeProcessor } from "../../workers/NodeProcessor";
import { VisibilityProcessor } from "../../workers/VisibilityProcessor";
import { StyleProcessor } from "../../workers/StyleProcessor";
import { InstanceProcessor } from "../../workers/InstanceProcessor";
import { SlotProcessor } from "../../workers/SlotProcessor";
import { NodeConverter } from "../../workers/NodeConverter";

export class ToggleHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "toggle";
  readonly name = "ToggleHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  // ===========================================================================
  // State Mapping (토글용 - On/Off 포함)
  // ===========================================================================

  private readonly stateMapping: Record<string, PseudoClass | null> = {
    hover: ":hover",
    hovered: ":hover",
    active: ":active",
    pressed: ":active",
    focus: ":focus",
    focused: ":focus",
    disabled: ":disabled",
    checked: ":checked",
    selected: ":checked",
    on: ":checked",
    off: null,
    default: null,
    normal: null,
  };

  stateToPseudo(state: string): PseudoClass | null | undefined {
    const normalized = state.toLowerCase();
    if (normalized in this.stateMapping) {
      return this.stateMapping[normalized];
    }
    return undefined;
  }

  // ===========================================================================
  // 컴포넌트 판별
  // ===========================================================================

  /**
   * Toggle 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - toggle: +10
   * - switch: +10
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/toggle/i.test(name)) score += 10;
    if (/switch/i.test(name)) score += 10;

    return score;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ToggleHeuristic.MATCH_THRESHOLD;
  }

  // ===========================================================================
  // 메인 파이프라인 (Composition - 직접 호출)
  // ===========================================================================

  process(ctx: BuildContext): BuildContext {
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
    result = PropsProcessor.bindProps(result);
    result = SlotProcessor.detectTextSlots(result);
    result = SlotProcessor.detectSlots(result);
    result = SlotProcessor.detectArraySlots(result);
    result = SlotProcessor.enrichArraySlotsWithComponentNames(result);

    // Phase 4: 최종 조립
    result = NodeConverter.assemble(result);

    return result;
  }

  // 향후 Toggle 특수 처리
  // - On/Off → data-state 또는 aria-checked
  // - 애니메이션 트랜지션 스타일
}
