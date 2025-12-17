import SpecDataManager from "@compiler/manager/SpecDataManager";
import { SuperTreeNode } from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";
import _TempAstTree from "@compiler/core/componentSetNode/ast-tree/_TempAstTree";
import _FinalAstTree from "./_FinalAstTree";
import HelperManager from "@compiler/manager/HelperManager";
import debug from "@compiler/manager/DebuggingManager";

/**
 * 슈퍼트리에 각 variant 트리를 diff 해서 슈퍼트리 노드 하나하나 값을 채워나간다.
 */
class CreateAstTree {
  private _TempAstTree: _TempAstTree;
  private _FinalAstTree: _FinalAstTree;

  public get finalAstTree() {
    return this._FinalAstTree.finalAstTree;
  }

  public get tempAstTree() {
    return this._TempAstTree.tempAstTree;
  }

  constructor(
    specDataManager: SpecDataManager,
    superTree: SuperTreeNode,
    refinedProps: PropsDef
  ) {
    this._TempAstTree = new _TempAstTree(
      specDataManager,
      superTree,
      refinedProps
    );

    // console.log(this._TempAstTree.tempAstTree);
    // debug.tree(this._TempAstTree.tempAstTree);

    this._FinalAstTree = new _FinalAstTree(
      specDataManager,
      HelperManager.deepCloneTree(this._TempAstTree.tempAstTree)
    );
  }
}

export default CreateAstTree;
