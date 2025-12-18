import { FigmaNodeData, StyleTree } from "@compiler";
import { RenderTree } from "@frontend/ui/domain/compiler/types/customType";

class SpecDataManager {
  private spec: FigmaNodeData;
  private specHashMap: Record<string, FigmaNodeData["info"]["document"]> = {};

  private renderTreeHashMap: Record<string, RenderTree> = {};

  private document: SceneNode;

  constructor(spec: FigmaNodeData) {
    this.spec = spec;

    this.document = spec.info.document;

    this.recursiveAddSpec(spec.info.document);
    this.recursiveAddRenderTree(spec.styleTree);
  }

  public getDocument() {
    return this.document;
  }

  public getSpecById(id: string) {
    return this.specHashMap[id];
  }

  public getRenderTree(): RenderTree {
    return this.spec.styleTree!;
  }

  public getRenderTreeById(id: string): RenderTree {
    return this.renderTreeHashMap[id]!;
  }

  public getComponentPropertyDefinitions() {
    return "componentPropertyDefinitions" in this.spec.info.document
      ? this.spec.info.document.componentPropertyDefinitions
      : null;
  }

  private recursiveAddSpec(node: FigmaNodeData["info"]["document"]) {
    this.specHashMap[node.id] = node;

    if ("children" in node && node.children) {
      node.children.forEach((child) => {
        this.recursiveAddSpec(child);
      });
    }
  }

  private recursiveAddRenderTree(renderTree: StyleTree) {
    this.renderTreeHashMap[renderTree.id] = renderTree;

    if ("children" in renderTree && renderTree.children) {
      renderTree.children.forEach((child) => {
        this.recursiveAddRenderTree(child);
      });
    }
  }
}

export default SpecDataManager;
