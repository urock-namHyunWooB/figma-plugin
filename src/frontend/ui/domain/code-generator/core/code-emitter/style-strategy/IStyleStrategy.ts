/**
 * IStyleStrategy
 *
 * DesignTree용 스타일 전략 인터페이스
 * Emotion, Tailwind 등 다양한 CSS 프레임워크를 지원하기 위한 추상화
 *
 * 레거시 StyleStrategy와 달리 FinalAstTree 대신 DesignTree를 사용합니다.
 */

import ts from "typescript";
import type { DesignTree, DesignNode, PropDefinition } from "@code-generator/types/architecture";

/**
 * 동적 스타일 정보
 * JSX 속성 생성 시 동적 스타일 처리에 필요한 정보
 */
export interface DynamicStyleInfo {
  /** prop 이름 → variant 값 배열 매핑 */
  propToVariants: Map<string, string[]>;
  /** 각 variant에 해당하는 스타일/클래스 */
  variantStyles: Map<string, string>;
}

/**
 * 스타일 전략 인터페이스
 * DesignTree 기반 코드 생성을 위한 추상화
 */
export interface IStyleStrategy {
  /** 전략 이름 */
  readonly name: "emotion" | "tailwind";

  /**
   * 필요한 import 문 생성
   * - Emotion: import { css } from '@emotion/react'
   * - Tailwind: (인라인 cn 사용 시 없음)
   * @returns TypeScript import 선언 배열
   */
  generateImports(): ts.ImportDeclaration[];

  /**
   * 스타일 선언부 생성
   * - Emotion: const FrameCss = css`...`, const sizeStyles = {...}
   * - Tailwind: const cn = ..., const sizeClasses = {...}
   * @param tree - DesignTree 구조
   * @param componentName - 컴포넌트 이름 (CSS 변수명 생성에 사용)
   * @param props - Props 정의 (타입 생성에 사용)
   * @returns TypeScript statement 배열
   */
  generateDeclarations(
    tree: DesignTree,
    componentName: string,
    props: PropDefinition[]
  ): ts.Statement[];

  /**
   * JSX 요소에 적용할 스타일 속성 생성
   * - Emotion: css={frameCss(size)}
   * - Tailwind: className={cn("flex p-4", sizeClasses[size])}
   * @param node - 스타일을 적용할 DesignNode
   * @param props - Props 정의 (동적 스타일 참조용)
   * @returns JSX 스타일 속성 또는 스타일이 없으면 null
   */
  createStyleAttribute(
    node: DesignNode,
    props: PropDefinition[]
  ): ts.JsxAttribute | null;

  /**
   * 노드의 동적 스타일 정보 조회
   * ComponentGenerator에서 동적 스타일 처리 시 사용
   * @param node - 조회할 DesignNode
   * @returns 동적 스타일 정보 또는 없으면 null
   */
  getDynamicStyleInfo(node: DesignNode): DynamicStyleInfo | null;

  /**
   * 노드별 CSS 변수 이름 조회
   * 스타일 생성과 JSX 참조 간 일관성을 위해 사용
   * @param node - 조회할 DesignNode
   * @param componentName - 컴포넌트 이름
   * @returns CSS 변수 이름
   */
  getCssVariableName(node: DesignNode, componentName: string): string;
}

/**
 * 스타일 전략 타입
 */
export type StyleStrategyType = "emotion" | "tailwind";

/**
 * 스타일 전략 옵션
 */
export interface StyleStrategyOptions {
  /** 사용할 스타일 전략 */
  type: StyleStrategyType;

  /** Tailwind 전용 옵션 */
  tailwind?: {
    /** cn/clsx 함수 import 경로 (inlineCn이 false일 때 사용) */
    cnImportPath?: string;
    /** cn 함수를 인라인으로 생성할지 여부 (기본: true, 의존성 없이 동작) */
    inlineCn?: boolean;
    /** arbitrary value 사용 여부 (기본: true) */
    useArbitraryValues?: boolean;
  };
}
