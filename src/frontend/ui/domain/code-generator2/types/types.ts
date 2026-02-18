/**
 * 스타일 트리
 * 노드의 CSS 스타일 정보를 계층적으로 표현
 */
export interface StyleTree {
  id: string;
  name: string;
  cssStyle: Record<string, string>;
  children: StyleTree[];
}

/**
 * Figma REST API 응답 구조
 */
export interface FigmaRestApiResponse {
  document: SceneNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
  styles: Record<string, { key: string; name: string; styleType: string }>;
  schemaVersion: number;
}

/**
 * Figma 노드 데이터
 * 플러그인에서 추출한 전체 정보
 */
export interface FigmaNodeData {
  pluginData: { key: string; value: string }[];
  info: FigmaRestApiResponse;
  styleTree: StyleTree;
  dependencies?: Record<string, FigmaNodeData>;
  imageUrls?: Record<string, string>;
  vectorSvgs?: Record<string, string>;
}

/**
 * 조건 표현식 노드
 * props 기반 조건부 렌더링/스타일에 사용
 */
export type ConditionNode =
  | { type: 'eq'; prop: string; value: string | boolean | number }
  | { type: 'neq'; prop: string; value: string | boolean | number }
  | { type: 'truthy'; prop: string }
  | { type: 'and'; conditions: ConditionNode[] }
  | { type: 'or'; conditions: ConditionNode[] }
  | { type: 'not'; condition: ConditionNode }

/**
 * CSS Pseudo-class
 */
export type PseudoClass =
  | ":hover"
  | ":active"
  | ":focus"
  | ":disabled"
  | ":focus-visible"
  | ":checked"
  | ":visited";

/**
 * 노드 가시성
 * variant 병합 시 각 노드의 보임/숨김 조건 표현
 */
export type VisibleValue =
  | { type: "static"; value: boolean }
  | { type: "condition"; condition: ConditionNode };

/**
 * 스타일 객체
 * base: 기본 스타일, dynamic: 조건부 스타일, pseudo: CSS pseudo-class 스타일
 */
export type StyleObject = {
  base: Record<string, string | number>;
  dynamic: Array<{
    condition: ConditionNode;
    style: Record<string, string | number>;
  }>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
};

/**
 * Variant 출처 정보
 * SuperTree 노드가 어떤 variant에서 왔는지 추적
 */
export interface VariantOrigin {
  id: string;
  name: string;
  variantName?: string;
}

/**
 * 스타일이 붙은 variant 노드
 * variant 병합 과정의 중간 데이터
 */
export interface StyledVariantNode extends VariantOrigin {
  cssStyle: Record<string, string>;
  children: StyleTree[];
}
