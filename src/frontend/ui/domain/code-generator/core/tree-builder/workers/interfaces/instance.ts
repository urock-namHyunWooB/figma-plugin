/**
 * Instance Interfaces
 *
 * InstanceOverrideHandler, ExternalRefBuilder 인터페이스
 */

import type { PreparedDesignData } from "@code-generator/types/architecture";
import type { FigmaFill, FigmaStroke, FigmaEffect, ComponentPropertyValue } from "./core";

// ============================================================================
// InstanceOverrideHandler Interface
// ============================================================================

export interface OverrideInfo {
  originalId: string;
  instanceId: string;
  overrides: {
    characters?: string;
    visible?: boolean;
    fills?: FigmaFill[];
    strokes?: FigmaStroke[];
    effects?: FigmaEffect[];
    opacity?: number;
    cornerRadius?: number;
    componentProperties?: Record<string, ComponentPropertyValue>;
  };
}

export interface IInstanceOverrideHandler {
  /** INSTANCE ID에서 원본 노드 ID 추출 */
  getOriginalId(instanceId: string): string;

  /** ID가 INSTANCE 자식 노드인지 확인 */
  isInstanceChildId(id: string): boolean;

  /** INSTANCE children에서 override 정보 추출 */
  extractOverrides(instanceChildren: SceneNode[], originalChildren: SceneNode[]): OverrideInfo[];

  /** INSTANCE override를 원본 노드에 적용 */
  mergeOverridesToOriginal(originalChildren: SceneNode[], instanceChildren: SceneNode[]): SceneNode[];

  /** INSTANCE 노드에서 variant props 추출 */
  extractVariantProps(instanceNode: SceneNode, data: PreparedDesignData): Record<string, string>;

  /** INSTANCE에서 오버라이드된 속성을 props 형태로 추출 */
  extractOverrideProps(instanceNode: SceneNode, originalChildren: SceneNode[]): Record<string, string>;
}

// ============================================================================
// ExternalRefBuilder Interface
// ============================================================================

export interface ExternalRefInput {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  nodeSpec: SceneNode | undefined;
}

export interface ExternalRefResult {
  componentSetId: string;
  componentName: string;
  props: Record<string, string>;
}

export interface IExternalRefBuilder {
  /** 외부 컴포넌트 참조 정보 생성 */
  buildExternalRef(
    input: ExternalRefInput,
    data: PreparedDesignData
  ): ExternalRefResult | undefined;
}
