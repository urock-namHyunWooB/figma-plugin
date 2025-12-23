import { RenderTree, SuperTreeNode } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { getNodesAtDepth, traverseBFS } from "@compiler/utils/traverse";
import NodeMatcher from "@compiler/core/NodeMatcher";
import CreateSuperTree from "./super-tree/CreateSuperTree";
import RefineProps from "@compiler/core/componentSetNode/RefineProps";
import CreateAstTree from "./ast-tree/CreateAstTree";
import debug from "@compiler/manager/DebuggingManager";
import ReactGenerator from "@compiler/core/componentSetNode/react-generator/ReactGenerator";

type PropsDef = Record<string, any>;

class ComponentSetCompiler {
  private propsDef: PropsDef;

  private CreateSuperTree: CreateSuperTree;
  private RefindProps: RefineProps;
  private CreateFinalAstTree: CreateAstTree;
  private reactGenerator: ReactGenerator;

  constructor(
    renderTree: RenderTree,
    specDataManager: SpecDataManager,
    matcher: NodeMatcher
  ) {
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

    const createFinalAstTree = (this.CreateFinalAstTree = new CreateAstTree(
      specDataManager,
      superNodeTree,
      refinedProps
    ));

    this.reactGenerator = new ReactGenerator(createFinalAstTree.finalAstTree);
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * @param componentName 컴포넌트 이름 (기본값: "Button")
   * @returns 생성된 TypeScript/TSX 코드 문자열
   */
  public async getGeneratedCode(
    componentName: string = "Button"
  ): Promise<string> {
    return await this.reactGenerator.generateComponentCode(componentName);
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
