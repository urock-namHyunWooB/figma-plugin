import { NodeInfoExtractor } from "../extractors/NodeInfoExtractor";
import { MetadataManager } from "./MetadataManager";
import { ComponentStructureManager } from "./ComponentStructureManager";
import { MESSAGE_TYPES } from "../types/messages";

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
    let variantStyles = null;

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.SELECTION_INFO,
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

      variantStyles =
        this.componentStructureManager.extractVariantStyles(componentSet);
    }

    figma.ui.postMessage({
      type: MESSAGE_TYPES.SELECTION_INFO,
      data: JSON.parse(JSON.stringify(selectionInfo)),
    });

    figma.ui.postMessage({
      type: MESSAGE_TYPES.COMPONENT_SET_INFO,
      data: JSON.parse(JSON.stringify(componentSetInfo)),
    });

    if (componentPropertyConfig) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.COMPONENT_PROPERTY_CONFIG,
        data: JSON.parse(JSON.stringify(componentPropertyConfig)),
      });
    }

    figma.ui.postMessage({
      type: MESSAGE_TYPES.PROPS_DEFINITION,
      data: propsDefinition
        ? JSON.parse(JSON.stringify(propsDefinition))
        : null,
    });

    figma.ui.postMessage({
      type: MESSAGE_TYPES.INTERNAL_STATE_DEFINITION,
      data: internalStateDefinition
        ? JSON.parse(JSON.stringify(internalStateDefinition))
        : null,
    });

    figma.ui.postMessage({
      type: MESSAGE_TYPES.COMPONENT_STRUCTURE,
      data: componentStructure
        ? JSON.parse(JSON.stringify(componentStructure))
        : null,
    });

    figma.ui.postMessage({
      type: MESSAGE_TYPES.ELEMENT_BINDINGS,
      data: elementBindings
        ? JSON.parse(JSON.stringify(elementBindings))
        : null,
    });
  }

  /**
   * 현재 선택의 속성을 추출해 JSON으로 UI로 전송
   */
  async sendExtractJson(): Promise<void> {
    const selection = figma.currentPage.selection;
    const selectionInfo = await Promise.all(
      selection.map((node) =>
        this.nodeInfoExtractor.extractNodeProperties(node)
      )
    );
    const json = JSON.stringify(selectionInfo, null, 2);

    figma.ui.postMessage({
      type: "extract-json",
      data: json,
    });
  }
}
