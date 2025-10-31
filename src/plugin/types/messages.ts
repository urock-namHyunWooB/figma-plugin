import {
  PropertyConfig,
  PropDefinition,
  StateDefinition,
  ElementBindingsMap,
} from "../managers/MetadataManager";
import { ComponentStructureData } from "../../ui/domain/component-structure/types";
import { Component } from "react";

/**
 * 메시지 타입 상수
 */
export const MESSAGE_TYPES = {
  // UI → Plugin 메시지
  CANCEL: "cancel",
  CHANGE_VARIANT: "change-variant",
  SET_METADATA: "set-metadata",
  EXTRACT_JSON: "extract-json",
  SAVE_COMPONENT_PROPERTY: "save-component-property",
  SAVE_PROPS_DEFINITION: "save-props-definition",
  SAVE_INTERNAL_STATE_DEFINITION: "save-internal-state-definition",
  SAVE_ELEMENT_BINDINGS: "save-element-bindings",

  // Plugin → UI 메시지
  SELECTION_INFO: "selection-info",
  COMPONENT_SET_INFO: "component-set-info",
  COMPONENT_PROPERTY_CONFIG: "component-property-config",
  PROPS_DEFINITION: "props-definition",
  INTERNAL_STATE_DEFINITION: "internal-state-definition",
  COMPONENT_STRUCTURE: "component-structure",
  ELEMENT_BINDINGS: "element-bindings",
  EXTRACT_JSON_RESULT: "extract-json",
  COMPONENT_SPEC_JSON: "component-spec-json",
} as const;

/**
 * UI에서 Plugin으로 전송되는 메시지 타입들
 */

// 취소 메시지
export interface CancelMessage {
  type: "cancel";
}

// Variant 변경 메시지
export interface ChangeVariantMessage {
  type: "change-variant";
  nodeId: string;
  propertyName: string;
  value: string;
}

// 메타데이터 설정 메시지
export interface SetMetadataMessage {
  type: "set-metadata";
  nodeId: string;
  metadataType: string;
}

// JSON 추출 메시지
export interface ExtractJsonMessage {
  type: "extract-json";
}

// Component Property 저장 메시지
export interface SaveComponentPropertyMessage {
  type: "save-component-property";
  data: PropertyConfig[];
}

// Props 정의 저장 메시지
export interface SavePropsDefinitionMessage {
  type: "save-props-definition";
  data: PropDefinition[];
}

// Internal State 정의 저장 메시지
export interface SaveInternalStateDefinitionMessage {
  type: "save-internal-state-definition";
  data: StateDefinition[];
}

// Element Bindings 저장 메시지
export interface SaveElementBindingsMessage {
  type: "save-element-bindings";
  data: ElementBindingsMap;
}

/**
 * UI로 전송되는 모든 메시지의 Union 타입
 */
export type PluginMessage =
  | CancelMessage
  | ChangeVariantMessage
  | SetMetadataMessage
  | ExtractJsonMessage
  | SaveComponentPropertyMessage
  | SavePropsDefinitionMessage
  | SaveInternalStateDefinitionMessage
  | SaveElementBindingsMessage;

/**
 * Plugin에서 UI로 전송되는 메시지 타입들
 */

// 선택 정보 메시지
export interface SelectionInfoMessage {
  type: "selection-info";
  data: Record<string, unknown>[];
}

// ComponentSet 정보 메시지
export interface ComponentSetInfoMessage {
  type: "component-set-info";
  data: ComponentPropertyDefinitions | null;
}

// Component Property 설정 메시지
export interface ComponentPropertyConfigMessage {
  type: "component-property-config";
  data: PropertyConfig[];
}

// Props 정의 메시지
export interface PropsDefinitionMessage {
  type: "props-definition";
  data: PropDefinition[] | null;
}

// Internal State 정의 메시지
export interface InternalStateDefinitionMessage {
  type: "internal-state-definition";
  data: StateDefinition[] | null;
}

// Component 구조 메시지
export interface ComponentStructureMessage {
  type: "component-structure";
  data: ComponentStructureData | null;
}

// Element Bindings 메시지
export interface ElementBindingsMessage {
  type: "element-bindings";
  data: ElementBindingsMap | null;
}

// JSON 추출 결과 메시지
export interface ExtractJsonResultMessage {
  type: "extract-json";
  data: string;
}

/**
 * Plugin에서 UI로 전송되는 모든 메시지의 Union 타입
 */
export type UIMessage =
  | SelectionInfoMessage
  | ComponentSetInfoMessage
  | ComponentPropertyConfigMessage
  | PropsDefinitionMessage
  | InternalStateDefinitionMessage
  | ComponentStructureMessage
  | ElementBindingsMessage
  | ExtractJsonResultMessage;
