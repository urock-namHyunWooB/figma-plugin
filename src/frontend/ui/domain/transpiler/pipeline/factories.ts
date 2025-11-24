import { ASTGenerator, TagMapper, Prettifier } from "../transform/ast";
import { styleConverter } from "@frontend/ui/domain/transpiler";

/**
 * 팩토리 함수: 기본 구현체들을 조합하여 인스턴스 생성
 */

/**
 * ASTGenerator 인스턴스 생성
 */
export function createASTGenerator(): ASTGenerator {
  const tagMapper = new TagMapper();
  return new ASTGenerator(tagMapper, styleConverter);
}

/**
 * Prettifier 인스턴스 생성
 */
export function createPrettifier(): Prettifier {
  return new Prettifier();
}
