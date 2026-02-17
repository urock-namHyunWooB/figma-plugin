/**
 * CheckboxHeuristic
 *
 * 체크박스 컴포넌트 휴리스틱 (Composition 패턴).
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: checkbox, check-box
 *
 * 향후 체크박스 특화 처리 추가 시 process()에서 직접 구현.
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

export class CheckboxHeuristic implements IComponentHeuristic {
  readonly componentType: ComponentType = "checkbox";
  readonly name = "CheckboxHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  // ===========================================================================
  // State Mapping
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
    default: null,
    normal: null,
  };

  /**
   * State 문자열을 CSS pseudo-class로 변환
   * @param state - State 문자열 (예: "hover", "checked")
   * @returns 대응하는 pseudo-class 또는 null/undefined
   */
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
   * Checkbox 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - checkbox, check-box: +10
   *
   * @param ctx - 빌드 컨텍스트
   * @returns 매칭 점수 (0 이상)
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;

    if (/checkbox/i.test(name)) score += 10;
    if (/check.?box/i.test(name)) score += 10;

    return score;
  }

  /**
   * 이 휴리스틱이 해당 컴포넌트를 처리할 수 있는지 판별
   * @param ctx - 빌드 컨텍스트
   * @returns 처리 가능 여부
   */
  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= CheckboxHeuristic.MATCH_THRESHOLD;
  }

  // ===========================================================================
  // 메인 파이프라인 (Composition - 직접 호출)
  // ===========================================================================

  /**
   * 전체 파이프라인 실행
   * @param ctx - 빌드 컨텍스트
   * @returns 처리된 BuildContext
   */
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

  // 향후 Checkbox 특수 처리
  // - checked state → :checked pseudo-class
  // - indeterminate state 처리
}
