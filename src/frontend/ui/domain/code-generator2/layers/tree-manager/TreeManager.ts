import { UITree } from "../../types/types";
import DataManager from "../data-manager/DataManager";
import TreeBuilder from "./tree-builder/TreeBuilder";
import { InstanceOverrideProcessor } from "./post-processors/InstanceOverrideProcessor";

class TreeManager {
  private readonly dataManager: DataManager;
  private readonly treeBuilder: TreeBuilder;
  private readonly overrideProcessor: InstanceOverrideProcessor;

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
    this.treeBuilder = new TreeBuilder(dataManager);
    this.overrideProcessor = new InstanceOverrideProcessor(dataManager);
  }

  /**
   * 메인 컴포넌트와 모든 의존 컴포넌트의 UITree 빌드
   */
  public build(): {
    main: UITree;
    dependencies: Map<string, UITree>;
  } {
    const mainId = this.dataManager.getMainComponentId();

    // Step 1: 모든 컴포넌트 개별 빌드
    const mainUITree = this.buildComponentTree(mainId);

    const depMap = new Map<string, UITree>();
    const allDeps = this.dataManager.getAllDependencies();

    for (const [depId] of allDeps) {
      depMap.set(depId, this.buildComponentTree(depId));
    }

    // Step 2: INSTANCE override props 처리
    // 모든 UITree를 하나의 Map으로 합치기
    const allTrees = new Map<string, UITree>();
    allTrees.set(mainId, mainUITree);
    for (const [depId, depTree] of depMap) {
      allTrees.set(depId, depTree);
    }

    // Override processor 실행
    this.overrideProcessor.process(allTrees, mainId);

    return { main: mainUITree, dependencies: depMap };
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
