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
  }

  /**
   * ArrayBuffer를 Base64 문자열로 변환
   * Figma 플러그인 환경에서는 btoa가 없으므로 figma.base64Encode 사용
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    return figma.base64Encode(buffer);
  }

  /**
   * 메시지 처리 (inlined from MessageHandler)
   */
  private async handleMessage(msg: PluginMessage): Promise<void> {
    switch (msg.type) {
      case MESSAGE_TYPES.CANCEL:
        await this.handleCancel();
        break;

      case MESSAGE_TYPES.EXPORT_SELECTION_IMAGE:
        await this.handleExportSelectionImage();
        break;

      default:
        console.log("⚠️ [Plugin Backend] Unknown message type:", msg.type);
    }
  }

  private async handleCancel(): Promise<void> {
    figma.closePlugin();
  }

  /**
   * 선택된 노드의 이미지를 PNG로 내보내기
   */
  private async handleExportSelectionImage(): Promise<void> {
    try {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.SELECTION_IMAGE_RESULT,
          imageBase64: null,
          error: "No node selected",
        });
        return;
      }

      const node = selection[0];
      if (!("exportAsync" in node)) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.SELECTION_IMAGE_RESULT,
          imageBase64: null,
          error: "Node cannot be exported",
        });
        return;
      }

      const imageBytes = await node.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }, // Retina 2x
      });
      const imageBase64 = this.arrayBufferToBase64(imageBytes);

      figma.ui.postMessage({
        type: MESSAGE_TYPES.SELECTION_IMAGE_RESULT,
        imageBase64,
      });
    } catch (error) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.SELECTION_IMAGE_RESULT,
        imageBase64: null,
        error: (error as Error).message,
      });
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
    // VECTOR 또는 BOOLEAN_OPERATION 노드인 경우 SVG로 export
    // BOOLEAN_OPERATION은 여러 VECTOR를 조합한 복합 도형 (예: 배터리 아이콘)
    if (
      node.type === "VECTOR" ||
      node.type === "LINE" ||
      node.type === "STAR" ||
      node.type === "ELLIPSE" ||
      node.type === "POLYGON" ||
      node.type === "BOOLEAN_OPERATION"
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

    // getCSSAsync()가 INSTANCE 등 일부 노드에서 특정 속성을 누락하므로 보충
    if (!cssStyle.opacity && "opacity" in node && (node as any).opacity !== 1) {
      cssStyle.opacity = String((node as any).opacity);
    }
    if (!cssStyle.overflow && "clipsContent" in node && (node as any).clipsContent === true) {
      cssStyle.overflow = "hidden";
    }
    if (!cssStyle["mix-blend-mode"] && "blendMode" in node) {
      const bm = (node as any).blendMode;
      if (bm && bm !== "PASS_THROUGH" && bm !== "NORMAL") {
        cssStyle["mix-blend-mode"] = bm.toLowerCase().replace(/_/g, "-");
      }
    }
    if (!cssStyle.transform && "rotation" in node && (node as any).rotation !== 0) {
      cssStyle.transform = `rotate(${(node as any).rotation}deg)`;
    }

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
