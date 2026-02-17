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

/**
 * Variant 스타일 정보
 * @property variantName - variant 이름
 * @property cssStyle - CSS 스타일 객체
 */
export interface VariantStyle {
  variantName: string;
  cssStyle: Record<string, string>;
}

/**
 * 스타일 분류 인터페이스
 */
export interface IStyleClassifier {
  /**
   * variant 스타일들을 base/dynamic/pseudo로 분류
   * @param variantStyles - variant 스타일 배열
   * @param parseCondition - variant 이름을 ConditionNode로 파싱하는 함수
   * @returns 분류된 StyleDefinition
   */
  classifyStyles(
    variantStyles: VariantStyle[],
    parseCondition: (variantName: string) => ConditionNode | null
  ): StyleDefinition;

  /**
   * variant 이름에서 State 값 추출
   * @param variantName - variant 이름 (예: "State=Hover, Size=Large")
   * @returns State 값 또는 null
   */
  extractStateFromVariantName(variantName: string): string | null;

  /**
   * State 값을 CSS pseudo-class로 변환
   * @param state - State 값 (예: "Hover", "Active", "Disabled")
   * @returns PseudoClass, null (default state), 또는 undefined (변환 불가)
   */
  stateToPseudo(state: string): PseudoClass | null | undefined;

  /**
   * 두 스타일 객체의 차이 계산
   * @param baseStyle - 기준 스타일 객체
   * @param targetStyle - 비교 대상 스타일 객체
   * @returns 차이나는 스타일 속성들
   */
  diffStyles(
    baseStyle: Record<string, string>,
    targetStyle: Record<string, string>
  ): Record<string, string>;

  /**
   * 여러 스타일에서 공통 스타일 추출
   * @param styles - 스타일 객체 배열
   * @returns 공통 스타일 속성들
   */
  extractCommonStyles(styles: Array<Record<string, string>>): Record<string, string>;
}

// ============================================================================
// PositionStyler Interface
// ============================================================================

/**
 * Position 계산 결과
 * @property position - CSS position 값
 * @property left - CSS left 값 (선택적)
 * @property top - CSS top 값 (선택적)
 * @property right - CSS right 값 (선택적)
 * @property bottom - CSS bottom 값 (선택적)
 */
export interface PositionResult {
  position: string;
  left?: string;
  top?: string;
  right?: string;
  bottom?: string;
}

/**
 * Position 계산에 사용되는 노드 구조
 * @property id - 노드 ID
 * @property type - 노드 타입
 * @property name - 노드 이름
 * @property children - 자식 노드 배열
 * @property styles - 스타일 정의
 */
export interface PositionableNode {
  id: string;
  type: string;
  name: string;
  children: PositionableNode[];
  styles: StyleDefinition | Record<string, string>;
}

/**
 * Position 스타일 계산 인터페이스
 */
export interface IPositionStyler {
  /**
   * 노드의 position 스타일 계산
   * @param node - 대상 노드
   * @param parent - 부모 노드 (nullable)
   * @param data - 전처리된 디자인 데이터
   * @returns PositionResult 또는 null
   */
  calculatePosition(
    node: PositionableNode,
    parent: PositionableNode | null,
    data: PreparedDesignData
  ): PositionResult | null;

  /**
   * auto-layout 여부 확인
   * @param node - SceneNode
   * @returns auto-layout 여부
   */
  isAutoLayout(node: SceneNode): boolean;

  /**
   * 회전된 요소 처리
   * @param nodeSpec - SceneNode
   * @param styles - 현재 스타일 객체
   * @returns 회전 처리된 스타일 객체
   */
  handleRotatedElement(nodeSpec: SceneNode, styles: Record<string, string>): Record<string, string>;
}
