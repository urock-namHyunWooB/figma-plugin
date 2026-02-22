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
   * COMPONENT_SET variants는 그룹화하여 병합
   */
  /**
   * 모든 트리 구축 (고수준 흐름)
   *
   * 1. Main 컴포넌트 트리 구축
   * 2. Dependencies 그룹별 처리:
   *    - 단일 variant → 개별 컴포넌트
   *    - 다중 variant → COMPONENT_SET 병합
   */
  private buildAllTrees(): {
    main: UITree;
    dependencies: Map<string, UITree>;
  } {
    // Step 1: Main 컴포넌트 트리 구축
    const mainId = this.dataManager.getMainComponentId();
    const main = this.buildComponentTree(mainId);

    // Step 2: Dependencies 처리 (variant 병합 포함)
    const dependencies = this.buildDependencyTrees();

    return { main, dependencies };
  }

  /**
   * Dependency 트리들 구축 (variant 병합 처리)
   */
  private buildDependencyTrees(): Map<string, UITree> {
    const dependencies = new Map<string, UITree>();
    const groupedDeps = this.dataManager.getDependenciesGroupedByComponentSet();

    for (const [componentSetId, group] of Object.entries(groupedDeps)) {
      const tree = this.buildDependencyTree(componentSetId, group);
      const representativeId = group.variants[0].info.document.id;
      dependencies.set(representativeId, tree);
    }

    return dependencies;
  }

  /**
   * 개별 Dependency 트리 구축 (단일 or 병합)
   */
  private buildDependencyTree(
    componentSetId: string,
    group: { variants: any[]; componentSetName: string }
  ): UITree {
    // 단일 variant → 개별 컴포넌트
    if (group.variants.length === 1) {
      const componentId = group.variants[0].info.document.id;
      return this.buildComponentTree(componentId);
    }

    // 다중 variants → COMPONENT_SET으로 병합
    return this.buildComponentSetTree(
      componentSetId,
      group.componentSetName,
      group.variants
    );
  }

  /**
   * 컴포넌트 간 관계 연결 (INSTANCE override props)
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

    // INSTANCE override props 연결
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

  /**
   * 여러 variants를 COMPONENT_SET으로 병합하여 UITree 빌드
   */
  private buildComponentSetTree(
    componentSetId: string,
    componentSetName: string,
    variants: any[]
  ): UITree {
    // Synthetic COMPONENT_SET 노드 생성
    const syntheticComponentSet = {
      id: componentSetId,
      name: componentSetName,
      type: "COMPONENT_SET" as const,
      children: variants.map((v) => v.info.document),
    };

    return this.treeBuilder.build(syntheticComponentSet);
  }
}

export default TreeManager;
