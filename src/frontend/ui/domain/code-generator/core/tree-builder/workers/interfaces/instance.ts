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

/**
 * Override 정보 구조
 * INSTANCE 자식 노드에 적용된 오버라이드 정보를 담는 인터페이스
 * @property originalId - 원본 컴포넌트 노드 ID
 * @property instanceId - INSTANCE 노드 ID
 * @property overrides - 오버라이드된 속성들
 */
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

/**
 * INSTANCE 노드의 오버라이드를 처리하는 핸들러 인터페이스
 */
export interface IInstanceOverrideHandler {
  /**
   * INSTANCE ID에서 원본 노드 ID 추출
   * @param instanceId - INSTANCE 자식 노드의 복합 ID (예: "I704:56;704:29;692:1613")
   * @returns 원본 노드 ID (예: "692:1613")
   */
  getOriginalId(instanceId: string): string;

  /**
   * ID가 INSTANCE 자식 노드인지 확인
   * @param id - 확인할 노드 ID
   * @returns INSTANCE 자식 노드 여부
   */
  isInstanceChildId(id: string): boolean;

  /**
   * INSTANCE children에서 override 정보 추출
   * @param instanceChildren - INSTANCE의 자식 노드 배열
   * @param originalChildren - 원본 컴포넌트의 자식 노드 배열
   * @returns 추출된 Override 정보 배열
   */
  extractOverrides(instanceChildren: SceneNode[], originalChildren: SceneNode[]): OverrideInfo[];

  /**
   * INSTANCE override를 원본 노드에 적용
   * @param originalChildren - 원본 컴포넌트의 자식 노드 배열
   * @param instanceChildren - INSTANCE의 자식 노드 배열
   * @returns 오버라이드가 적용된 노드 배열
   */
  mergeOverridesToOriginal(originalChildren: SceneNode[], instanceChildren: SceneNode[]): SceneNode[];

  /**
   * INSTANCE 노드에서 variant props 추출
   * @param instanceNode - INSTANCE 노드
   * @param data - 전처리된 디자인 데이터
   * @returns variant prop 이름-값 쌍의 Record
   */
  extractVariantProps(instanceNode: SceneNode, data: PreparedDesignData): Record<string, string>;

  /**
   * INSTANCE에서 오버라이드된 속성을 props 형태로 추출
   * @param instanceNode - INSTANCE 노드
   * @param originalChildren - 원본 컴포넌트의 자식 노드 배열
   * @returns prop 이름-값 쌍의 Record
   */
  extractOverrideProps(instanceNode: SceneNode, originalChildren: SceneNode[]): Record<string, string>;
}

// ============================================================================
// ExternalRefBuilder Interface
// ============================================================================

/**
 * 외부 참조 빌더 입력 데이터
 * @property nodeId - 노드 ID
 * @property nodeName - 노드 이름
 * @property nodeType - 노드 타입
 * @property nodeSpec - 노드 스펙 데이터 (SceneNode)
 */
export interface ExternalRefInput {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  nodeSpec: SceneNode | undefined;
}

/**
 * 외부 참조 빌더 결과 데이터
 * @property componentSetId - 컴포넌트 세트 ID
 * @property componentName - 컴포넌트 이름
 * @property props - 컴포넌트에 전달할 props
 */
export interface ExternalRefResult {
  componentSetId: string;
  componentName: string;
  props: Record<string, string>;
}

/**
 * 외부 컴포넌트 참조 정보를 생성하는 빌더 인터페이스
 */
export interface IExternalRefBuilder {
  /**
   * 외부 컴포넌트 참조 정보 생성
   * @param input - 외부 참조 입력 데이터
   * @param data - 전처리된 디자인 데이터
   * @returns 외부 참조 결과 또는 undefined
   */
  buildExternalRef(
    input: ExternalRefInput,
    data: PreparedDesignData
  ): ExternalRefResult | undefined;
}
