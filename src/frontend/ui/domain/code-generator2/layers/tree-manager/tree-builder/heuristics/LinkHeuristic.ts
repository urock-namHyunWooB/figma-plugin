/**
 * LinkHeuristic
 *
 * Link 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: link, anchor, href (+10)
 * 2. 밑줄 스타일: textDecoration: underline (+10)
 * 3. 파란색 텍스트 (+5)
 *
 * semanticType 설정:
 * - 루트: "link"
 * - TEXT: "link-text"
 * - INSTANCE (icon): "icon"
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class LinkHeuristic implements IHeuristic {
  readonly name = "LinkHeuristic";
  readonly componentType: ComponentType = "link";

  // ===========================================================================
  // Score 계산
  // ===========================================================================

  score(ctx: HeuristicContext): number {
    let score = 0;

    // 1. 이름 패턴 매칭 (+10)
    score += this.scoreByName(ctx.componentName);

    // 2. 밑줄 스타일 (+10)
    score += this.scoreByUnderline(ctx);

    // 3. 파란색 텍스트 (+5)
    score += this.scoreByBlueText(ctx);

    return score;
  }

  /**
   * 이름 패턴 점수
   */
  private scoreByName(name: string): number {
    if (/^link$/i.test(name)) return 10;
    if (/anchor/i.test(name)) return 10;
    if (/hyperlink/i.test(name)) return 10;
    if (/text.?link/i.test(name)) return 10;

    return 0;
  }

  /**
   * 밑줄 스타일 점수
   */
  private scoreByUnderline(ctx: HeuristicContext): number {
    if (this.hasUnderlineStyle(ctx.tree, ctx)) {
      return 10;
    }
    return 0;
  }

  /**
   * 파란색 텍스트 점수
   */
  private scoreByBlueText(ctx: HeuristicContext): number {
    if (this.hasBlueText(ctx.tree, ctx)) {
      return 5;
    }
    return 0;
  }

  /**
   * 밑줄 스타일 감지 (재귀)
   */
  private hasUnderlineStyle(node: InternalNode, ctx: HeuristicContext): boolean {
    if (node.type === "TEXT") {
      const { node: spec } = ctx.dataManager.getById(node.id);
      const style = (spec as any)?.style;

      // textDecoration 확인
      if (style?.textDecoration === "UNDERLINE") {
        return true;
      }
    }

    // 재귀 탐색
    for (const child of node.children || []) {
      if (this.hasUnderlineStyle(child, ctx)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 파란색 텍스트 감지
   */
  private hasBlueText(node: InternalNode, ctx: HeuristicContext): boolean {
    if (node.type === "TEXT") {
      const { node: spec } = ctx.dataManager.getById(node.id);
      const fills = (spec as any)?.fills;

      if (fills && fills[0]?.type === "SOLID" && fills[0]?.color) {
        const color = fills[0].color;
        // 파란색 판별 (b > r && b > g && b > 0.5)
        if (color.b > color.r && color.b > color.g && color.b > 0.5) {
          return true;
        }
      }
    }

    // 재귀 탐색
    for (const child of node.children || []) {
      if (this.hasBlueText(child, ctx)) {
        return true;
      }
    }

    return false;
  }

  // ===========================================================================
  // Apply
  // ===========================================================================

  apply(ctx: HeuristicContext): HeuristicResult {
    // 루트에 semanticType 설정
    ctx.tree.semanticType = "link";

    // 자식 노드 semanticType 설정
    this.applyChildSemanticTypes(ctx.tree, ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "link",
    };
  }

  /**
   * 자식 노드에 semanticType 설정 (재귀)
   */
  private applyChildSemanticTypes(node: InternalNode, ctx: HeuristicContext): void {
    for (const child of node.children || []) {
      this.applySemanticType(child, ctx);
      this.applyChildSemanticTypes(child, ctx);
    }
  }

  /**
   * 단일 노드에 semanticType 설정
   */
  private applySemanticType(node: InternalNode, _ctx: HeuristicContext): void {
    if (node.semanticType) return;

    // TEXT → link-text
    if (node.type === "TEXT") {
      node.semanticType = "link-text";
      return;
    }

    // INSTANCE → icon
    if (node.type === "INSTANCE" || node.type === "VECTOR") {
      const name = node.name.toLowerCase();
      if (/icon|arrow|external|chevron/.test(name)) {
        node.semanticType = "icon";
        return;
      }

      const bounds = node.bounds;
      if (bounds && bounds.width <= 24 && bounds.height <= 24) {
        node.semanticType = "icon";
        return;
      }
    }
  }
}
