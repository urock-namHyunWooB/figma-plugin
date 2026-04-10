declare const GITHUB_TOKEN: string;

import { MESSAGE_TYPES, PluginMessage } from "./types/messages";
import { createExtractionPipeline, type ExtractionPipeline } from "./extraction";
import { applyFix, applyFixes } from "./handlers/feedbackFixHandler";

/**
 * 메인 플러그인 클래스
 * 단일 책임: 플러그인 초기화 및 전체 라이프사이클 관리
 */
export class FigmaPlugin {
  private pipeline!: ExtractionPipeline;

  /**
   * 플러그인 초기화
   */
  async initialize(): Promise<void> {
    // UI 표시
    figma.showUI(__html__, { width: 900, height: 1000 });

    // dynamic-page 모드에서 documentchange 이벤트를 받으려면 반드시 먼저 호출해야 함.
    // 이게 없으면 documentchange 자체가 발동 안 함 (Figma 공식 docs + 실측 확인).
    // 큰 파일에서 시작이 느려질 수 있음 — Figma의 trade-off.
    await figma.loadAllPagesAsync();

    // 추출 파이프라인 생성: 캐시 + 디바운스 + 단일 walk 병렬 추출
    // 주의: onLoading은 async dispatcher 안에서 post되면 Figma가 task 끝까지
    // 메시지를 버퍼링해서 UI가 너무 늦게 받음. 대신 selectionchange / onmessage
    // 동기 핸들러에서 직접 figma.ui.postMessage(EXTRACTION_LOADING)을 호출.
    this.pipeline = createExtractionPipeline({
      onResult: (data) => {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data,
        });
      },
      onLoading: () => {
        figma.ui.postMessage({ type: MESSAGE_TYPES.EXTRACTION_LOADING });
      },
      onError: (err) => {
        console.error("Extraction failed:", err);
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data: null,
          error: err.message,
        });
      },
    });

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
        // 새로고침은 캐시 우회 → 항상 walk 발생 → 로딩 신호 미리 보내기 (sync)
        figma.ui.postMessage({ type: MESSAGE_TYPES.EXTRACTION_LOADING });
        // 멀티 선택은 첫 노드만 사용 (자동 점프 제거)
        // 새로고침은 디바운스 우회 + 캐시 우회
        this.pipeline.fireImmediate(selection[0], true);
        return;
      }
      await this.handleMessage(msg);
    };

    figma.on("selectionchange", () => {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.ON_SELECTION_CHANGE,
          data: null,
        });
        return;
      }
      const target = selection[0];
      // 캐시 미스일 때만 로딩 신호 (sync 컨텍스트 → Figma가 즉시 dispatch)
      if (!this.pipeline.peekCache(target.id)) {
        figma.ui.postMessage({ type: MESSAGE_TYPES.EXTRACTION_LOADING });
      }
      // 멀티 선택은 첫 노드만 사용
      this.pipeline.schedule(target);
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

      case MESSAGE_TYPES.APPLY_FIX_ITEM:
        await this.handleApplyFixItem(msg);
        break;

      case MESSAGE_TYPES.APPLY_FIX_GROUP:
        await this.handleApplyFixGroup(msg);
        break;

      default:
        console.log("⚠️ [Plugin Backend] Unknown message type:", msg.type);
    }
  }

  /**
   * 단일 fix 적용 — UI에서 [Fix] 버튼 클릭 시.
   * Undo는 Figma 기본 메커니즘에 위임 (한 핸들러 호출 = 1 undo step).
   */
  private async handleApplyFixItem(msg: {
    nodeId: string;
    cssProperty: string;
    expectedValue: string;
  }): Promise<void> {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.APPLY_FIX_RESULT,
          success: false,
          appliedCount: 0,
          skippedReasons: ["node not found"],
        });
        return;
      }

      const result = applyFix(node, {
        cssProperty: msg.cssProperty,
        expectedValue: msg.expectedValue,
      });

      figma.ui.postMessage({
        type: MESSAGE_TYPES.APPLY_FIX_RESULT,
        success: result.success,
        appliedCount: result.success ? 1 : 0,
        skippedReasons: result.success ? [] : [result.reason ?? "unknown"],
      });

      // 성공 시 현재 selection 강제 재추출 → UI 자동 갱신
      if (result.success) this.refreshCurrentSelection();
    } catch (error) {
      console.error("Failed to apply fix:", error);
      figma.ui.postMessage({
        type: MESSAGE_TYPES.APPLY_FIX_RESULT,
        success: false,
        appliedCount: 0,
        skippedReasons: [String(error)],
      });
    }
  }

  /**
   * 그룹 fix 적용 — UI에서 [Fix N] 버튼 클릭 시.
   */
  private async handleApplyFixGroup(msg: {
    nodeId: string;
    fixes: Array<{ cssProperty: string; expectedValue: string }>;
  }): Promise<void> {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        figma.ui.postMessage({
          type: MESSAGE_TYPES.APPLY_FIX_RESULT,
          success: false,
          appliedCount: 0,
          skippedReasons: ["node not found"],
        });
        return;
      }

      const { appliedCount, skippedReasons } = applyFixes(node, msg.fixes);

      figma.ui.postMessage({
        type: MESSAGE_TYPES.APPLY_FIX_RESULT,
        success: appliedCount > 0,
        appliedCount,
        skippedReasons,
      });

      // 1건 이상 성공 시 현재 selection 강제 재추출 → UI 자동 갱신
      if (appliedCount > 0) this.refreshCurrentSelection();
    } catch (error) {
      console.error("Failed to apply fix group:", error);
      figma.ui.postMessage({
        type: MESSAGE_TYPES.APPLY_FIX_RESULT,
        success: false,
        appliedCount: 0,
        skippedReasons: [String(error)],
      });
    }
  }

  private async handleCancel(): Promise<void> {
    figma.closePlugin();
  }

  /**
   * Fix 적용 후 현재 selection을 강제 재추출 (캐시 우회).
   * selectionchange가 트리거되지 않으므로 수동으로 동일한 경로를 호출.
   */
  private refreshCurrentSelection(): void {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) return;
    figma.ui.postMessage({ type: MESSAGE_TYPES.EXTRACTION_LOADING });
    this.pipeline.fireImmediate(selection[0], true);
  }

  /**
   * Figma 캔버스에서 특정 노드를 선택하고 화면에 표시
   */
  private async handleSelectNode(nodeId: string): Promise<void> {
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
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

}
