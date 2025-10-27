import { VariantManager } from "../managers/VariantManager";
import { MetadataManager } from "../managers/MetadataManager";
import { SelectionManager } from "../managers/SelectionManager";
import { NodeInfoExtractor } from "../extractors/NodeInfoExtractor";

/**
 * 메시지 핸들러 및 UI 통신 클래스
 * 단일 책임: UI로부터 받은 메시지 처리 및 UI와의 통신
 */
export class MessageHandler {
  private variantManager: VariantManager;
  private metadataManager: MetadataManager;
  private selectionManager: SelectionManager;
  private nodeInfoExtractor: NodeInfoExtractor;

  constructor(
    variantManager: VariantManager,
    metadataManager: MetadataManager,
    selectionManager: SelectionManager,
    nodeInfoExtractor: NodeInfoExtractor
  ) {
    this.variantManager = variantManager;
    this.metadataManager = metadataManager;
    this.selectionManager = selectionManager;
    this.nodeInfoExtractor = nodeInfoExtractor;
  }

  /**
   * UI로 선택 정보 전송
   */
  sendSelectionInfo(data: Record<string, unknown>[]): void {
    figma.ui.postMessage({
      type: "selection-info",
      data,
    });
  }

  /**
   * 알림 메시지 표시
   */
  notify(message: string): void {
    figma.notify(message);
  }

  /**
   * 메시지 처리
   */
  async handleMessage(msg: {
    type: string;
    nodeId?: string;
    propertyName?: string;
    value?: string;
    metadataType?: string;
  }): Promise<void> {
    switch (msg.type) {
      case "cancel":
        await this.handleCancel();
        break;

      case "change-variant":
        await this.handleChangeVariant(msg);
        break;

      case "set-metadata":
        await this.handleSetMetadata(msg);
        break;

      case "extract-json":
        await this.handleExtractJson();
        break;
    }
  }

  private async handleCancel(): Promise<void> {
    figma.closePlugin();
  }

  private async handleChangeVariant(msg: {
    nodeId?: string;
    propertyName?: string;
    value?: string;
  }): Promise<void> {
    if (!msg.nodeId || !msg.propertyName || !msg.value) {
      return;
    }

    const success = await this.variantManager.changeVariant(
      msg.nodeId,
      msg.propertyName,
      msg.value
    );

    if (success) {
      this.notify(`Variant 변경됨: ${msg.propertyName} = ${msg.value}`);
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("Variant 변경 실패");
    }
  }

  private async handleSetMetadata(msg: {
    nodeId?: string;
    metadataType?: string;
  }): Promise<void> {
    if (!msg.nodeId || !msg.metadataType) {
      return;
    }

    const success = await this.metadataManager.setMetadata(
      msg.nodeId,
      msg.metadataType
    );

    if (success) {
      this.notify(`메타데이터 설정됨: ${msg.metadataType}`);
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("메타데이터 설정 실패");
    }
  }

  private async handleExtractJson(): Promise<void> {
    const selection = figma.currentPage.selection;
    const selectionInfo = await Promise.all(
      selection.map((node) =>
        this.nodeInfoExtractor.extractNodeProperties(node)
      )
    );
    const json = JSON.stringify(selectionInfo, null, 2);
    figma.ui.postMessage({
      type: "download-json",
      data: json,
    });
  }
}
