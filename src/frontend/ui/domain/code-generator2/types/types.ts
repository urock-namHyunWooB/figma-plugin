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

/** 컴포넌트 고유 식별자 */
export type ComponentId = string;

// ============================================================================
// Prop Types
// ============================================================================

export type PropType = "variant" | "boolean" | "slot" | "string";

interface PropBase {
  name: string;
  type: PropType;
  defaultValue?: string | boolean | number;
  required: boolean;
  /** Figma componentPropertyDefinitions 키 — DataPreparer 질의용 */
  sourceKey: string;
}

export interface VariantPropDefinition extends PropBase {
  type: "variant";
  options: string[];
}

export interface BooleanPropDefinition extends PropBase {
  type: "boolean";
}

export interface SlotPropDefinition extends PropBase {
  type: "slot";
}

export interface StringPropDefinition extends PropBase {
  type: "string";
}

export type PropDefinition =
  | VariantPropDefinition
  | BooleanPropDefinition
  | SlotPropDefinition
  | StringPropDefinition;

// ============================================================================
// UITree / UINode Types
// ============================================================================

export type ComponentType =
  | "input"
  | "button"
  | "modal"
  | "card"
  | "list"
  | "checkbox"
  | "radio"
  | "toggle"
  | "dropdown"
  | "link"
  | "icon"
  | "custom"
  | "unknown";

export type UINodeType =
  | "container"
  | "text"
  | "image"
  | "vector"
  | "button"
  | "input"
  | "link"
  | "slot"
  | "component";

export interface TextSegment {
  text: string;
  style?: Record<string, string>;
}

/** 바인딩 소스: prop 참조 또는 외부 정적 참조 */
export type BindingSource = { prop: string } | { ref: string };

/** 노드 바인딩 정보 */
export interface Bindings {
  /** 노드 속성 바인딩 — 일반 속성 + 이벤트 (속성명 → 소스) */
  attrs?: Record<string, BindingSource>;
  /** 노드 콘텐츠 바인딩 — TextNode, SlotNode */
  content?: BindingSource;
}

interface UINodeBase {
  id: string;
  name: string;
  styles?: StyleObject;
  visibleCondition?: ConditionNode;
  bindings?: Bindings;
  /** 휴리스틱이 판별한 세부 역할 */
  semanticType?: string;
}

/**
 * 내부 트리 노드
 * 파이프라인 중간 표현 — UINode로 변환되기 전 단계
 */
export interface InternalNode extends UINodeBase {
  /** Figma 노드 타입 (FRAME, TEXT, INSTANCE 등) */
  type: string;
  /** 부모 노드 (루트는 null) */
  parent?: InternalNode | null;
  children: InternalNode[];
  /** 병합된 variant 정보 (스타일 분류용) */
  mergedNodes?: VariantOrigin[];
  /** 외부 컴포넌트 참조 ID (INSTANCE만) */
  refId?: string;
  /** absoluteBoundingBox (위치 기반 매칭용) */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** componentPropertyReferences (INSTANCE visibility 제어용) */
  componentPropertyReferences?: Record<string, string>;
  /** 파이프라인 전달용 메타데이터 (UINode 변환 시 사용) */
  metadata?: {
    /** 병합된 Vector SVG (의존 컴포넌트용) */
    vectorSvg?: string;
  };
}

/**
 * 내부 트리 (InternalNode 트리 전체)
 * 루트 노드가 곧 트리 전체를 나타냄
 */
export type InternalTree = InternalNode;

// ============================================================================
// Variant Graph Types (for variant merging optimization)
// ============================================================================

/** Variant prop 맵 (예: { State: "Default", hasIcon: "true" }) */
export type VariantProps = Record<string, string>;

/** Variant 그래프 노드 */
export interface VariantGraphNode {
  variantName: string;
  props: VariantProps;
  tree: InternalTree;
}

/** Variant 그래프 엣지 */
export interface VariantGraphEdge {
  from: number; // variant index
  to: number;
  propDiff: number; // prop 차이 개수 (1 or 2)
}

/** Variant 그래프 */
export interface VariantGraph {
  nodes: VariantGraphNode[];
  edges: VariantGraphEdge[];
}

/** Prop 차이 정보 (병합 시 매칭 전략 결정용) */
export interface PropDiffInfo {
  /** 차이나는 prop 개수 */
  diffCount: number;
  /** 차이나는 prop 이름 (1개 차이일 때) */
  diffPropName?: string;
  /** 차이나는 prop의 이전 값 */
  diffPropValueA?: string;
  /** 차이나는 prop의 새로운 값 */
  diffPropValueB?: string;
}

// ============================================================================
// UINode Types
// ============================================================================

export interface ContainerNode extends UINodeBase {
  type: "container";
  children: UINode[];
  loop?: { dataProp: string; keyField?: string };
}

export interface TextNode extends UINodeBase {
  type: "text";
  textSegments?: TextSegment[];
}

export interface ImageNode extends UINodeBase {
  type: "image";
}

export interface VectorNode extends UINodeBase {
  type: "vector";
  vectorSvg?: string;
  variantSvgs?: Record<string, string>;
}

export interface ButtonNode extends UINodeBase {
  type: "button";
  children: UINode[];
}

export interface InputNode extends UINodeBase {
  type: "input";
  children: UINode[];
}

export interface LinkNode extends UINodeBase {
  type: "link";
  children: UINode[];
}

export interface SlotNode extends UINodeBase {
  type: "slot";
}

export interface ComponentNode extends UINodeBase {
  type: "component";
  /** 외부 컴포넌트 참조 ID */
  refId: string;
  children: UINode[];
  /** INSTANCE override props (메인 컴포넌트에서 의존 컴포넌트로 전달할 값) */
  overrideProps?: Record<string, string>;
}

export type UINode =
  | ContainerNode
  | TextNode
  | ImageNode
  | VectorNode
  | ButtonNode
  | InputNode
  | LinkNode
  | SlotNode
  | ComponentNode;

/** TreeBuilder 출력, CodeEmitter 입력 */
export interface UITree {
  root: UINode;
  componentType?: ComponentType;
  props: PropDefinition[];
}
