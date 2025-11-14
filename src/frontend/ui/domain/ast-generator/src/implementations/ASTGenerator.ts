import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import type { ElementASTNode, ComponentAST } from "../ast";
import type { IASTGenerator } from "../interfaces/IASTGenerator";
import type { ITagMapper } from "../interfaces/ITagMapper";
import type { IStyleConverter } from "../interfaces/IStyleConverter";

type FigmaStructureNode = ComponentSetNodeSpec["componentStructure"]["root"];

/**
 * Figma ComponentSetNodeSpec을 ComponentAST로 변환하는 구현체
 */
export class ASTGenerator implements IASTGenerator {
  constructor(
    private readonly tagMapper: ITagMapper,
    private readonly styleConverter: IStyleConverter,
  ) {}

  public componentNodeSpecToAST(spec: ComponentSetNodeSpec): ComponentAST {
    const layoutMap = this.buildLayoutMap(spec.layoutTree);
    const rootFigmaNode = spec.componentStructure.root;

    const rootAST = this.figmaNodeToAST(rootFigmaNode, layoutMap);

    return {
      kind: "Component",
      name: spec.metadata.name,
      root: rootAST,
    };
  }

  private figmaNodeToAST(
    node: ComponentSetNodeSpec["componentStructure"]["root"],
    layoutMap: Map<string, LayoutTreeNode>,
  ): ElementASTNode {
    const tag = this.tagMapper.mapFigmaTypeToTag(node.type);
    const layoutNode = layoutMap.get(node.id);
    const style = this.styleConverter.layoutNodeToStyle(layoutNode, node.type);

    const textContent = this.makeTextContent(node);

    return {
      kind: "Element",
      id: node.id,
      name: node.name,
      tag,
      originalType: node.type,
      props: {
        style,
      },
      children: (node.children ?? []).map((child) =>
        this.figmaNodeToAST(child as FigmaStructureNode, layoutMap),
      ),
      textContent,
    };
  }

  private buildLayoutMap(
    layoutRoot: ComponentSetNodeSpec["layoutTree"],
  ): Map<string, LayoutTreeNode> {
    const map = new Map<string, LayoutTreeNode>();

    function traverse(node: LayoutTreeNode) {
      map.set(node.id, node);
      node.children?.forEach((child) => traverse(child));
    }

    traverse(layoutRoot);
    return map;
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
