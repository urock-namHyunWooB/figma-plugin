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
import { VariantStyleBuilder } from "../style/variant-style";
import { mergeStructureNodes } from "./structure/merger";

/**
 * 컴포넌트를 만들기 위한 재료 준비 레이어
 * ComponentSetNode 전용
 */
export function generateAST(spec: FigmaNodeData): AstTree {
  const baseStyle = buildStyleTree(spec);
  const variantStyleMap = new VariantStyleBuilder(
    spec,
    baseStyle!
  ).buildVariantStyles();

  const rootNode = spec.info.document;
  let structureRoot;

  // 구조 분석 실행
  if (rootNode.type === "COMPONENT_SET") {
    // COMPONENT_SET인 경우 자식들(Variants)을 병합
    // 주의: COMPONENT_SET의 자식들은 COMPONENT 노드들임
    structureRoot = mergeStructureNodes(rootNode.children, rootNode.children);
  } else {
    // 단일 컴포넌트인 경우 자기 자신 1개로 병합 (무조건 Fixed)
    structureRoot = mergeStructureNodes([rootNode], [rootNode]);
  }

  debugger;

  const astTree = {
    name: spec.info.document.name,
    nodeTree: spec.info.document,
    style: {
      baseStyle,
      variantStyleMap,
      styleTree: spec.styleTree,
    },
    structure: {
      root: structureRoot,
      variantCount:
        rootNode.type === "COMPONENT_SET" ? rootNode.children.length : 1,
    },
  };

  // [DEBUG] 구조 분석 결과 출력
  console.log("=== Analyzed Structure Root ===");
  console.log(
    JSON.stringify(
      astTree.structure.root,
      (key, value) => {
        // 보기 편하게 필터링
        if (key === "variants") return `[${value.length} Variants]`;
        if (key === "variantMap") {
          const simpleMap: any = {};
          for (const k in value)
            simpleMap[k] = value[k]
              ? `${value[k].type}(${value[k].name})`
              : "null";
          return simpleMap;
        }
        return value;
      },
      2
    )
  );
  console.log("===============================");

  return astTree;
}

export { ASTGenerator, TagMapper, Prettifier };
