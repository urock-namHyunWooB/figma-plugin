import { UITree } from "../../types/types";
import DataManager from "../data-manager/DataManager";
import TreeBuilder from "./tree-builder/TreeBuilder";

class TreeManager {
  private readonly dataManager: DataManager;
  private readonly treeBuilder: TreeBuilder;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.treeBuilder = new TreeBuilder(dataManager);
  }

  /**
   * 메인 컴포넌트와 모든 의존 컴포넌트의 UITree 빌드
   */
  public build(): {
    main: UITree;
    dependencies: Map<string, UITree>;
  } {
    const mainId = this.dataManager.getMainComponentId();
    const mainUITree = this.buildComponentTree(mainId);

    const depMap = new Map<string, UITree>();
    const allDeps = this.dataManager.getAllDependencies();

    for (const [depId] of allDeps) {
      depMap.set(depId, this.buildComponentTree(depId));
    }

    return { main: mainUITree, dependencies: depMap };
  }

  /**
   * 개별 컴포넌트의 UITree 빌드 (TreeBuilder에 위임)
   */
  private buildComponentTree(componentId: string): UITree {
    const { spec } = this.dataManager.getById(componentId);
    if (!spec) throw new Error(`Component not found: ${componentId}`);

    return this.treeBuilder.build(spec);
  }
}

export default TreeManager;
