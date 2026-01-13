import ts from "typescript";
import { FinalAstTree } from "@compiler";

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
 * Emotion, Tailwind 등 다양한 CSS 프레임워크를 지원하기 위한 추상화
 */
export interface StyleStrategy {
  /** 전략 이름 */
  readonly name: "emotion" | "tailwind";

  /**
   * 필요한 import 문 생성
   * - Emotion: import { css } from '@emotion/react'
   * - Tailwind: import { cn } from '@/lib/utils'
   */
  generateImports(): ts.ImportDeclaration[];

  /**
   * 스타일 선언부 생성
   * - Emotion: const FrameCss = css`...`, const sizeStyles = {...}
   * - Tailwind: const sizeClasses = {...} (또는 없음)
   */
  generateDeclarations(
    astTree: FinalAstTree,
    componentName: string
  ): ts.Statement[];

  /**
   * JSX 요소에 적용할 스타일 속성 생성
   * - Emotion: css={frameCss(size)}
   * - Tailwind: className={cn("flex p-4", sizeClasses[size])}
   */
  createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null;

  /**
   * 노드의 동적 스타일 정보 조회
   * CreateJsxTree에서 동적 스타일 처리 시 사용
   */
  getDynamicStyleInfo(node: FinalAstTree): DynamicStyleInfo | null;
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
