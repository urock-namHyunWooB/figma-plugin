import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import type { LayoutTreeNode } from "@backend/managers/ComponentStructureManager";
import type {
  ElementASTNode,
  ComponentAST,
  IASTGenerator,
  ITagMapper,
  IStyleConverter,
  BindingModel,
  ElementBindingModel,
} from "../../types";
import { styleConverter } from "../style";

type ComponentStructureData = NonNullable<
  ComponentSetNodeSpec["componentStructure"]
>;
type FigmaStructureNode = ComponentStructureData["root"];

/**
 * Figma ComponentSetNodeSpec을 ComponentAST로 변환하는 구현체
 */
export class ASTGenerator implements IASTGenerator {
  constructor(
    private readonly tagMapper: ITagMapper,
    private readonly styleConverter: IStyleConverter
  ) {}

  public componentNodeSpecToAST(
    spec: ComponentSetNodeSpec,
    bindingModel?: BindingModel
  ): ComponentAST {
    if (!spec.componentStructure) {
      throw new Error("ComponentStructure is required");
    }

    const layoutMap = this.buildLayoutMap(spec.layoutTree);
    const bindingMap = this.buildBindingMap(bindingModel);
    const rootFigmaNode = spec.componentStructure.root;

    const rootAST = this.figmaNodeToAST(rootFigmaNode, layoutMap, bindingMap);

    return {
      kind: "Component",
      name: spec.metadata.name,
      root: rootAST,
    };
  }

  private figmaNodeToAST(
    node: FigmaStructureNode,
    layoutMap: Map<string, LayoutTreeNode>,
    bindingMap: Map<string, ElementBindingModel>
  ): ElementASTNode {
    const tag = this.tagMapper.mapFigmaTypeToTag(node.type);
    const layoutNode = layoutMap.get(node.id);
    const style = this.styleConverter.layoutNodeToStyle(layoutNode, node.type);

    const textContent = this.makeTextContent(node);
    const binding = bindingMap.get(node.id);

    return {
      kind: "Element",
      id: node.id,
      name: node.name,
      tag,
      originalType: node.type,
      props: {
        style,
      },
      children: (node.children ?? []).map((child: FigmaStructureNode) =>
        this.figmaNodeToAST(child, layoutMap, bindingMap)
      ),
      textContent,
      binding,
    };
  }

  private buildLayoutMap(
    layoutRoot: ComponentSetNodeSpec["layoutTree"]
  ): Map<string, LayoutTreeNode> {
    const map = new Map<string, LayoutTreeNode>();

    if (!layoutRoot) {
      return map;
    }

    function traverse(node: LayoutTreeNode) {
      map.set(node.id, node);
      node.children?.forEach((child) => traverse(child));
    }

    traverse(layoutRoot);
    return map;
  }

  private buildBindingMap(
    bindingModel?: BindingModel
  ): Map<string, ElementBindingModel> {
    const map = new Map<string, ElementBindingModel>();

    if (!bindingModel?.elements) {
      return map;
    }

    for (const elementBinding of bindingModel.elements) {
      map.set(elementBinding.nodeId, elementBinding);
    }

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

