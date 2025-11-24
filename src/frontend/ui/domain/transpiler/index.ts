/**
 * Transpiler 모듈
 *
 * Figma ComponentSetNodeSpec을 React TSX 코드로 변환
 */

// 타입 및 인터페이스 export
export type * from "./types";

// 구현체 export
export {
  ASTGenerator,
  TagMapper,
  Prettifier,
  generateAST,
} from "./transform/ast";
export { styleConverter } from "./transform/style/StyleConverter";
export { CodeGenerator } from "./codegen";

// Pipeline API export
export {
  transpile,
  createASTGenerator,
  createPrettifier,
  main,
} from "./pipeline";

// Props 변환 함수 export
export { buildPropsIR, prettifyPropsIR } from "./transform/props";
