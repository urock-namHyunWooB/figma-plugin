import type { ElementASTNode } from "../../types";

/**
 * 노드 제거 판단 로직을 담당하는 클래스
 */
export class NodeRemover {
  /**
   * 노드가 제거되어야 하는지 판단
   */
  public shouldRemove(
    node: ElementASTNode,
    cleanedStyle: Record<string, any>,
  ): boolean {
    const isHrTag = node.tag === "hr";
    const hasNoHeight =
      cleanedStyle.height === 0 || cleanedStyle.height === undefined;
    return isHrTag && hasNoHeight;
  }
}

