import taptabpButton from "../../../../../../test/fixtures/button/taptapButton.json";
import airtableButton from "../../../../../../test/fixtures/button/airtable-button.json";
import taptabpButtonFigmaDSL from "../../../../../../test/fixtures/button/taptapButton_figmaDSL.json";

import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { generateAST } from "../transform";
import { CodeGenerator } from "../codegen";
import Prettifier from "../prettifier";
import { FigmaRestApiResponse } from "../types";
import { FigmaNodeData } from "../types/figma-api";

/**
 * High-level Transpiler API
 *
 * ComponentSetNodeSpec을 받아서 TSX 코드 문자열을 반환
 */
export function transpile(spec: ComponentSetNodeSpec): string {
  // 각 재료 준비
  const ast = generateAST(spec);

  //요리하기
  const prettyAST = new Prettifier().prettify(ast);

  console.log(prettyAST);

  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(prettyAST);

  return tsxCode;
}

function TranspileForDev(spec: ComponentSetNodeSpec) {
  // 각 재료 준비
  const ast = generateAST(spec);
  console.log("ast", ast);
  //요리하기
  const prettyAST = new Prettifier().prettify(ast);

  console.log("prettyAST", prettyAST);

  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(prettyAST);

  return tsxCode;
}

export const transpileForDev = TranspileForDev(
  taptabpButton as unknown as ComponentSetNodeSpec
);
