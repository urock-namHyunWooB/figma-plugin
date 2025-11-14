import type { ComponentAST } from "../ast";

/**
 * ComponentAST를 코드 문자열로 변환하는 인터페이스
 */
export interface ICodeGenerator {
  /**
   * ComponentAST를 TSX 코드 문자열로 변환
   */
  generateComponentTSXWithTS(ast: ComponentAST): string;
}

