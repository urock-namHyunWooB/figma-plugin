import { NodeInfoExtractor } from "./extractors/NodeInfoExtractor";
import { MetadataManager } from "./managers/MetadataManager";
import { VariantManager } from "./managers/VariantManager";
import { SelectionManager } from "./managers/SelectionManager";
import { ComponentStructureManager } from "./managers/ComponentStructureManager";
import { PluginMessage, MESSAGE_TYPES } from "./types/messages";
import SpecManager from "./managers/SpecManager";

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
  private specManager: SpecManager;

  constructor() {
    // 의존성 주입을 통한 클래스 인스턴스 생성
    this.nodeInfoExtractor = new NodeInfoExtractor();
    this.metadataManager = new MetadataManager();
    this.variantManager = new VariantManager();
    this.componentStructureManager = new ComponentStructureManager();
    this.specManager = new SpecManager(
      this,
      this.metadataManager,
      this.componentStructureManager,
    );

    this.selectionManager = new SelectionManager(
      this.nodeInfoExtractor,
      this.metadataManager,
      this.componentStructureManager,
      this.specManager,
    );
  }

  /**
   * 플러그인 초기화
   */
  async initialize(): Promise<void> {
    // UI 표시
    figma.showUI(__html__, { width: 800, height: 600 });

    figma.ui.onmessage = async (msg) => {
      await this.handleMessage(msg);
    };

    // 초기 선택 정보 전송
    await this.selectionManager.sendCurrentSelection();

    figma.on("selectionchange", async () => {
      const selection = figma.currentPage.selection;
      const type = selection[0].type;

      if (type === "COMPONENT") {
        const frameNodeTaget = selection[0] as ComponentNode;
        const spec = this.specManager.getComponentNodeSpec(frameNodeTaget);
      }

      if (type === "COMPONENT_SET") {
        const componentSetNodeTarget = selection[0] as ComponentSetNode;

        const spec = await this.specManager.getComponentSetNodeSpec(
          componentSetNodeTarget,
        );

        console.log(spec);
      }

      if (type === "FRAME") {
        const frameNode = selection[0] as FrameNode;

        const spec = await this.specManager.getNodeSpec(frameNode);

        console.log(spec);
      }
    });

    figma.once("run", () => {});
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
  private async handleMessage(msg: PluginMessage): Promise<void> {
    switch (msg.type) {
      case MESSAGE_TYPES.CANCEL:
        await this.handleCancel();
        break;

      case MESSAGE_TYPES.CHANGE_VARIANT:
        await this.handleChangeVariant(msg);
        break;

      case MESSAGE_TYPES.SET_METADATA:
        await this.handleSetMetadata(msg);
        break;

      case MESSAGE_TYPES.EXTRACT_JSON:
        await this.handleExtractJson();
        break;

      case MESSAGE_TYPES.SAVE_COMPONENT_PROPERTY:
        await this.handleSaveComponentProperty(msg);
        await this.handleExtractJson();
        break;

      case MESSAGE_TYPES.SAVE_PROPS_DEFINITION:
        await this.handleSavePropsDefinition(msg);
        break;

      case MESSAGE_TYPES.SAVE_INTERNAL_STATE_DEFINITION:
        await this.handleSaveInternalStateDefinition(msg);
        break;

      case MESSAGE_TYPES.SAVE_ELEMENT_BINDINGS:
        await this.handleSaveElementBindings(msg);
        break;
    }
  }

  private async handleCancel(): Promise<void> {
    figma.closePlugin();
  }

  private async handleChangeVariant(
    msg: Extract<PluginMessage, { type: "change-variant" }>,
  ): Promise<void> {
    const success = await this.variantManager.changeVariant(
      msg.nodeId,
      msg.propertyName,
      msg.value,
    );

    if (success) {
      this.notify(`Variant 변경됨: ${msg.propertyName} = ${msg.value}`);
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("Variant 변경 실패");
    }
  }

  private async handleSetMetadata(
    msg: Extract<PluginMessage, { type: "set-metadata" }>,
  ): Promise<void> {
    const success = await this.metadataManager.setMetadata(
      msg.nodeId,
      msg.metadataType,
    );

    if (success) {
      this.notify(`메타데이터 설정됨: ${msg.metadataType}`);
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("메타데이터 설정 실패");
    }
  }

  private async handleExtractJson(): Promise<void> {
    await this.selectionManager.sendExtractJson();
  }

  private async handleSaveComponentProperty(
    msg: Extract<PluginMessage, { type: "save-component-property" }>,
  ): Promise<void> {
    const success =
      await this.metadataManager.saveComponentPropertyConfigForCurrentSelection(
        msg.data,
      );

    if (success) {
      this.notify("Component Property 설정이 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }

  private async handleSavePropsDefinition(
    msg: Extract<PluginMessage, { type: "save-props-definition" }>,
  ): Promise<void> {
    const success =
      await this.metadataManager.savePropsDefinitionForCurrentSelection(
        msg.data,
      );

    if (success) {
      this.notify("Props 정의가 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }

  private async handleSaveInternalStateDefinition(
    msg: Extract<PluginMessage, { type: "save-internal-state-definition" }>,
  ): Promise<void> {
    const success =
      await this.metadataManager.saveInternalStateDefinitionForCurrentSelection(
        msg.data,
      );

    if (success) {
      this.notify("내부 상태 정의가 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }

  private async handleSaveElementBindings(
    msg: Extract<PluginMessage, { type: "save-element-bindings" }>,
  ): Promise<void> {
    const success =
      await this.metadataManager.saveElementBindingsForCurrentSelection(
        msg.data,
      );

    if (success) {
      this.notify("Element Bindings가 저장되었습니다");
      await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("저장 실패");
    }
  }
}
