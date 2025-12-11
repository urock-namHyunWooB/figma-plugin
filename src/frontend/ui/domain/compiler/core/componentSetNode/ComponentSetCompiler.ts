import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "@compiler/core/NodeMatcher";
import CreateSuperTree from "./super-tree/CreateSuperTree";
import RefineProps from "@compiler/core/componentSetNode/RefineProps";
import CreateFinalAstTree from "./ast-tree/CreateFinalAstTree";
import debug from "@compiler/manager/DebuggingManager";

type PropsDef = Record<string, any>;

class ComponentSetCompiler {
  private propsDef: PropsDef;

  private CreateSuperTree: CreateSuperTree;
  private RefindProps: RefineProps;
  private CreateFinalAstTree: CreateFinalAstTree;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    debug.point(1);

    this.CreateSuperTree = new CreateSuperTree(
      renderTree,
      specDataManager,
      matcher
    );

    this.propsDef = this.extractPropsDef(renderTree, specDataManager, matcher);
    const RefindProps = (this.RefindProps = new RefineProps(
      renderTree,
      specDataManager
    ));
    const refinedProps = RefindProps.refinedProps;
    const superNodeTree = this.CreateSuperTree.getSuperTree();

    this.CreateFinalAstTree = new CreateFinalAstTree(
      specDataManager,
      superNodeTree,
      refinedProps
    );

    console.log("finalAstTree", this.CreateFinalAstTree.finalAstTree);
  }

  private extractPropsDef(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    const props = {} as PropsDef;

    const nodeData = specDataManager.getSpecById(
      renderTree.id
    ) as ComponentSetNode;

    const componentPropertyDefinitions = nodeData.componentPropertyDefinitions;

    Object.entries(componentPropertyDefinitions).forEach(([key, value]) => {
      props[toCamelCase(key)] = value;
    });

    return props;
  }

  /**
   * 각 variants가 주어지면 노드 style이 어떤식으로 바뀌어야하는지 나타내는 맵
   * @private
   */
  private createVariantStyleMap() {}
}

export default ComponentSetCompiler;
