import { NodeInfoExtractor } from "../extractors/NodeInfoExtractor";
import { MetadataManager } from "./MetadataManager";

/**
 * 선택 관리 클래스
 * 단일 책임: 현재 선택된 노드 관리 및 변경 감지
 */
export class SelectionManager {
  private nodeInfoExtractor: NodeInfoExtractor;
  private metadataManager: MetadataManager;

  constructor(
    nodeInfoExtractor: NodeInfoExtractor,
    metadataManager: MetadataManager
  ) {
    this.nodeInfoExtractor = nodeInfoExtractor;
    this.metadataManager = metadataManager;
  }

  /**
   * 현재 선택 정보를 UI로 전송
   */
  async sendCurrentSelection(): Promise<void> {
    const selection = figma.currentPage.selection;
    let componentSetInfo = null;
    let componentPropertyConfig = null;
    let propsDefinition = null;

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
      componentSetInfo = (selection[0] as ComponentSetNode)
        .componentPropertyDefinitions;

      componentPropertyConfig = this.metadataManager.getComponentPropertyConfig(
        selection[0]
      );

      propsDefinition = this.metadataManager.getPropsDefinition(selection[0]);
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
