import { FigmaNodeData } from "@compiler";
import { RenderTree } from "@frontend/ui/domain/compiler/types/customType";

class SpecDataManager {
  private spec: FigmaNodeData;
  private specHashMap: Record<string, FigmaNodeData["info"]["document"]> = {};

  constructor(spec: FigmaNodeData) {
    this.spec = spec;

    this.recursiveAddSpec(spec.info.document);
  }

  public getSpecById(id: string) {
    return this.specHashMap[id];
  }

  public getRenderTree(): RenderTree {
    return this.spec.styleTree!;
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
}

export default SpecDataManager;
