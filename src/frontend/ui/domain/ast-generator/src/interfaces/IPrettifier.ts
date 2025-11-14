import type { ComponentAST } from "../ast";

/**
 * ComponentAST를 정리하고 최적화하는 인터페이스
 */
export interface IPrettifier {
  /**
   * ComponentAST를 정리하여 반환
   */
  prettify(ast: ComponentAST): ComponentAST;
}
