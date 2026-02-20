/**
 * ButtonHeuristic
 *
 * 버튼 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: button, btn, cta (+10)
 * 2. State prop에 pressed/active 있음 (+10)
 * 3. 시각적 특성: 높이 24-64px, 배경/테두리, 짧은 텍스트 (+10)
 *
 * semanticType 설정:
 * - 루트: "button"
 * - TEXT 노드: "label"
 * - INSTANCE/VECTOR (작은 크기): "icon"
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class ButtonHeuristic implements IHeuristic {
  readonly name = "ButtonHeuristic";
  readonly componentType: ComponentType = "button";

  // ===========================================================================
  // Score 계산
  // ===========================================================================

  score(ctx: HeuristicContext): number {
    let score = 0;

    // 1. 이름 패턴 매칭 (+10)
    score += this.scoreByName(ctx.componentName);

    // 2. State prop 매칭 (+10)
    score += this.scoreByStateProp(ctx.propDefs);

    // 3. 시각적 특성 매칭 (+10)
    score += this.scoreByVisual(ctx);

    return score;
  }

  /**
   * 이름 패턴 점수
   */
  private scoreByName(name: string): number {
    const lowerName = name.toLowerCase();

    // 정확한 매칭
    if (/button/i.test(name)) return 10;
    if (/^btn$/i.test(name)) return 10;
    if (/^cta$/i.test(name)) return 10;

    // 수식어 가산점
    let bonus = 0;
    if (/primary/i.test(lowerName)) bonus += 3;
    if (/secondary/i.test(lowerName)) bonus += 3;
    if (/tertiary/i.test(lowerName)) bonus += 3;

    return bonus;
  }

  /**
   * State prop 점수
   */
  private scoreByStateProp(
    propDefs: Record<string, { type?: string; variantOptions?: string[] }> | undefined
  ): number {
    if (!propDefs) return 0;

    // State prop 찾기
    const stateProp = Object.entries(propDefs).find(
      ([key]) => key.toLowerCase() === "state"
    );

    if (!stateProp || stateProp[1].type !== "VARIANT") return 0;

    const options = stateProp[1].variantOptions || [];
    const normalizedOptions = options.map((s) => s.toLowerCase());

    // pressed/active가 있으면 버튼
    if (normalizedOptions.some((s) => s === "pressed" || s === "active")) {
      return 10;
    }

    // selected + hover + disabled 조합 → Toggle Button
    const hasSelected = normalizedOptions.some((s) => s.includes("selected"));
    const hasHover = normalizedOptions.some((s) => s === "hover" || s === "hovered");
    const hasDisabled = normalizedOptions.some((s) => s.includes("disabled"));

    if (hasSelected && hasHover && hasDisabled) {
      return 10;
    }

    return 0;
  }

  /**
   * 시각적 특성 점수
   */
  private scoreByVisual(ctx: HeuristicContext): number {
    const rootBounds = ctx.tree.bounds;
    if (!rootBounds) return 0;

    let score = 0;

    // 높이 24-64px
    if (rootBounds.height >= 24 && rootBounds.height <= 64) {
      score += 2;
    }

    // 가로세로 비율 1-6
    const ratio = rootBounds.width / rootBounds.height;
    if (ratio >= 1 && ratio <= 6) {
      score += 2;
    }

    // 자식 노드 확인
    const children = ctx.tree.children || [];

    // 짧은 TEXT 있음
    const hasShortText = children.some((child) => {
      if (child.type !== "TEXT") return false;
      const spec = ctx.dataManager.getById(child.id)?.node;
      const text = (spec as any)?.characters || "";
      return text.length <= 20;
    });
    if (hasShortText) score += 3;

    // INSTANCE 또는 VECTOR 있음 (아이콘)
    const hasIcon = children.some(
      (child) => child.type === "INSTANCE" || child.type === "VECTOR"
    );
    if (hasIcon) score += 3;

    return score;
  }

  // ===========================================================================
  // Apply
  // ===========================================================================

  apply(ctx: HeuristicContext): HeuristicResult {
    // 루트에 semanticType 설정
    ctx.tree.semanticType = "button";

    // 자식 노드 semanticType 설정
    this.applyChildSemanticTypes(ctx.tree, ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * 자식 노드에 semanticType 설정 (재귀)
   */
  private applyChildSemanticTypes(node: InternalNode, ctx: HeuristicContext): void {
    for (const child of node.children || []) {
      this.applySemanticType(child, ctx);
      // 재귀
      this.applyChildSemanticTypes(child, ctx);
    }
  }

  /**
   * 단일 노드에 semanticType 설정
   */
  private applySemanticType(node: InternalNode, ctx: HeuristicContext): void {
    // 이미 설정되어 있으면 스킵
    if (node.semanticType) return;

    // 1. TEXT → label
    if (node.type === "TEXT") {
      node.semanticType = "label";
      return;
    }

    // 2. INSTANCE/VECTOR → icon 판별
    if (node.type === "INSTANCE" || node.type === "VECTOR") {
      if (this.isIcon(node, ctx)) {
        node.semanticType = "icon";
        return;
      }
    }

    // 3. spacer 판별 (작은 vector/rectangle)
    if (this.isSpacer(node, ctx)) {
      node.semanticType = "spacer";
      return;
    }

    // 4. icon wrapper 판별 (FRAME/GROUP with single icon child)
    if (this.isIconWrapper(node, ctx)) {
      node.semanticType = "icon-wrapper";
      return;
    }
  }

  /**
   * 아이콘 판별
   */
  private isIcon(node: InternalNode, ctx: HeuristicContext): boolean {
    // 이름 패턴
    const name = node.name.toLowerCase();
    if (/icon|icn|arrow|chevron|plus|minus|check|close|x/.test(name)) {
      return true;
    }

    // bounds로 판별 (작은 크기)
    const bounds = node.bounds;
    if (bounds && bounds.width <= 32 && bounds.height <= 32) {
      return true;
    }

    // bounds가 없으면 DataManager에서 조회
    const { node: spec } = ctx.dataManager.getById(node.id);
    const specBounds = (spec as any)?.absoluteBoundingBox;
    if (specBounds && specBounds.width <= 32 && specBounds.height <= 32) {
      return true;
    }

    return false;
  }

  /**
   * spacer 판별
   */
  private isSpacer(node: InternalNode, ctx: HeuristicContext): boolean {
    // VECTOR, RECTANGLE, LINE만 spacer가 될 수 있음
    if (!["VECTOR", "RECTANGLE", "LINE"].includes(node.type)) {
      return false;
    }

    // 이름 패턴
    const name = node.name.toLowerCase();
    if (/spacer|min.?width|gap|divider/.test(name)) {
      return true;
    }

    // 매우 작은 크기 (한 축이 1-4px)
    const bounds = node.bounds;
    if (bounds) {
      if (bounds.width <= 4 || bounds.height <= 4) {
        return true;
      }
    }

    return false;
  }

  /**
   * icon wrapper 판별 (FRAME/GROUP with icon children only)
   */
  private isIconWrapper(node: InternalNode, ctx: HeuristicContext): boolean {
    if (node.type !== "FRAME" && node.type !== "GROUP") {
      return false;
    }

    const children = node.children || [];
    if (children.length === 0) return false;

    // 모든 자식이 icon 또는 icon이 될 수 있는 노드인지 확인
    return children.every((child) => {
      if (child.type === "INSTANCE" || child.type === "VECTOR") {
        return this.isIcon(child, ctx);
      }
      return false;
    });
  }
}
