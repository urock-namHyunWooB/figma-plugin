import taptabpButton from "../../../../../../test/fixtures/button/taptapButton.json";
import taptapButtonSample from "../../../../../../test/fixtures/button/taptapButton_sample.json";
import airtableButton from "../../../../../../test/fixtures/button/airtable-button.json";

import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { generateAST } from "../transform";
import { CodeGenerator } from "../codegen";
import Prettifier from "../prettifier";
import { FigmaRestApiResponse } from "../types";
import { FigmaNodeData } from "../types/figma-api";
import { createComponentSourceFile } from "@frontend/ui/domain/transpiler/codegen/react2/ast-factory";
import { printAST } from "@frontend/ui/domain/transpiler/codegen/react2/printer";

/**
 * High-level Transpiler API
 *
 * ComponentSetNodeSpec을 받아서 TSX 코드 문자열을 반환
 */
export function transpile(spec: FigmaNodeData): string {
  // 각 재료 준비
  const ast = generateAST(spec);

  //요리하기
  const prettyAST = new Prettifier().prettify(ast);

  console.log(prettyAST);

  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(prettyAST);

  return tsxCode;
}

function TranspileForDev(spec: FigmaNodeData) {
  // 각 재료 준비
  const { unifiedAST, variantStyleMap } = generateAST(spec);

  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(
    unifiedAST,
    [],
    variantStyleMap!
  );

  console.log(tsxCode);

  //요리하기
  // const prettyAST = new Prettifier().prettify(ast);

  return 1;
}

export const transpileForDev = TranspileForDev(taptapButtonSample as any);
