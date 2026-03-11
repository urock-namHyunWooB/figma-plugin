/**
 * FabHeuristic
 *
 * FAB(Floating Action Button) 컴포넌트 감지 및 렌더링 보정
 *
 * 감지 기준:
 * - 이름에 "fab" 포함
 * - ELLIPSE 자식 (원형 배경) + INSTANCE 자식 (아이콘)
 * - TEXT 자식 없음 (라벨 없는 아이콘 버튼)
 *
 * 보정:
 * - ELLIPSE의 렌더 오프셋 보정 (absoluteRenderBounds vs absoluteBoundingBox)
 * - states prop 제거 (pseudo-class로 처리)
 * - 아이콘 SVG stroke 색상 hover/active 변경 (__raw CSS)
 */

import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import type { ComponentType, ConditionNode, PseudoClass } from "../../../../types/types";
import { convertStateDynamicToPseudo, rewritePropConditions } from "../processors/utils/rewritePropConditions";
import { StyleProcessor } from "../processors/StyleProcessor";

export class FabHeuristic implements IHeuristic {
  readonly name = "FabHeuristic";
  readonly componentType: ComponentType = "button";

  score(ctx: HeuristicContext): number {
    const name = ctx.componentName.toLowerCase();
    if (!name.includes("fab")) return 0;

    const children = ctx.tree.children;
    const hasEllipse = children.some((c) => c.type === "ELLIPSE");
    const hasInstance = children.some((c) => c.type === "INSTANCE");
    const hasText = children.some((c) => c.type === "TEXT");

    if (hasEllipse && hasInstance && !hasText) return 15;
    return 0;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // states prop 제거 + state dynamic → CSS pseudo-class 변환
    const statesIdx = ctx.props.findIndex((p) => p.name === "states" || p.name === "state");
    if (statesIdx !== -1) {
      const stateProp = ctx.props[statesIdx];
      // name은 normalized — condition.prop과 일치해야 함
      const removedProp = stateProp.name;
      ctx.props.splice(statesIdx, 1);
      convertStateDynamicToPseudo(ctx.tree, removedProp, StyleProcessor.STATE_TO_PSEUDO);

      // non-convertible state 값은 visibility 조건에 보존
      const conditionMap: Record<string, ConditionNode> = {};
      if (stateProp.type === "variant" && stateProp.options?.length) {
        for (const opt of stateProp.options) {
          if (!StyleProcessor.CSS_CONVERTIBLE_STATES.has(opt.toLowerCase())) {
            conditionMap[opt] = { type: "eq", prop: removedProp, value: opt };
          }
        }
      }
      rewritePropConditions(ctx.tree, removedProp, conditionMap);
    }

    // ELLIPSE 렌더 오프셋 보정
    this.fixEllipseRenderOffset(ctx);

    // 아이콘 hover/active stroke 색상 변경
    this.setIconHoverStroke(ctx);

    return {
      componentType: "button",
      rootNodeType: "button",
    };
  }

  /**
   * ELLIPSE의 SVG는 absoluteRenderBounds 기준 (shadow 포함)이지만
   * CSS left/top은 absoluteBoundingBox 기준.
   * 두 좌표계의 차이만큼 left/top을 조정하여 원형이 올바른 위치에 렌더링되도록 한다.
   */
  private fixEllipseRenderOffset(ctx: HeuristicContext): void {
    for (const child of ctx.tree.children) {
      if (child.type !== "ELLIPSE") continue;

      const { node: sceneNode } = ctx.dataManager.getById(child.id);
      if (!sceneNode) continue;

      const bbox = (sceneNode as any).absoluteBoundingBox;
      const renderBounds = (sceneNode as any).absoluteRenderBounds;
      if (!bbox || !renderBounds) continue;

      // 렌더 영역이 bbox보다 클 때만 보정 (effects가 있는 경우)
      if (renderBounds.width <= bbox.width && renderBounds.height <= bbox.height) continue;

      // offset = bbox 시작점 - renderBounds 시작점
      const offsetX = Math.round(bbox.x - renderBounds.x);
      const offsetY = Math.round(bbox.y - renderBounds.y);

      if (offsetX === 0 && offsetY === 0) continue;

      // CSS left/top 조정
      if (child.styles?.base) {
        const currentLeft = parseFloat(child.styles.base.left as string) || 0;
        const currentTop = parseFloat(child.styles.base.top as string) || 0;
        child.styles.base.left = `${currentLeft - offsetX}px`;
        child.styles.base.top = `${currentTop - offsetY}px`;
      }
    }
  }

  /**
   * 아이콘 INSTANCE의 variant별 SVG stroke 색상을 비교하여
   * hover/active 시 stroke 변경 CSS를 root button에 추가.
   *
   * root button에 걸어야 FAB 전체 영역(80x80)에서 호버 반응.
   * `& > div svg path` 셀렉터로 ELLIPSE SVG(<span>)에 영향 안 줌.
   *
   * variant별 mergedNode의 SVG stroke 추출 → 색상이 다르면
   * :hover/:active pseudo에 `& > div svg path { stroke: #color; }` 삽입.
   */
  private setIconHoverStroke(ctx: HeuristicContext): void {
    const iconInst = ctx.tree.children.find((c) => c.type === "INSTANCE");
    if (!iconInst || !iconInst.mergedNodes || iconInst.mergedNodes.length < 2) return;

    // variant별 stroke 색상 수집: variantName → stroke color
    const variantStrokes = new Map<string, string>();
    for (const m of iconInst.mergedNodes) {
      const svg = ctx.dataManager.getFirstVectorSvgByInstanceId(m.id);
      if (!svg) continue;
      const match = svg.match(/stroke="(#[0-9A-Fa-f]{3,8})"/);
      if (match) {
        variantStrokes.set(m.variantName || m.name, match[1]);
      }
    }

    if (variantStrokes.size < 2) return;

    // default stroke 추출 (default/Default 패턴)
    let defaultStroke: string | undefined;
    for (const [name, color] of variantStrokes) {
      if (/default/i.test(name)) {
        defaultStroke = color;
        break;
      }
    }
    if (!defaultStroke) defaultStroke = [...variantStrokes.values()][0];

    // 다른 색상이 없으면 종료
    const otherColors = new Set<string>();
    for (const color of variantStrokes.values()) {
      if (color !== defaultStroke) otherColors.add(color);
    }
    if (otherColors.size === 0) return;

    // pseudo-class 매핑: variant 이름에서 hover/active 감지
    const pseudoMap: Record<string, PseudoClass> = {
      hover: ":hover",
      active: ":active",
    };

    // root button에 pseudo 적용 (FAB 전체 영역에서 호버 반응)
    const root = ctx.tree;
    if (!root.styles) root.styles = { base: {}, dynamic: [] };
    if (!root.styles.pseudo) root.styles.pseudo = {};

    for (const [variantName, color] of variantStrokes) {
      if (color === defaultStroke) continue;

      // variant 이름에서 state 추출 (예: "states=hover" → "hover")
      const stateMatch = variantName.match(/states?=(\w+)/i);
      const state = stateMatch ? stateMatch[1].toLowerCase() : null;
      const pseudo = state ? pseudoMap[state] : null;
      if (!pseudo) continue;

      const existing = root.styles.pseudo[pseudo] || {};
      // & > div: icon container만 타겟 (ELLIPSE는 <span>이라 매치 안 됨)
      existing["__raw"] = `& > div svg path { stroke: ${color}; }`;
      root.styles.pseudo[pseudo] = existing;
    }
  }
}
