import { NodeInfoExtractor } from "./extractors/NodeInfoExtractor";
import { MetadataManager } from "./managers/MetadataManager";
import { VariantManager } from "./managers/VariantManager";
import { SelectionManager } from "./managers/SelectionManager";
import { ComponentStructureManager } from "./managers/ComponentStructureManager";

/**
 * 메인 플러그인 클래스
 * 단일 책임: 플러그인 초기화 및 전체 라이프사이클 관리
 */
export class FigmaPlugin {
  private nodeInfoExtractor: NodeInfoExtractor;
  private metadataManager: MetadataManager;
  private variantManager: VariantManager;
  private componentStructureManager: ComponentStructureManager;
  private selectionManager: SelectionManager;
  // Message handling is inlined from MessageHandler

  constructor() {
    // 의존성 주입을 통한 클래스 인스턴스 생성
    this.nodeInfoExtractor = new NodeInfoExtractor();
    this.metadataManager = new MetadataManager();
    this.variantManager = new VariantManager();
    this.componentStructureManager = new ComponentStructureManager();
    this.selectionManager = new SelectionManager(
      this.nodeInfoExtractor,
      this.metadataManager,
      this.componentStructureManager
    );
  }

  /**
   * 플러그인 초기화
   */
  async initialize(): Promise<void> {
    // UI 표시
    figma.showUI(__html__, { width: 800, height: 600 });

    // 초기 선택 정보 전송
    await this.selectionManager.sendCurrentSelection();

    // 선택 변경 이벤트 리스닝 시작
    this.selectionManager.startListening();

    // UI 메시지 핸들러 등록
    this.setupMessageHandler();

    figma.once("run", () => {
      //json 추출

      console.log("run");
    });
  }

  /**
   * UI 메시지 핸들러 설정
   */

  private setupMessageHandler(): void {
    figma.ui.onmessage = async (msg) => {
      await this.handleMessage(msg);
    };
  }

  /**
   * UI로 선택 정보 전송
   */
  private sendSelectionInfo(data: Record<string, unknown>[]): void {
    figma.ui.postMessage({
      type: "selection-info",
      data,
    });
  }

  /**
   * 알림 메시지 표시
   */
  private notify(message: string): void {
    figma.notify(message);
  }

  /**
   * 메시지 처리 (inlined from MessageHandler)
   */
  private async handleMessage(msg: {
    type: string;
    nodeId?: string;
    propertyName?: string;
    value?: string;
    metadataType?: string;
    data?: any;
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

      case "save-component-property":
        await this.handleSaveComponentProperty(msg);
        await this.handleExtractJson();
        break;

      case "save-props-definition":
        await this.handleSavePropsDefinition(msg);
        break;

      case "save-internal-state-definition":
        await this.handleSaveInternalStateDefinition(msg);
        break;

      case "save-element-bindings":
        await this.handleSaveElementBindings(msg);
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
      type: "extract-json",
      data: json,
    });
  }

  private async handleSaveComponentProperty(msg: {
    data?: import("./managers/MetadataManager").PropertyConfig[];
  }): Promise<void> {
    if (!msg.data) {
      this.notify("저장할 데이터가 없습니다");
      return;
    }

    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      this.notify("ComponentSet을 선택해주세요");
      return;
    }

    const success = await this.metadataManager.saveComponentPropertyConfig(
      selection[0].id,
      msg.data
    );

    if (success) {
      this.notify("Component Property 설정이 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }

  private async handleSavePropsDefinition(msg: {
    data?: import("./managers/MetadataManager").PropDefinition[];
  }): Promise<void> {
    if (!msg.data) {
      this.notify("저장할 데이터가 없습니다");
      return;
    }

    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      this.notify("COMPONENT_SET을 선택해주세요");
      return;
    }

    const success = await this.metadataManager.savePropsDefinition(
      selection[0].id,
      msg.data
    );

    if (success) {
      this.notify("Props 정의가 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }

  private async handleSaveInternalStateDefinition(msg: {
    data?: import("./managers/MetadataManager").StateDefinition[];
  }): Promise<void> {
    if (!msg.data) {
      this.notify("저장할 데이터가 없습니다");
      return;
    }

    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      this.notify("COMPONENT_SET을 선택해주세요");
      return;
    }

    const success = await this.metadataManager.saveInternalStateDefinition(
      selection[0].id,
      msg.data
    );

    if (success) {
      this.notify("내부 상태 정의가 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }

  private async handleSaveElementBindings(msg: {
    data?: import("./managers/MetadataManager").ElementBindingsMap;
  }): Promise<void> {
    if (!msg.data) {
      this.notify("저장할 데이터가 없습니다");
      return;
    }

    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      this.notify("COMPONENT_SET을 선택해주세요");
      return;
    }

    const success = await this.metadataManager.saveElementBindings(
      selection[0].id,
      msg.data
    );

    if (success) {
      this.notify("Element Bindings가 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }
}
