import { FigmaNodeData } from "@frontend/ui/domain/transpiler/types/figma-api";
import {
  ElementBindingsMap,
  PropDefinition,
  StateDefinition,
} from "../managers/MetadataManager";

/**
 * 메시지 타입 상수
 */
export const MESSAGE_TYPES = {
  // UI → Plugin 메시지
  CANCEL: "cancel",

  SET_METADATA: "set-metadata",

  SAVE_PROPS_DEFINITION: "save-props-definition",
  SAVE_INTERNAL_STATE_DEFINITION: "save-internal-state-definition",
  SAVE_ELEMENT_BINDINGS: "save-element-bindings",

  ON_SELECTION_CHANGE: "on-selection-change",
  ON_RUN: "on-run",

  // UI 크기 조절
  RESIZE_UI: "resize-ui",              // UI → Plugin: 창 크기 조절 요청

  // 스캔 관련 메시지
  SCAN_PAGE: "scan-page",              // UI → Plugin: 페이지 스캔 요청
  SCAN_STARTED: "scan-started",        // Plugin → UI: 스캔 시작
  SCAN_ITEM: "scan-item",              // Plugin → UI: 개별 노드 데이터
  SCAN_ITEM_ERROR: "scan-item-error",  // Plugin → UI: 노드 처리 에러
  SCAN_COMPLETE: "scan-complete",      // Plugin → UI: 스캔 완료

  // 선택 이미지 내보내기
  EXPORT_SELECTION_IMAGE: "export-selection-image",  // UI → Plugin: 선택된 노드 이미지 요청
  SELECTION_IMAGE_RESULT: "selection-image-result",  // Plugin → UI: 이미지 결과
} as const;

export interface OnRunMessage {
  type: typeof MESSAGE_TYPES.ON_RUN;
  data: FigmaNodeData;
}

export interface OnSelectionChangeMessage {
  type: typeof MESSAGE_TYPES.ON_SELECTION_CHANGE;
  data: FigmaNodeData;
}

// 취소 메시지
export interface CancelMessage {
  type: typeof MESSAGE_TYPES.CANCEL;
}

// 메타데이터 설정 메시지
export interface SetMetadataMessage {
  type: typeof MESSAGE_TYPES.SET_METADATA;
  nodeId: string;
  metadataType: string;
}

// Props 정의 저장 메시지
export interface SavePropsDefinitionMessage {
  type: typeof MESSAGE_TYPES.SAVE_PROPS_DEFINITION;
  data: PropDefinition[];
}

// Internal State 정의 저장 메시지
export interface SaveInternalStateDefinitionMessage {
  type: typeof MESSAGE_TYPES.SAVE_INTERNAL_STATE_DEFINITION;
  data: StateDefinition[];
}

// Element Bindings 저장 메시지
export interface SaveElementBindingsMessage {
  type: typeof MESSAGE_TYPES.SAVE_ELEMENT_BINDINGS;
  data: ElementBindingsMap;
}

// UI 크기 조절 메시지
export interface ResizeUIMessage {
  type: typeof MESSAGE_TYPES.RESIZE_UI;
  width: number;
  height: number;
}

// === 스캔 관련 메시지 ===

// 페이지 스캔 요청 (UI → Plugin)
export interface ScanPageMessage {
  type: typeof MESSAGE_TYPES.SCAN_PAGE;
  options?: {
    includeFrames?: boolean;      // top-level FRAME 포함 (기본: true)
    includeComponents?: boolean;  // COMPONENT 포함 (기본: true)
    includeComponentSets?: boolean; // COMPONENT_SET 포함 (기본: true)
    includeImages?: boolean;       // 이미지 캡처 포함 (기본: false, 느릴 수 있음)
  };
}

// 스캔 시작 알림 (Plugin → UI)
export interface ScanStartedMessage {
  type: typeof MESSAGE_TYPES.SCAN_STARTED;
  total: number;
  pageName: string;
}

// Variant 정보 (COMPONENT_SET 내의 각 COMPONENT)
export interface VariantInfo {
  id: string;
  name: string;
  variantProps: Record<string, string>;
  imageBase64?: string | null;
  nodeData?: FigmaNodeData | null;  // variant의 nodeData (Export JSON용)
}

// 개별 노드 데이터 (Plugin → UI)
export interface ScanItemMessage {
  type: typeof MESSAGE_TYPES.SCAN_ITEM;
  current: number;
  total: number;
  item: {
    id: string;
    name: string;
    nodeType: string;
    nodeData: FigmaNodeData;
    imageBase64?: string | null;  // Figma 원본 이미지 (PNG, base64)
    variants?: VariantInfo[] | null;  // COMPONENT_SET의 variant 정보
  };
}

// 노드 처리 에러 (Plugin → UI)
export interface ScanItemErrorMessage {
  type: typeof MESSAGE_TYPES.SCAN_ITEM_ERROR;
  id: string;
  name: string;
  error: string;
}

// 스캔 완료 (Plugin → UI)
export interface ScanCompleteMessage {
  type: typeof MESSAGE_TYPES.SCAN_COMPLETE;
  total: number;
  succeeded: number;
  failed: number;
}

// 선택된 노드 이미지 요청 (UI → Plugin)
export interface ExportSelectionImageMessage {
  type: typeof MESSAGE_TYPES.EXPORT_SELECTION_IMAGE;
}

// 선택된 노드 이미지 결과 (Plugin → UI)
export interface SelectionImageResultMessage {
  type: typeof MESSAGE_TYPES.SELECTION_IMAGE_RESULT;
  imageBase64: string | null;
  error?: string;
}

/**
 * UI로 전송되는 모든 메시지의 Union 타입
 */
export type PluginMessage =
  | CancelMessage
  | SetMetadataMessage
  | OnRunMessage
  | OnSelectionChangeMessage
  | SavePropsDefinitionMessage
  | SaveInternalStateDefinitionMessage
  | SaveElementBindingsMessage
  | ResizeUIMessage
  | ScanPageMessage
  | ScanStartedMessage
  | ScanItemMessage
  | ScanItemErrorMessage
  | ScanCompleteMessage
  | ExportSelectionImageMessage
  | SelectionImageResultMessage;
