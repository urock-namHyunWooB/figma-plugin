import taptabpButton from "./assets/taptapButton.json";
import pagination from "./assets/pagination.json";

import { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
// 인터페이스 export
export type * from "./src/interfaces";

// 구현체 export
export * from "./src/implementations";

// 구현체 import (내부 사용)
import {
  ASTGenerator,
  CodeGenerator,
  styleConverter,
  TagMapper,
} from "./src/implementations";
import { Prettifier } from "./src/implementations/prettifier/Prettifier";

// 팩토리 함수: 기본 구현체들을 조합하여 ASTGenerator 인스턴스 생성
export function createASTGenerator() {
  const tagMapper = new TagMapper();

  return new ASTGenerator(tagMapper, styleConverter);
}

export function createPrettifier() {
  return new Prettifier();
}

export function main() {
  const astGenerator = createASTGenerator();
  const ast = astGenerator.componentNodeSpecToAST(
    pagination as ComponentSetNodeSpec,
  );

  const prettifier = createPrettifier();
  const prettyAST = prettifier.prettify(ast);

  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(prettyAST);
  console.log(tsxCode);
}

main();
