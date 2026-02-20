/**
 * IStyleStrategy
 *
 * 스타일 전략 인터페이스
 * Emotion, Tailwind 등 다양한 스타일 방식을 추상화
 */

import type { StyleObject, PseudoClass } from "../../../types/types";

/** 스타일 생성 결과 */
export interface StyleResult {
  /** 스타일 변수명 (예: buttonStyles) */
  variableName: string;
  /** 스타일 코드 */
  code: string;
}

/** JSX 스타일 속성 */
export interface JsxStyleAttribute {
  /** 속성명 (className, css 등) */
  attributeName: string;
  /** 속성값 코드 */
  valueCode: string;
}

export interface IStyleStrategy {
  /** 전략 이름 */
  readonly name: string;

  /**
   * import 문 생성
   */
  getImports(): string[];

  /**
   * 스타일 객체를 코드로 변환
   * @param nodeId 노드 ID
   * @param nodeName 노드 이름
   * @param style StyleObject
   * @returns 스타일 코드
   */
  generateStyle(nodeId: string, nodeName: string, style: StyleObject): StyleResult;

  /**
   * JSX 요소의 스타일 속성 생성
   * @param styleVariableName 스타일 변수명
   * @param hasConditionalStyles 조건부 스타일 여부
   * @returns JSX 속성
   */
  getJsxStyleAttribute(
    styleVariableName: string,
    hasConditionalStyles: boolean
  ): JsxStyleAttribute;

  /**
   * 조건부 스타일 코드 생성
   * @param baseStyle 기본 스타일 변수명
   * @param conditions 조건부 스타일 배열
   * @returns 조건부 스타일 코드
   */
  generateConditionalStyle(
    baseStyle: string,
    conditions: Array<{ condition: string; style: string }>
  ): string;

  /**
   * pseudo-class 스타일 코드 생성
   * @param pseudoClass pseudo-class (예: ":hover")
   * @param style 스타일 객체
   * @returns pseudo-class 스타일 코드
   */
  generatePseudoStyle(
    pseudoClass: PseudoClass,
    style: Record<string, string | number>
  ): string;
}
