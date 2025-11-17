import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { generateAST } from "../transform";
import { CodeGenerator } from "../codegen";

/**
 * High-level Transpiler API
 *
 * ComponentSetNodeSpec을 받아서 TSX 코드 문자열을 반환
 */
export function transpile(spec: ComponentSetNodeSpec): string {
  // 1. AST 생성 (내부적으로 props, binding 처리)
  const { ast, propsIR, variantStyleMap, bindingModel } = generateAST(spec);

  // 2. 코드 생성
  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(
    ast,
    propsIR,
    variantStyleMap,
    bindingModel,
  );

  return tsxCode;
}
