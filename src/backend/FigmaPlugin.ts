import { MetadataManager } from "./managers/MetadataManager";

import { SelectionManager } from "./managers/SelectionManager";
import { ComponentStructureManager } from "./managers/ComponentStructureManager";
import { PluginMessage, MESSAGE_TYPES } from "./types/messages";
import SpecManager from "./managers/SpecManager";
import { ComponentSetNode } from "@figma/plugin-typings/plugin-api-standalone";
import {
  FigmaNodeData,
  FigmaRestApiResponse,
} from "@frontend/ui/domain/transpiler/types/figma-api";

/**
 * 메인 플러그인 클래스
 * 단일 책임: 플러그인 초기화 및 전체 라이프사이클 관리
 */
export class FigmaPlugin {
  private metadataManager: MetadataManager;
  private componentStructureManager: ComponentStructureManager;
  private selectionManager: SelectionManager;
  private specManager: SpecManager;

  constructor() {
    // 의존성 주입을 통한 클래스 인스턴스 생성
    this.metadataManager = new MetadataManager();

    this.componentStructureManager = new ComponentStructureManager();
    this.specManager = new SpecManager(
      this,
      this.metadataManager,
      this.componentStructureManager
    );

    this.selectionManager = new SelectionManager();
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

    figma.on("selectionchange", async () => {
      const selection = figma.currentPage.selection;
      const type = selection[0].type;

      const nodeData: FigmaNodeData = {
        pluginData: (() => {
          const keys = selection[0].getPluginDataKeys();
          return keys.map((key) => {
            return {
              key,
              value: selection[0].getPluginData(key),
            };
          });
        })(),
        info: (await selection[0].exportAsync({
          format: "JSON_REST_V1",
        })) as FigmaRestApiResponse,
      };

      if (type === "COMPONENT") {
        const frameNodeTaget = selection[0] as ComponentNode;
        const spec = this.specManager.getComponentNodeSpec(frameNodeTaget);
      }

      if (nodeData.info.document.type === "COMPONENT_SET") {
        const spec = await this.specManager.getComponentSetNodeSpec(nodeData);

        console.log(spec);
      }

      if (type === "FRAME") {
        const frameNode = selection[0] as FrameNode;

        const spec = await this.specManager.getNodeSpec(frameNode);
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

      case MESSAGE_TYPES.SET_METADATA:
        await this.handleSetMetadata(msg);
        break;
    }
  }

  private async handleCancel(): Promise<void> {
    figma.closePlugin();
  }

  private async handleSetMetadata(
    msg: Extract<PluginMessage, { type: "set-metadata" }>
  ): Promise<void> {
    const success = await this.metadataManager.setMetadata(
      msg.nodeId,
      msg.metadataType
    );

    if (success) {
      this.notify(`메타데이터 설정됨: ${msg.metadataType}`);
      // await this.selectionManager.sendCurrentSelection();
    } else {
      this.notify("메타데이터 설정 실패");
    }
  }
}
