import SpecDataManager from "@compiler/manager/SpecDataManager";
import {
  TempAstTree,
  SuperTreeNode,
  FinalAstTree,
  StyleTree,
  StyleObject,
  VisibleValue,
  NewMergedNode,
} from "@compiler";
import { PropsDef } from "@compiler/core/componentSetNode/RefineProps";
import { ConditionNode, BinaryOperator } from "@compiler/types/customType";
import { findNodeBFS, getRootNode, traverseBFS } from "../../../utils/traverse";
import debug from "@compiler/manager/DebuggingManager";
import { target } from "happy-dom/lib/PropertySymbol";
import helper from "@compiler/manager/HelperManager";
import finder from "@compiler/manager/FinderManager";
import _TempAstTree from "@compiler/core/componentSetNode/ast-tree/_TempAstTree";
import _FinalAstTree from "./_FinalAstTree";

/**
 * 슈퍼트리에 각 variant 트리를 diff 해서 슈퍼트리 노드 하나하나 값을 채워나간다.
 */
class CreateFinalAstTree {
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

    this._FinalAstTree = new _FinalAstTree(
      specDataManager,
      this._TempAstTree.tempAstTree
    );
  }
}

export default CreateFinalAstTree;
