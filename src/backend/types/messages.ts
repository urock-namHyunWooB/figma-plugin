import { FigmaNodeData } from "@frontend/ui/domain/transpiler/types/figma-api";

/**
 * 메시지 타입 상수
 */
export const MESSAGE_TYPES = {
  // UI → Plugin 메시지
  CANCEL: "cancel",

  ON_SELECTION_CHANGE: "on-selection-change",

  // 선택 이미지 내보내기
  EXPORT_SELECTION_IMAGE: "export-selection-image",  // UI → Plugin: 선택된 노드 이미지 요청
  SELECTION_IMAGE_RESULT: "selection-image-result",  // Plugin → UI: 이미지 결과
} as const;

export interface OnSelectionChangeMessage {
  type: typeof MESSAGE_TYPES.ON_SELECTION_CHANGE;
  data: FigmaNodeData;
}

// 취소 메시지
export interface CancelMessage {
  type: typeof MESSAGE_TYPES.CANCEL;
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
  | OnSelectionChangeMessage
  | ExportSelectionImageMessage
  | SelectionImageResultMessage;
