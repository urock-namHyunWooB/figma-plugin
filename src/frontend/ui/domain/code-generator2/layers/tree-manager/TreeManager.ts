import { UITree } from "../../types/types";
import DataManager from "../data-manager/DataManager";
import TreeBuilder from "./tree-builder/TreeBuilder";
import { ComponentPropsLinker } from "./post-processors/ComponentPropsLinker";

class TreeManager {
  private readonly dataManager: DataManager;
  private readonly treeBuilder: TreeBuilder;
  private readonly propsLinker: ComponentPropsLinker;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.treeBuilder = new TreeBuilder(dataManager);
    this.propsLinker = new ComponentPropsLinker(dataManager);
  }

  /**
   * 메인 컴포넌트와 모든 의존 컴포넌트의 UITree 빌드
   */
  public build(): {
    main: UITree;
    dependencies: Map<string, UITree>;
  } {
    // 1. 개별 컴포넌트 트리 빌드
    const { main, dependencies } = this.buildAllTrees();

    // 2. 컴포넌트 간 관계 연결 (props, bindings)
    this.linkComponents(main, dependencies);

    return { main, dependencies };
  }

  /**
   * 모든 컴포넌트의 UITree 개별 빌드
   */
  private buildAllTrees(): {
    main: UITree;
    dependencies: Map<string, UITree>;
  } {
    const mainId = this.dataManager.getMainComponentId();
    const main = this.buildComponentTree(mainId);

    const dependencies = new Map<string, UITree>();
    const allDeps = this.dataManager.getAllDependencies();

    for (const [depId] of allDeps) {
      dependencies.set(depId, this.buildComponentTree(depId));
    }

    return { main, dependencies };
  }

  /**
   * 컴포넌트 간 관계 연결 (INSTANCE override props 등)
   */
  private linkComponents(
    main: UITree,
    dependencies: Map<string, UITree>
  ): void {
    const mainId = this.dataManager.getMainComponentId();
    const allTrees = new Map<string, UITree>([
      [mainId, main],
      ...dependencies,
    ]);

    this.propsLinker.process(allTrees, mainId);
  }

  /**
   * 개별 컴포넌트의 UITree 빌드 (TreeBuilder에 위임)
   */
  private buildComponentTree(componentId: string): UITree {
    const { spec } = this.dataManager.getById(componentId);
    if (!spec) throw new Error(`Component not found: ${componentId}`);

    return this.treeBuilder.build(spec.info.document);
  }
}

export default TreeManager;
