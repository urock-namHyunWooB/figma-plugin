import { NodeInfoExtractor } from "../extractors/NodeInfoExtractor";

/**
 * 선택 관리 클래스
 * 단일 책임: 현재 선택된 노드 관리 및 변경 감지
 */
export class SelectionManager {
  private nodeInfoExtractor: NodeInfoExtractor;

  constructor(nodeInfoExtractor: NodeInfoExtractor) {
    this.nodeInfoExtractor = nodeInfoExtractor;
  }

  /**
   * 현재 선택 정보를 UI로 전송
   */
  async sendCurrentSelection(): Promise<void> {
    const selection = figma.currentPage.selection;

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
      console.log(
        (selection[0] as ComponentSetNode).componentPropertyDefinitions
      );
    }

    figma.ui.postMessage({
      type: "selection-info",
      data: selectionInfo,
    });

    figma.ui.postMessage({
      type: "component-set-info",
      data: (selection[0] as ComponentSetNode).componentPropertyDefinitions,
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
