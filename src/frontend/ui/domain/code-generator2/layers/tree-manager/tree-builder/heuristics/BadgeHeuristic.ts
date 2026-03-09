/**
 * BadgeHeuristic
 *
 * 알림 뱃지 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: badge (+15, ChipHeuristic의 10보다 높음)
 *
 * ChipHeuristic과 구분:
 * - ChipHeuristic: inline chip/tag 컴포넌트 (텍스트 + 색상 variant)
 * - BadgeHeuristic: notification overlay 뱃지 (아이콘 위 숫자 표시)
 *
 * apply() 시점 전처리 (normalizeInstanceOverrides):
 * - _\d+Text → count 리네임 (instanceOverrides 레벨)
 * - *Bg override 제거
 * - count prop을 main props에 추가
 * → UINodeConverter가 이후에 올바른 이름으로 overrideProps 생성
 * → ComponentPropsLinker가 처음부터 count 기준으로 바인딩 연결
 *
 * postProcess() 시점 후처리:
 * - 의존 컴포넌트 TEXT 노드의 bindings.content → bindings.textContent 전환
 *   (content는 slot wrapper 렌더링 → CSS 소실, textContent는 CSS 유지)
 */

import type { ComponentType, InternalTree, PropDefinition } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class BadgeHeuristic implements IHeuristic {
  readonly name = "BadgeHeuristic";
  readonly componentType: ComponentType = "badge";

  score(ctx: HeuristicContext): number {
    const name = ctx.componentName.toLowerCase();
    // "badge" 포함 + COMPONENT_SET이 아닌 단일 컴포넌트 (variant 없음)
    if (/badge/i.test(name) && ctx.dataManager.totalVariantCount <= 1) {
      return 15;
    }
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    ctx.tree.semanticType = "button";

    // instanceOverrides를 UINodeConverter 실행 전에 정규화
    // UINodeConverter가 이걸 읽어 overrideProps를 만드므로, 여기서 처리하면 후처리 불필요
    this.normalizeInstanceOverrides(ctx.tree, ctx.props);

    return {
      componentType: this.componentType,
    };
  }

  // ===========================================================================
  // apply() 시점 — instanceOverrides 정규화
  // ===========================================================================

  /**
   * INSTANCE 노드의 instanceOverrides를 UINodeConverter 실행 전에 정규화
   *
   * - _\d+Text → count 리네임 + main prop 추가
   * - *Bg → 제거 (내부 색상은 하드코딩 유지)
   */
  private normalizeInstanceOverrides(
    node: InternalTree,
    props: PropDefinition[]
  ): void {
    if (node.type === "INSTANCE" && node.metadata?.instanceOverrides) {
      const normalized: typeof node.metadata.instanceOverrides = [];

      for (const override of node.metadata.instanceOverrides) {
        if (/^_\d+Text$/.test(override.propName)) {
          override.propName = "count";

          if (!props.some((p) => p.name === "count")) {
            props.push({
              type: "string",
              name: "count",
              defaultValue: override.value,
              required: false,
              sourceKey: "",
            });
          }

          normalized.push(override);
        } else if (/Bg$/.test(override.propName)) {
          // 제거 — UINodeConverter가 overrideProps로 변환하지 않음
        } else {
          normalized.push(override);
        }
      }

      node.metadata.instanceOverrides = normalized;
    }

    for (const child of node.children) {
      this.normalizeInstanceOverrides(child, props);
    }
  }

}

