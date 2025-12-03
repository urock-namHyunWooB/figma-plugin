import taptabpButton from "../../../../../../test/fixtures/button/taptapButton.json";
import taptapButtonSample from "../../../../../../test/fixtures/button/taptapButton_sample.json";
import airtableButton from "../../../../../../test/fixtures/button/airtable-button.json";

import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { generateAST } from "../transform";
import { CodeGenerator } from "../codegen";
import Prettifier from "../prettifier";
import { FigmaRestApiResponse, PropIR } from "../types";
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

  const props: PropIR[] = [];

  Object.entries(variantStyleMap!).forEach(([key, value]) => {
    /**
     * SLOT 이면 Component 타입
     * value가 객체이면 VARIANT 타입
     */

    if (value === "SLOT") {
      // Slot 타입 처리
      props.push({
        id: key,
        originalName: key,
        normalizedName: key,
        type: "COMPONENT",
        optional: true,
        required: false,
      });
    } else if (typeof value === "object" && value !== null) {
      // Variant 타입 처리 (value 객체의 키들이 옵션 값)
      const options = Object.keys(value);

      props.push({
        id: key,
        originalName: key,
        normalizedName: key,
        type: "VARIANT",
        variantOptions: options,
        optional: false,
        required: true,
        defaultValue: options[0], // 첫 번째 옵션을 기본값으로 설정
      });
    }
  });

  //요리하기
  const { unifiedNode, props: props2 } = new Prettifier().prettify(
    unifiedAST,
    props
  );

  const codeGenerator = new CodeGenerator();
  const tsxCode = codeGenerator.generateComponentTSXWithTS(
    unifiedNode,
    props2,
    variantStyleMap!
  );

  return tsxCode;
}

export const transpileForDev = TranspileForDev(taptapButtonSample as any);
