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
  | SaveElementBindingsMessage;
