import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type {
  ElementASTNode,
  IASTGenerator,
  ITagMapper,
  BindingModel,
} from "../../types";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

import { NodeSpec } from "@backend";
import { StyleTreeNode } from "../../types/styles";
import { PrettifierContext } from "../../prettifier/strategies/IPrettifierStrategy";
import { FigmaNodeData } from "../../types/figma-api";

type ComponentStructureData = NonNullable<
  ComponentSetNodeSpec["componentStructure"]
>;
type FigmaStructureNode = ComponentStructureData["root"];

/**
 * Figma ComponentSetNodeSpec을 ComponentAST로 변환하는 구현체
 */
export class ASTGenerator implements IASTGenerator {
  constructor(private readonly tagMapper: ITagMapper) {}

  public dslSpecToAST(spec: FigmaNodeData): AstTree {
    const rootFigmaNode = spec.info.document;

    const rootAST = this.figmaNodeToAST(rootFigmaNode);

    return {
      styleFeature: {},
      name: spec.metadata.name,
      root: rootAST,
      props: [],
      figmaInfo: spec.figmaInfo,
    };
  }

  public combineAllToAst(params: PrettifierContext): AstTree {
    const { ast, styleData, bindingData, propsData, slots, baseStyle } = params;

    // variantStyleMap의 각 variant의 baseStyle을 styleFeature.baseStyle로 링킹
    if (baseStyle && styleData.variantStyleMap) {
      for (const variantStyle of styleData.variantStyleMap.values()) {
        variantStyle.baseStyle = baseStyle; // 부모의 baseStyle을 참조
      }
    }

    const combinedAst: AstTree = {
      styleFeature: {
        baseStyle: baseStyle ?? null, // 공통 baseStyle 저장
        variantStyleMap: styleData.variantStyleMap,
      },
      props: propsData,
      name: ast.name,
      root: this.bindDataToNode(ast.root, styleData, bindingData, slots),
      figmaInfo: ast.figmaInfo,
    };

    return combinedAst;
  }

  /**
   * AST 노드에 스타일과 바인딩 데이터를 바인딩
   */
  private bindDataToNode(
    node: ElementASTNode,
    styleData: PrettifierContext["styleData"],
    bindingData: BindingModel,
    slots?: Array<{ elementId: string; propId: string; propName: string }>
  ): ElementASTNode {
    // 스타일 바인딩
    if (styleData.styleTree) {
      const styleNode = this.findStyleNodeById(styleData.styleTree, node.id);
      if (styleNode) {
        node.styles = { ...node.styles, ...styleNode.style };
        // 원본 Figma 스타일 정보 참조 링킹 (복사하지 않고 참조만)
        node.figmaStyles = styleNode.figmaStyle;
      }
    }

    // 바인딩 데이터 바인딩
    if (bindingData && bindingData[node.id]) {
      const elementBinding = bindingData[node.id];
      if (elementBinding.connectedTargetId) {
        node.bindings.push({ id: elementBinding.connectedTargetId });
      }
    }

    // 자식 노드들 재귀적으로 처리
    const boundChildren = node.children.map((child) =>
      this.bindDataToNode(child, styleData, bindingData, slots)
    );

    return {
      ...node,
      children: boundChildren,
    };
  }

  /**
   * StyleTree에서 특정 ID의 노드 찾기
   */
  private findStyleNodeById(
    styleNode: StyleTreeNode,
    id: string
  ): StyleTreeNode | null {
    if (styleNode.id === id) {
      return styleNode;
    }

    // 자식 노드들 탐색
    for (const child of styleNode.children) {
      const found = this.findStyleNodeById(child, id);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private figmaNodeToAST(node: SceneNode) {
    const tag = this.tagMapper.mapFigmaTypeToTag(node.type);

    return {
      kind: "Element",
      id: node.id,
      name: node.name,
      tag,
      originalType: node.type,
      bindings: [],
      styles: {},
      attrs: {},
      children: (node.children ?? []).map((child: FigmaStructureNode) =>
        this.figmaNodeToAST(child)
      ),
    };
  }

  private makeTextContent(node: FigmaStructureNode): string | null {
    let textContent: string | null = null;
    const anyNode = node as any;
    if (node.type === "TEXT") {
      if (anyNode.characters && typeof anyNode.characters === "string") {
        textContent = anyNode.characters;
      } else if (typeof node.name === "string" && node.name.trim() !== "") {
        textContent = node.name;
      }
    }

    return textContent;
  }
}
