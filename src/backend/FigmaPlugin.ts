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

      case MESSAGE_TYPES.SET_METADATA:
        await this.handleSetMetadata(msg);
        break;

      case MESSAGE_TYPES.RESIZE_UI:
        figma.ui.resize(msg.width, msg.height);
        break;

      case MESSAGE_TYPES.SCAN_PAGE:
        await this.handleScanPage(msg);
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

  /**
   * 페이지 스캔 처리
   * 현재 페이지의 모든 테스트 대상 노드를 수집하고 각각의 데이터를 UI로 전송
   */
  private async handleScanPage(
    msg: Extract<PluginMessage, { type: "scan-page" }>
  ): Promise<void> {
    try {
      const options = msg.options ?? {};
      const includeFrames = options.includeFrames ?? false; // 기본: off
      const includeComponentSets = options.includeComponentSets ?? true; // 기본: on
      const includeImages = options.includeImages ?? true;

      // 테스트 대상 노드 수집
      const targets = this.collectScanTargets(figma.currentPage, {
        includeFrames,
        includeComponentSets,
      });

      // 스캔 시작 알림
      figma.ui.postMessage({
        type: MESSAGE_TYPES.SCAN_STARTED,
        total: targets.length,
        pageName: figma.currentPage.name,
      });

      let succeeded = 0;
      let failed = 0;

      // 각 노드 처리 (비동기적으로 UI 응답성 유지)
      for (let i = 0; i < targets.length; i++) {
        const node = targets[i];

        // 이벤트 루프에 제어권 양보 → UI 응답성 유지
        await new Promise((resolve) => setTimeout(resolve, 0));

        try {
          // 현재 노드 데이터 수집
          const nodeData = await this.getNodeData([node]);

          // PNG 이미지 export (base64) - 옵션이 켜져 있을 때만
          let imageBase64: string | null = null;
          if (includeImages) {
            try {
              const imageBytes = await node.exportAsync({
                format: "PNG",
                constraint: { type: "SCALE", value: 2 }, // Retina 디스플레이에 맞춤 (2x)
              });
              imageBase64 = this.arrayBufferToBase64(imageBytes);
            } catch (imgError) {
              // 이미지 export 실패 시 무시 (노드 데이터는 계속 수집)
            }
          }

          // COMPONENT_SET인 경우: 각 variant(COMPONENT) 정보 수집
          let variants: Array<{
            id: string;
            name: string;
            variantProps: Record<string, string>;
            imageBase64?: string | null;
            nodeData?: FigmaNodeData | null;
          }> | null = null;

          if (node.type === "COMPONENT_SET") {
            const componentSet = node as ComponentSetNode;
            variants = [];

            for (const child of componentSet.children) {
              if (child.type === "COMPONENT") {
                const component = child as ComponentNode;
                let variantImage: string | null = null;

                // 각 variant 이미지 캡처
                if (includeImages) {
                  try {
                    const variantBytes = await component.exportAsync({
                      format: "PNG",
                      constraint: { type: "SCALE", value: 2 }, // Retina 디스플레이에 맞춤 (2x)
                    });
                    variantImage = this.arrayBufferToBase64(variantBytes);
                  } catch (imgError) {
                    // 이미지 export 실패 무시
                  }
                }

                // variant의 nodeData 가져오기 (Export JSON용)
                let variantNodeData = null;
                try {
                  variantNodeData = await this.getNodeData([component]);
                } catch (nodeDataError) {
                  // nodeData 가져오기 실패 무시
                }

                variants.push({
                  id: component.id,
                  name: component.name,
                  variantProps: component.variantProperties || {},
                  imageBase64: variantImage,
                  nodeData: variantNodeData,
                });
              }
            }
          }

          figma.ui.postMessage({
            type: MESSAGE_TYPES.SCAN_ITEM,
            current: i + 1,
            total: targets.length,
            item: {
              id: node.id,
              name: node.name,
              nodeType: node.type,
              nodeData,
              imageBase64,
              variants, // COMPONENT_SET의 variant 정보
            },
          });

          succeeded++;
        } catch (error) {
          figma.ui.postMessage({
            type: MESSAGE_TYPES.SCAN_ITEM_ERROR,
            id: node.id,
            name: node.name,
            error: error instanceof Error ? error.message : String(error),
          });

          failed++;
        }
      }

      // 스캔 완료 알림
      figma.ui.postMessage({
        type: MESSAGE_TYPES.SCAN_COMPLETE,
        total: targets.length,
        succeeded,
        failed,
      });

      this.notify(`스캔 완료: ${succeeded}개 성공, ${failed}개 실패`);
    } catch (error) {
      this.notify(
        `스캔 에러: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 스캔 대상 노드 수집
   * 페이지 전체를 재귀적으로 탐색하여 대상 노드 수집
   */
  private collectScanTargets(
    page: PageNode,
    options: {
      includeFrames: boolean;
      includeComponentSets: boolean;
    }
  ): SceneNode[] {
    const targets: SceneNode[] = [];

    // 재귀적으로 모든 자식 노드 탐색
    const traverse = (node: SceneNode): void => {
      // COMPONENT_SET: 재귀 탐색 종료 (내부는 variant들)
      if (options.includeComponentSets && node.type === "COMPONENT_SET") {
        targets.push(node);
        return; // COMPONENT_SET 내부는 탐색하지 않음
      }

      // FRAME: top-level만 수집하거나, 재귀 탐색 계속
      if (node.type === "FRAME") {
        if (options.includeFrames) {
          // FRAME도 수집 대상이면 추가하고 내부는 탐색하지 않음
          targets.push(node);
          return;
        }
        // FRAME이 수집 대상이 아니면 내부 탐색 계속
        if ("children" in node) {
          for (const child of node.children) {
            traverse(child);
          }
        }
        return;
      }

      // GROUP, SECTION 등: 내부 탐색 계속
      if ("children" in node) {
        for (const child of (node as ChildrenMixin).children) {
          traverse(child as SceneNode);
        }
      }
    };

    // 페이지의 모든 자식에서 시작
    for (const child of page.children) {
      traverse(child);
    }

    return targets;
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
