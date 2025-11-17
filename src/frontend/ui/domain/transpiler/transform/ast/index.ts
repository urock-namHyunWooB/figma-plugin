/**
 * AST 변환 관련 구현체 모음
 */

import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { ComponentAST, PropIR, BindingModel } from "../../types";
import type { VariantStyleIR } from "../../types/props";
import { buildPropsIR, prettifyPropsIR } from "../props";
import buildBindingModel from "../binding";
import { ASTGenerator } from "./ast-generator";
import { Prettifier } from "./ast-prettifier";
import { TagMapper } from "./tag-mapper";
import {
  styleConverter,
  createBaseStyle,
  buildVariantStylesForProps,
} from "../style";

export { ASTGenerator, TagMapper, Prettifier };

/**
 * AST 생성 통합 함수
 * 내부적으로 props, binding을 처리하여 AST를 생성
 */
export function generateAST(spec: ComponentSetNodeSpec): {
  ast: ComponentAST;
  propsIR: PropIR[];
  variantStyleMap: Map<string, VariantStyleIR>;
  bindingModel: BindingModel;
} {
  // 1. Base style 및 variant styles 생성 (스타일 모듈에서 처리)
  const baseStyle = createBaseStyle(spec.layoutTree);
  const variantStyleMap = buildVariantStylesForProps(spec, baseStyle);

  // 2. Props IR 생성 (props만 변환)
  const propsIR = buildPropsIR(spec);

  // 3. Props IR 정리
  const prettyPropsIR = prettifyPropsIR(propsIR);

  // 4. Binding Model 생성
  const bindingModel = buildBindingModel(spec);

  // 5. AST 생성
  const astGenerator = new ASTGenerator(new TagMapper(), styleConverter);
  const ast = astGenerator.componentNodeSpecToAST(spec, bindingModel);

  // 6. AST 정리
  const prettifier = new Prettifier();
  const prettyAST = prettifier.prettify(ast);

  return {
    ast: prettyAST,
    propsIR: prettyPropsIR,
    variantStyleMap,
    bindingModel,
  };
}
