import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, StyleObject, TempAstTree } from "@compiler";
import HelperManager from "@compiler/manager/HelperManager";

class _FinalAstTree {
  private _finalAstTree: FinalAstTree;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, tempAstTree: TempAstTree) {
    this._finalAstTree = this.createFinalAstTree(tempAstTree);
    // HelperManager.deepCloneTree();
  }

  private createFinalAstTree(tempAstTree: TempAstTree): FinalAstTree {
    const convert = (
      node: TempAstTree,
      parent: FinalAstTree | null
    ): FinalAstTree => {
      const finalNode: FinalAstTree = {
        id: node.id,
        name: node.name,
        type: node.type,
        props: { ...node.props },
        parent: parent,
        visible: node.visible ?? { type: "static", value: true },
        style: this.updateStyle(node.style),
        children: [],
      };

      finalNode.children = node.children.map((child) =>
        convert(child, finalNode)
      );

      return finalNode;
    };

    return convert(tempAstTree, null);
  }

  private updateStyle(style: StyleObject) {
    //TODO
    return style;
  }
}

export default _FinalAstTree;
