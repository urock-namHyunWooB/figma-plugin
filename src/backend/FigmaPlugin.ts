import { MetadataManager } from "./managers/MetadataManager";

import { PluginMessage, MESSAGE_TYPES } from "./types/messages";

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

  constructor() {
    // 의존성 주입을 통한 클래스 인스턴스 생성
    this.metadataManager = new MetadataManager();
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
      figma.ui.postMessage({
        type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
        data: await this.getNodeData([...figma.currentPage.selection]),
      });
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
    } else {
      this.notify("메타데이터 설정 실패");
    }
  }

  private async getNodeData(selection: SceneNode[]): Promise<FigmaNodeData> {
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

    return nodeData;
  }
}
