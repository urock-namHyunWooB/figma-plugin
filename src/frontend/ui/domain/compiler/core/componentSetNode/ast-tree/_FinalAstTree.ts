import SpecDataManager from "@compiler/manager/SpecDataManager";
import { FinalAstTree, SuperTreeNode, TempAstTree } from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";

class _FinalAstTree {
  private _finalAstTree: FinalAstTree;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, tempAstTree: TempAstTree) {
    this._finalAstTree = this.createFinalAstTree(tempAstTree);
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
        style: {
          base: { ...node.style.base },
          dynamic: node.style.dynamic.map((d) => ({
            condition: d.condition,
            style: { ...d.style },
          })),
        },
        children: [],
      };

      finalNode.children = node.children.map((child) =>
        convert(child, finalNode)
      );

      return finalNode;
    };

    return convert(tempAstTree, null);
  }
}

export default _FinalAstTree;
