/**
 * Style Interfaces
 *
 * StyleClassifier, PositionStyler 인터페이스
 */

import type { StyleDefinition, PreparedDesignData } from "@code-generator/types/architecture";
import type { ConditionNode, PseudoClass } from "@code-generator/types/customType";

// ============================================================================
// StyleClassifier Interface
// ============================================================================

export interface VariantStyle {
  variantName: string;
  cssStyle: Record<string, string>;
}

export interface IStyleClassifier {
  /** variant 스타일들을 base/dynamic/pseudo로 분류 */
  classifyStyles(
    variantStyles: VariantStyle[],
    parseCondition: (variantName: string) => ConditionNode | null
  ): StyleDefinition;

  /** variant 이름에서 State 값 추출 */
  extractStateFromVariantName(variantName: string): string | null;

  /** State 값을 CSS pseudo-class로 변환 */
  stateToPseudo(state: string): PseudoClass | null | undefined;

  /** 두 스타일 객체의 차이 계산 */
  diffStyles(
    baseStyle: Record<string, string>,
    targetStyle: Record<string, string>
  ): Record<string, string>;

  /** 여러 스타일에서 공통 스타일 추출 */
  extractCommonStyles(styles: Array<Record<string, string>>): Record<string, string>;
}

// ============================================================================
// PositionStyler Interface
// ============================================================================

export interface PositionResult {
  position: string;
  left?: string;
  top?: string;
  right?: string;
  bottom?: string;
}

/** Position 계산에 사용되는 노드 구조 */
export interface PositionableNode {
  id: string;
  type: string;
  name: string;
  children: PositionableNode[];
  styles: StyleDefinition | Record<string, string>;
}

export interface IPositionStyler {
  /** 노드의 position 스타일 계산 */
  calculatePosition(
    node: PositionableNode,
    parent: PositionableNode | null,
    data: PreparedDesignData
  ): PositionResult | null;

  /** auto-layout 여부 확인 */
  isAutoLayout(node: SceneNode): boolean;

  /** 회전된 요소 처리 */
  handleRotatedElement(nodeSpec: SceneNode, styles: Record<string, string>): Record<string, string>;
}
