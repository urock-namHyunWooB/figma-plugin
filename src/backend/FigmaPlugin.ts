import { MetadataManager } from "./managers/MetadataManager";

import { MESSAGE_TYPES, PluginMessage } from "./types/messages";

import {
  FigmaNodeData,
  FigmaRestApiResponse,
  StyleTree,
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
    figma.showUI(__html__, { width: 400, height: 1000 });

    figma.ui.onmessage = async (msg) => {
      await this.handleMessage(msg);
    };

    figma.on("selectionchange", async () => {
      const data = await this.getNodeData([...figma.currentPage.selection]);

      figma.ui.postMessage({
        type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
        data,
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
    const selectedNode = selection[0];
    const figmaNodeInfo = (await selectedNode.exportAsync({
      format: "JSON_REST_V1",
    })) as FigmaRestApiResponse;

    const styleTree = await this._makeStyleTree(selectedNode);

    // INSTANCE의 mainComponent 수집
    const dependencies = await this._collectDependencies(selectedNode);

    // 이미지 URL 수집
    const imageUrls = await this._collectImageUrls(selectedNode);

    // VECTOR SVG 수집
    const vectorSvgs = await this._collectVectorSvgs(selectedNode);

    const nodeData: FigmaNodeData = {
      pluginData: (() => {
        const keys = selectedNode.getPluginDataKeys();
        return keys.map((key) => {
          return {
            key,
            value: selectedNode.getPluginData(key),
          };
        });
      })(),
      info: figmaNodeInfo,
      styleTree: styleTree || null,
      dependencies:
        Object.keys(dependencies).length > 0 ? dependencies : undefined,
      imageUrls: Object.keys(imageUrls).length > 0 ? imageUrls : undefined,
      vectorSvgs: Object.keys(vectorSvgs).length > 0 ? vectorSvgs : undefined,
    };

    return nodeData;
  }

  /**
   * 노드 트리를 순회하며 VECTOR 노드를 SVG로 export
   */
  private async _collectVectorSvgs(
    node: SceneNode
  ): Promise<Record<string, string>> {
    const vectorSvgs: Record<string, string> = {};

    await this._traverseAndCollectVectors(node, vectorSvgs);

    return vectorSvgs;
  }

  /**
   * 노드 트리를 순회하며 VECTOR 수집
   */
  private async _traverseAndCollectVectors(
    node: SceneNode,
    vectorSvgs: Record<string, string>
  ): Promise<void> {
    // VECTOR 노드인 경우 SVG로 export
    if (
      node.type === "VECTOR" ||
      node.type === "LINE" ||
      node.type === "STAR" ||
      node.type === "ELLIPSE" ||
      node.type === "POLYGON"
    ) {
      try {
        const svgBytes = await node.exportAsync({ format: "SVG" });
        const svgString = String.fromCharCode(...svgBytes);
        vectorSvgs[node.id] = svgString;
      } catch (e) {
        console.error(`Failed to export SVG: ${node.id}`, e);
      }
    }

    // 자식 노드 탐색
    if ("children" in node && node.children) {
      for (const child of node.children) {
        await this._traverseAndCollectVectors(child, vectorSvgs);
      }
    }
  }

  /**
   * 노드 트리를 순회하며 이미지를 수집하고 data URL로 변환
   */
  private async _collectImageUrls(
    node: SceneNode
  ): Promise<Record<string, string>> {
    const imageUrls: Record<string, string> = {};
    const visited = new Set<string>(); // 중복 방지

    await this._traverseAndCollectImages(node, imageUrls, visited);

    return imageUrls;
  }

  /**
   * 노드 트리를 순회하며 이미지 수집
   */
  private async _traverseAndCollectImages(
    node: SceneNode,
    imageUrls: Record<string, string>,
    visited: Set<string>
  ): Promise<void> {
    // fills에서 이미지 찾기
    if ("fills" in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (
          fill.type === "IMAGE" &&
          fill.imageHash &&
          !visited.has(fill.imageHash)
        ) {
          visited.add(fill.imageHash);

          try {
            const image = figma.getImageByHash(fill.imageHash);
            if (image) {
              const bytes = await image.getBytesAsync();
              const base64 = figma.base64Encode(bytes);
              // MIME 타입 추론 (PNG가 기본)
              const mimeType = "image/png";
              imageUrls[fill.imageHash] = `data:${mimeType};base64,${base64}`;
            }
          } catch (e) {
            console.error(`Failed to get image: ${fill.imageHash}`, e);
          }
        }
      }
    }

    // 자식 노드 탐색
    if ("children" in node && node.children) {
      for (const child of node.children) {
        await this._traverseAndCollectImages(child, imageUrls, visited);
      }
    }
  }

  /**
   * INSTANCE 노드의 원본 컴포넌트(mainComponent) 데이터를 수집
   */
  private async _collectDependencies(
    node: SceneNode
  ): Promise<Record<string, FigmaNodeData>> {
    const deps: Record<string, FigmaNodeData> = {};
    const visited = new Set<string>(); // 순환 참조 방지

    await this._traverseAndCollect(node, deps, visited);

    return deps;
  }

  /**
   * 노드 트리를 순회하며 INSTANCE의 mainComponent 데이터 수집
   */
  private async _traverseAndCollect(
    node: SceneNode,
    deps: Record<string, FigmaNodeData>,
    visited: Set<string>
  ): Promise<void> {
    // INSTANCE 노드인 경우 mainComponent 비동기로 가져오기
    if (node.type === "INSTANCE") {
      const mainComponent = await node.getMainComponentAsync();

      if (mainComponent) {
        const componentId = mainComponent.id;

        // 이미 수집했거나 순환 참조인 경우 스킵
        if (!deps[componentId] && !visited.has(componentId)) {
          visited.add(componentId);

          // mainComponent의 데이터 수집
          const componentInfo = (await mainComponent.exportAsync({
            format: "JSON_REST_V1",
          })) as FigmaRestApiResponse;
          const componentStyleTree = await this._makeStyleTree(mainComponent);

          deps[componentId] = {
            pluginData: [],
            info: componentInfo,
            styleTree: componentStyleTree,
          };

          // mainComponent의 자식도 재귀 탐색 (중첩 INSTANCE 처리)
          await this._traverseAndCollect(mainComponent, deps, visited);
        }
      }
    }

    // 자식 노드 탐색
    if ("children" in node && node.children) {
      for (const child of node.children) {
        await this._traverseAndCollect(child, deps, visited);
      }
    }
  }

  private async _makeStyleTree(node: SceneNode): Promise<StyleTree | null> {
    if (!node) return null;
    const cssStyle = await node.getCSSAsync();

    if (!("children" in node) || !node.children || node.children.length === 0) {
      return {
        id: node.id,
        name: node.name,
        cssStyle,
        children: [],
      };
    }

    const styleTree: StyleTree = {
      id: node.id,
      name: node.name,
      cssStyle,

      children: [],
    };

    for (const child of node.children) {
      const childStyleTree = await this._makeStyleTree(child);
      if (childStyleTree) {
        styleTree.children.push(childStyleTree);
      }
    }

    return styleTree;
  }
}
