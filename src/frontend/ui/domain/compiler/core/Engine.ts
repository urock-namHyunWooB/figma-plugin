import FigmaCompiler, { RenderTree } from "@compiler";
import NodeMatcher from "@compiler/core/NodeMatcher";
import debug from "@compiler/manager/DebuggingManager";
import RefineProps from "@compiler/core/RefineProps";
import CreateAstTree from "@compiler/core/ast-tree/CreateAstTree";
import ReactGenerator from "@compiler/core/react-generator/ReactGenerator";
import CreateSuperTree from "./super-tree/CreateSuperTree";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";

class Engine {
  private CreateSuperTree: CreateSuperTree;
  private CreateFinalAstTree: CreateAstTree;
  private reactGenerator: ReactGenerator;

  constructor(root: FigmaCompiler, renderTree: RenderTree) {
    const node = root.SpecDataManager.getSpecById(renderTree.id);
    const specManager = root.SpecDataManager;
    const matcher = new NodeMatcher(specManager);

    this.CreateSuperTree = new CreateSuperTree(
      renderTree,
      specManager,
      matcher
    );

    const refinedProps = new RefineProps(renderTree, specManager).refinedProps;

    const superNodeTree = this.CreateSuperTree.getSuperTree();

    const createFinalAstTree = (this.CreateFinalAstTree = new CreateAstTree(
      specManager,
      superNodeTree,
      refinedProps
    ));

    this.reactGenerator = new ReactGenerator(createFinalAstTree.finalAstTree);

    debug.tree(createFinalAstTree.tempAstTree);
    console.log(
      "createFinalAstTree.tempAstTree",
      createFinalAstTree.tempAstTree
    );
    console.log(
      "createFinalAstTree.finalAstTree",
      createFinalAstTree.finalAstTree
    );
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

  /**
   * FinalAstTree 반환 (props 정보 추출용)
   */
  public getFinalAstTree() {
    return this.CreateFinalAstTree.finalAstTree;
  }
}

export default Engine;
