import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";

/**
 * Layout 노드를 스타일 객체로 변환하는 인터페이스
 */
export interface IStyleConverter {
  /**
   * Layout 노드와 Figma 타입을 기반으로 스타일 객체 생성
   */
  layoutNodeToStyle(
    node: LayoutTreeNode | undefined,
    figmaType: string,
  ): Record<string, any>;
}
