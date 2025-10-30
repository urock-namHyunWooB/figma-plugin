import { NodeInfoExtractor } from "../extractors/NodeInfoExtractor";
import { MetadataManager } from "./MetadataManager";
import { ComponentStructureManager } from "./ComponentStructureManager";

/**
 * 선택 관리 클래스
 * 단일 책임: 현재 선택된 노드 관리 및 변경 감지
 */
export class SelectionManager {
  private nodeInfoExtractor: NodeInfoExtractor;
  private metadataManager: MetadataManager;
  private componentStructureManager: ComponentStructureManager;

  constructor(
    nodeInfoExtractor: NodeInfoExtractor,
    metadataManager: MetadataManager,
    componentStructureManager: ComponentStructureManager
  ) {
    this.nodeInfoExtractor = nodeInfoExtractor;
    this.metadataManager = metadataManager;
    this.componentStructureManager = componentStructureManager;
  }

  /**
   * 현재 선택 정보를 UI로 전송
   */
  async sendCurrentSelection(): Promise<void> {
    const selection = figma.currentPage.selection;
    let componentSetInfo = null;
    let componentPropertyConfig = null;
    let propsDefinition = null;
    let internalStateDefinition = null;
    let componentStructure = null;
    let elementBindings = null;

    console.info("selection", selection);

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "selection-info",
        data: [],
      });
      return;
    }

    const selectionInfo = await Promise.all(
      selection.map((node) =>
        this.nodeInfoExtractor.extractNodeProperties(node)
      )
    );

    if (selection[0].type === "COMPONENT_SET") {
      const componentSet = selection[0] as ComponentSetNode;

      componentSetInfo = componentSet.componentPropertyDefinitions;

      componentPropertyConfig =
        this.metadataManager.getComponentPropertyConfig(componentSet);

      propsDefinition = this.metadataManager.getPropsDefinition(componentSet);

      internalStateDefinition =
        this.metadataManager.getInternalStateDefinition(componentSet);

      componentStructure =
        this.componentStructureManager.extractStructure(componentSet);

      elementBindings = this.metadataManager.getElementBindings(componentSet);
    }

    figma.ui.postMessage({
      type: "selection-info",
      data: JSON.parse(JSON.stringify(selectionInfo)),
    });

    figma.ui.postMessage({
      type: "component-set-info",
      data: JSON.parse(JSON.stringify(componentSetInfo)),
    });

    if (componentPropertyConfig) {
      figma.ui.postMessage({
        type: "component-property-config",
        data: JSON.parse(JSON.stringify(componentPropertyConfig)),
      });
    }

    figma.ui.postMessage({
      type: "props-definition",
      data: propsDefinition
        ? JSON.parse(JSON.stringify(propsDefinition))
        : null,
    });

    figma.ui.postMessage({
      type: "internal-state-definition",
      data: internalStateDefinition
        ? JSON.parse(JSON.stringify(internalStateDefinition))
        : null,
    });

    figma.ui.postMessage({
      type: "component-structure",
      data: componentStructure
        ? JSON.parse(JSON.stringify(componentStructure))
        : null,
    });

    figma.ui.postMessage({
      type: "element-bindings",
      data: elementBindings
        ? JSON.parse(JSON.stringify(elementBindings))
        : null,
    });
  }

  /**
   * 선택 변경 이벤트 리스너 등록
   */
  startListening(): void {
    figma.on("selectionchange", () => {
      this.sendCurrentSelection();
    });
  }
}
