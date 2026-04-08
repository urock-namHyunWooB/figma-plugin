declare const GITHUB_TOKEN: string;

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
    figma.showUI(__html__, { width: 500, height: 1000 });

    figma.ui.onmessage = async (msg) => {
      if (msg.type === MESSAGE_TYPES.REQUEST_REFRESH) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.ui.postMessage({
            type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
            data: null,
          });
          return;
        }
        // 멀티 선택은 첫 노드만 사용 (자동 점프 제거)
        const data = await this.getNodeData([selection[0]]);
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data,
        });
        return;
      }
      await this.handleMessage(msg);
    };

    figma.on("selectionchange", async () => {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data: null,
        });
        return;
      }
      // 멀티 선택은 첫 노드만 사용
      const data = await this.getNodeData([selection[0]]);
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

      case MESSAGE_TYPES.GITHUB_FETCH_REQUEST:
        await this.handleGitHubFetch(msg);
        break;

      case MESSAGE_TYPES.RESIZE_UI:
        figma.ui.resize(msg.width, msg.height);
        break;

      case MESSAGE_TYPES.EXTRACT_DESIGN_TOKENS:
        await this.handleExtractDesignTokens();
        break;

      case MESSAGE_TYPES.SELECT_NODE:
        await this.handleSelectNode(msg.nodeId);
        break;

      default:
        console.log("⚠️ [Plugin Backend] Unknown message type:", msg.type);
    }
  }

  private async handleCancel(): Promise<void> {
    figma.closePlugin();
  }

  /**
   * Figma 캔버스에서 특정 노드를 선택하고 화면에 표시
   */
  private async handleSelectNode(nodeId: string): Promise<void> {
    try {
      const node = figma.getNodeById(nodeId);
      if (node && "type" in node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
    } catch (error) {
      console.error("Failed to select node:", error);
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
   * GitHub API fetch 프록시 — UI iframe의 CSP 제한 우회
   */
  private async handleGitHubFetch(msg: PluginMessage): Promise<void> {
    if (msg.type !== MESSAGE_TYPES.GITHUB_FETCH_REQUEST) return;
    const { requestId, url, method, body } = msg;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        ...(body ? { body } : {}),
      });

      const responseBody = await res.text();
      figma.ui.postMessage({
        type: MESSAGE_TYPES.GITHUB_FETCH_RESPONSE,
        requestId,
        ok: res.ok,
        status: res.status,
        body: responseBody,
      });
    } catch (e) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.GITHUB_FETCH_RESPONSE,
        requestId,
        ok: false,
        status: 0,
        body: (e as Error).message,
      });
    }
  }

  /**
   * 현재 페이지의 boundVariables + 로컬 Variables에서 COLOR 토큰 추출 → UI로 전달
   */
  private async handleExtractDesignTokens(): Promise<void> {
    try {
      const tokens: { name: string; value: string }[] = [];
      const collectionModeCache = new Map<string, string>();
      const collectionNameCache = new Map<string, string>();
      const seenVarIds = new Set<string>();

      /** getCSSAsync()와 일치하는 토큰 CSS 변수명 생성 */
      const toTokenCssName = (v: Variable, collectionName?: string): string => {
        // 1. codeSyntax.WEB 우선 (Figma에서 설정한 코드 구문)
        if (v.codeSyntax?.WEB) {
          return v.codeSyntax.WEB.replace(/^--/, "");
        }
        // 2. 컬렉션명 prefix 제거 후 변환
        let name = v.name;
        if (collectionName && name.startsWith(collectionName + "/")) {
          name = name.slice(collectionName.length + 1);
        }
        return name.replace(/\//g, "-").replace(/[^a-zA-Z0-9-_]/g, "");
      };

      // 1. 현재 페이지의 모든 노드에서 바인딩된 변수 ID 수집
      const allNodes = figma.currentPage.findAll();
      const varIds = new Set<string>();
      for (const node of allNodes) {
        const bv = (node as SceneNode).boundVariables;
        if (!bv) continue;
        for (const bindings of Object.values(bv)) {
          const list = Array.isArray(bindings) ? bindings : [bindings];
          for (const binding of list) {
            if (binding && typeof binding === "object" && "id" in binding) {
              varIds.add((binding as { id: string }).id);
            }
          }
        }
      }

      // 2. 수집된 변수 중 COLOR 타입만 resolve
      for (const varId of varIds) {
        if (seenVarIds.has(varId)) continue;
        seenVarIds.add(varId);
        try {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (!variable || variable.resolvedType !== "COLOR") continue;

          let modeId = collectionModeCache.get(variable.variableCollectionId);
          if (!modeId) {
            const collection = await figma.variables.getVariableCollectionByIdAsync(
              variable.variableCollectionId
            );
            if (!collection) continue;
            modeId = collection.defaultModeId;
            collectionModeCache.set(variable.variableCollectionId, modeId);
            collectionNameCache.set(variable.variableCollectionId, collection.name);
          }

          const resolved = await this.resolveVariableValue(variable, modeId);
          if (resolved) {
            const cssName = toTokenCssName(variable, collectionNameCache.get(variable.variableCollectionId));
            if (cssName) {
              tokens.push({ name: cssName, value: resolved });
            }
          }
        } catch {
          // 개별 변수 resolve 실패 시 스킵
        }
      }

      // 3. 로컬 변수도 추가 (중복 제거)
      const localVars = await figma.variables.getLocalVariablesAsync("COLOR");
      let existingNames = new Set(tokens.map((t) => t.name));

      for (const variable of localVars) {
        if (seenVarIds.has(variable.id)) continue;

        let modeId = collectionModeCache.get(variable.variableCollectionId);
        if (!modeId) {
          const collection = await figma.variables.getVariableCollectionByIdAsync(
            variable.variableCollectionId
          );
          if (!collection) continue;
          modeId = collection.defaultModeId;
          collectionModeCache.set(variable.variableCollectionId, modeId);
          collectionNameCache.set(variable.variableCollectionId, collection.name);
        }

        const resolved = await this.resolveVariableValue(variable, modeId);
        if (resolved) {
          const cssName = toTokenCssName(variable, collectionNameCache.get(variable.variableCollectionId));
          if (cssName && !existingNames.has(cssName)) {
            tokens.push({ name: cssName, value: resolved });
          }
        }
      }

      // 4. 문서 전체의 COMPONENT_SET/COMPONENT에서 getCSSAsync로 누락 토큰 보충
      //    boundVariables가 INSTANCE 상속 변수를 노출하지 않는 Figma API 한계 보완
      //    성능: COMPONENT_SET의 직계 variant + 깊이 2까지만 스캔
      existingNames = new Set(tokens.map((t) => t.name));
      await figma.loadAllPagesAsync();
      const componentSets = figma.root.findAll(
        (n) => n.type === "COMPONENT_SET"
      );

      const extractVarsFromCss = (css: Record<string, string>) => {
        for (const val of Object.values(css)) {
          const matches = val.matchAll(/var\(--([^,]+),\s*([^)]+)\)/g);
          for (const m of matches) {
            const name = m[1].trim();
            const fallback = m[2].trim();
            if (!existingNames.has(name) && /^#[0-9a-fA-F]{3,8}$/.test(fallback)) {
              tokens.push({ name, value: fallback.toLowerCase() });
              existingNames.add(name);
            }
          }
        }
      };

      for (const cs of componentSets) {
        if (!("children" in cs)) continue;
        // variant(직계 자식) 순회
        for (const variant of (cs as FrameNode).children) {
          try { extractVarsFromCss(await variant.getCSSAsync()); } catch { /* skip */ }
          // variant의 직계 자식 (깊이 1) 순회
          if ("children" in variant) {
            for (const child of (variant as FrameNode).children) {
              try { extractVarsFromCss(await child.getCSSAsync()); } catch { /* skip */ }
            }
          }
        }
      }

      figma.ui.postMessage({
        type: MESSAGE_TYPES.DESIGN_TOKENS_RESULT,
        tokens,
      });
    } catch (error) {
      figma.ui.postMessage({
        type: MESSAGE_TYPES.DESIGN_TOKENS_RESULT,
        tokens: [],
        error: (error as Error).message,
      });
    }
  }

  /**
   * Variable 값을 hex 문자열로 resolve (alias 체인 추적)
   */
  private async resolveVariableValue(
    variable: Variable,
    modeId: string,
    depth = 0
  ): Promise<string | null> {
    if (depth > 10) return null; // 순환 참조 방지

    const value = variable.valuesByMode[modeId];
    if (!value) return null;

    // alias인 경우 재귀 resolve
    if (typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS") {
      const referenced = await figma.variables.getVariableByIdAsync(value.id);
      if (!referenced) return null;

      // 참조 변수의 collection에서 default mode 가져오기
      const refCollection = await figma.variables.getVariableCollectionByIdAsync(
        referenced.variableCollectionId
      );
      if (!refCollection) return null;

      return this.resolveVariableValue(referenced, refCollection.defaultModeId, depth + 1);
    }

    // RGBA 값인 경우 hex로 변환
    if (typeof value === "object" && "r" in value) {
      return this.rgbaToHex(value as RGBA);
    }

    return null;
  }

  /**
   * Figma RGBA (0-1 범위) → hex 문자열
   */
  private rgbaToHex(rgba: RGBA): string {
    const r = Math.round(rgba.r * 255);
    const g = Math.round(rgba.g * 255);
    const b = Math.round(rgba.b * 255);

    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

    // alpha가 1이 아니면 8자리 hex
    if (rgba.a !== undefined && rgba.a < 1) {
      const a = Math.round(rgba.a * 255);
      return `${hex}${a.toString(16).padStart(2, "0")}`;
    }

    return hex;
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
