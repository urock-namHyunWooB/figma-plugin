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
 */

import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import type { ComponentType, InternalNode } from "../../../../types/types";

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
    // states prop 제거 (pseudo-class로 이미 처리됨)
    ctx.props = ctx.props.filter((p) => p.name !== "states");

    // ELLIPSE 렌더 오프셋 보정
    this.fixEllipseRenderOffset(ctx);

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
}
