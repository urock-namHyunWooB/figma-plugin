import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "@compiler/core/NodeMatcher";
import CreateSuperTree from "./CreateSuperTree";

type PropsDef = Record<string, any>;

class ComponentSetCompiler {
  private propsDef: PropsDef;

  private CreateSuperTree: CreateSuperTree;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
    this.propsDef = this.extractPropsDef(renderTree, specDataManager, matcher);

    this.CreateSuperTree = new CreateSuperTree(
      renderTree,
      specDataManager,
      matcher
    );

    const superNodeTree = this.CreateSuperTree.getSuperTree();
    console.log(this.propsDef, superNodeTree);
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
