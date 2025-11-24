/**
 * AST 변환 관련 구현체 모음
 */

import { buildPropsIR } from "../props";
import buildBindingModel from "../binding";
import { ASTGenerator } from "./ast-generator";
import { Prettifier } from "../../prettifier/Prettifier";
import { TagMapper } from "./tag-mapper";
import { buildVariantStyles } from "../style";
import { styleConverter } from "@frontend/ui/domain/transpiler";
import { buildStyleTree } from "../style/layoutTreeConverter";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";
import { buildStateBindings } from "../binding/state/binding-state";
import { FigmaNodeData } from "../../types/figma-api";

/**
 * AST 생성 통합 함수
 * 내부적으로 props, binding을 처리하여 AST를 생성
 * ComponentSetNode 전용
 */
export function generateAST(spec: FigmaNodeData): AstTree {
  // 1. 공통 baseStyle 생성 (먼저 생성하여 공유)
  const baseStyle = buildStyleTree(spec);

  // 2. Variant Styles 생성 (baseStyle을 공유받아 사용)
  const variantStyleMap = buildVariantStyles(spec, baseStyle);

  // 3. Style Tree 생성 (노드 바인딩용)
  const styleTree = buildStyleTree(spec.layoutTree);

  // 4. Props IR 생성 (props만 변환)
  const propsData = buildPropsIR(spec);

  // 5. Binding Model 생성
  const { bindings: bindingData, slots } = buildBindingModel(spec);

  // 6. State Bindings 생성
  const stateBindings = buildStateBindings(spec);

  // 7. AST 생성
  const astGenerator = new ASTGenerator(new TagMapper(), styleConverter);
  const ast = astGenerator.dslSpecToAST(spec);
  const combinedAst = astGenerator.combineAllToAst({
    ast,
    propsData,
    bindingData,
    slots,
    styleData: { styleTree, variantStyleMap },
    baseStyle, // baseStyle 전달
  });

  // // State 정보 추가
  // combinedAst.states = stateBindings;

  return combinedAst;
}

export { ASTGenerator, TagMapper, Prettifier };
