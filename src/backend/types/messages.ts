import type { FigmaNodeData } from "@code-generator2";

/**
 * 메시지 타입 상수
 */
export const MESSAGE_TYPES = {
  // UI → Plugin 메시지
  CANCEL: "cancel",

  ON_SELECTION_CHANGE: "on-selection-change",

  // 추출 로딩 신호 (Plugin → UI): 캐시 미스로 walk가 시작될 때 발사
  EXTRACTION_LOADING: "extraction-loading",

  // 선택 이미지 내보내기
  EXPORT_SELECTION_IMAGE: "export-selection-image",  // UI → Plugin: 선택된 노드 이미지 요청
  SELECTION_IMAGE_RESULT: "selection-image-result",  // Plugin → UI: 이미지 결과

  // GitHub API 프록시
  GITHUB_FETCH_REQUEST: "github-fetch-request",    // UI → Plugin: fetch 요청
  GITHUB_FETCH_RESPONSE: "github-fetch-response",  // Plugin → UI: fetch 응답

  // UI 리사이즈
  RESIZE_UI: "resize-ui",  // UI → Plugin: 패널 크기 변경 요청

  // 디자인 토큰 추출
  EXTRACT_DESIGN_TOKENS: "extract-design-tokens",    // UI → Plugin: 토큰 추출 요청
  DESIGN_TOKENS_RESULT: "design-tokens-result",      // Plugin → UI: 토큰 결과

  // 노드 선택
  SELECT_NODE: "select-node",  // UI → Plugin: Figma 캔버스에서 노드 선택

  // 새로고침 요청
  REQUEST_REFRESH: "request-refresh",  // UI → Plugin: 현재 선택 데이터 재전송

  // Feedback fix-assist
  APPLY_FIX_ITEM: "apply-fix-item",      // UI → Plugin: 단일 item fix 적용
  APPLY_FIX_GROUP: "apply-fix-group",    // UI → Plugin: group 전체 fix 적용
  APPLY_FIX_RESULT: "apply-fix-result",  // Plugin → UI: 적용 결과
} as const;

export interface OnSelectionChangeMessage {
  type: typeof MESSAGE_TYPES.ON_SELECTION_CHANGE;
  data: FigmaNodeData | null;
}

// 추출 로딩 신호 (Plugin → UI): 캐시 미스로 walk가 시작될 때 발사
export interface ExtractionLoadingMessage {
  type: typeof MESSAGE_TYPES.EXTRACTION_LOADING;
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

// GitHub API 프록시 요청 (UI → Plugin)
export interface GitHubFetchRequestMessage {
  type: typeof MESSAGE_TYPES.GITHUB_FETCH_REQUEST;
  requestId: string;
  url: string;
  method: string;
  body?: string;
}

// GitHub API 프록시 응답 (Plugin → UI)
export interface GitHubFetchResponseMessage {
  type: typeof MESSAGE_TYPES.GITHUB_FETCH_RESPONSE;
  requestId: string;
  ok: boolean;
  status: number;
  body: string;
}

// UI 리사이즈 요청 (UI → Plugin)
export interface ResizeUIMessage {
  type: typeof MESSAGE_TYPES.RESIZE_UI;
  width: number;
  height: number;
}

// 디자인 토큰 추출 요청 (UI → Plugin)
export interface ExtractDesignTokensMessage {
  type: typeof MESSAGE_TYPES.EXTRACT_DESIGN_TOKENS;
}

// 디자인 토큰
export interface DesignToken {
  name: string;   // CSS 변수명 (-- 제외), e.g. "Color-primary-01"
  value: string;  // resolved hex, e.g. "#628cf5"
}

// 디자인 토큰 결과 (Plugin → UI)
export interface DesignTokensResultMessage {
  type: typeof MESSAGE_TYPES.DESIGN_TOKENS_RESULT;
  tokens: DesignToken[];
  error?: string;
}

// 노드 선택 요청 (UI → Plugin)
export interface SelectNodeMessage {
  type: typeof MESSAGE_TYPES.SELECT_NODE;
  nodeId: string;
}

// Feedback fix-assist 단일 item (UI → Plugin)
export interface ApplyFixItemMessage {
  type: typeof MESSAGE_TYPES.APPLY_FIX_ITEM;
  nodeId: string;
  cssProperty: string;
  expectedValue: string;
}

// Feedback fix-assist 그룹 (UI → Plugin)
export interface ApplyFixGroupMessage {
  type: typeof MESSAGE_TYPES.APPLY_FIX_GROUP;
  nodeId: string;
  fixes: Array<{
    cssProperty: string;
    expectedValue: string;
  }>;
}

// Feedback fix-assist 결과 (Plugin → UI)
export interface ApplyFixResultMessage {
  type: typeof MESSAGE_TYPES.APPLY_FIX_RESULT;
  success: boolean;
  appliedCount: number;
  skippedReasons: string[];
}

/**
 * UI로 전송되는 모든 메시지의 Union 타입
 */
export type PluginMessage =
  | CancelMessage
  | OnSelectionChangeMessage
  | ExtractionLoadingMessage
  | ExportSelectionImageMessage
  | SelectionImageResultMessage
  | GitHubFetchRequestMessage
  | GitHubFetchResponseMessage
  | ResizeUIMessage
  | ExtractDesignTokensMessage
  | DesignTokensResultMessage
  | SelectNodeMessage
  | ApplyFixItemMessage
  | ApplyFixGroupMessage
  | ApplyFixResultMessage;
