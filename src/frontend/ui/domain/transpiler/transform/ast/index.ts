/**
 * AST 변환 관련 구현체 모음
 */

import { ASTGenerator } from "./ast-generator";
import { Prettifier } from "../../prettifier/Prettifier";
import { TagMapper } from "./tag-mapper";
import { buildStyleTree } from "../style/layoutTreeConverter";
import { FigmaNodeData } from "../../types/figma-api";
import { VariantStyleBuilder } from "../style/variant-style";
import { createUnifiedNode, mergeVariantIntoUnified } from "./structure/merger";
import { sanitizeNode } from "./structure/sanitizeNode";
import { UnifiedNode, VirtualNode } from "../../types";
import { createStyleMap } from "../../utils/util";

/**
 * 컴포넌트를 만들기 위한 재료 준비 레이어
 * ComponentSetNode 전용
 */
export function generateAST(spec: FigmaNodeData) {
  const baseStyle = buildStyleTree(spec);
  const variantStyleMap = new VariantStyleBuilder(
    spec,
    baseStyle!
  ).buildVariantStyles();

  const rootNode = spec.info.document;
  const componentSet = rootNode as ComponentSetNode;

  const variantsData: { name: string; root: VirtualNode }[] = [];

  const globalStyleMap = createStyleMap(spec.styleTree!);

  componentSet.children.forEach((child) => {
    // child는 ComponentNode (Variant)
    const vNode = sanitizeNode(child, globalStyleMap);

    if (vNode) {
      variantsData.push({
        name: child.name, // 예: "Property 1=Default"
        root: vNode,
      });
    }
  });

  const baseVariant = variantsData[0];

  // 초기 슈퍼셋 트리 생성 (아직은 Base 정보만 있음)
  const unifiedAST: UnifiedNode = createUnifiedNode(
    baseVariant.root,
    baseVariant.name
  );

  const targetVariants = variantsData.slice(1);

  targetVariants.forEach((target, index) => {
    mergeVariantIntoUnified(unifiedAST, target.root, target.name);
  });

  return { unifiedAST, variantStyleMap };
}

export { ASTGenerator, TagMapper, Prettifier };
