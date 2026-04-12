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
 * 디자이너가 사용한 시각 기법(디자인 패턴)의 감지 결과.
 * DesignPatternDetector가 부착하고, 후속 processor가 소비한다.
 */
export type DesignPattern =
  /** Loading overlay 시 content를 투명 마스크로 가리는 패턴 → visibility:hidden */
  | {
      type: "alphaMask";
      /** 패턴이 감지된 노드의 ID */
      nodeId: string;
      /** componentPropertyReferences.visible 값 (예: "Loading#29474:0") — condition 추출은 소비자가 수행 */
      visibleRef: string;
    }
  /** hover/active 등 인터랙션 색상 표현용 Interaction 프레임 */
  | { type: "interactionFrame"; nodeId: string }
  /** 부모를 99%+ 덮는 ABSOLUTE 배경 노드 — fills를 부모에 흡수 대상 */
  | { type: "fullCoverBackground"; nodeId: string }
  /** Figma State variant 값 → CSS pseudo-class 변환 대상 (컴포넌트 레벨) */
  | {
      type: "statePseudoClass";
      /** State를 제어하는 prop 이름 (예: "state") */
      prop: string;
      /** State 값 → CSS pseudo-class 매핑 (예: { "Hover": ":hover" }) */
      stateMap: Record<string, string>;
    }
  /** Breakpoint variant → CSS @media query 변환 대상 (컴포넌트 레벨) */
  | {
      type: "breakpointVariant";
      /** Breakpoint를 제어하는 prop 이름 (예: "breakpoint") */
      prop: string;
    }
  /** Boolean prop에 의해 노드 위치만 좌우 이동 (Switch 노브 등) — 매칭 힌트 */
  | {
      type: "booleanPositionSwap";
      /** 패턴이 감지된 노드의 ID */
      nodeId: string;
      /** 위치 이동을 제어하는 prop 이름 (예: "active") */
      prop: string;
    }
  /** Variant prop에 의한 레이아웃 모드 전환 — 같은 컨테이너의 자식 구조가 prop 값에 따라 교체 */
  | {
      type: "layoutModeSwitch";
      /** 자식 구조가 바뀌는 컨테이너의 nodeId */
      containerNodeId: string;
      /** 모드를 제어하는 variant prop 이름 (정규화된 camelCase) */
      prop: string;
      /** prop 값 → 해당 모드에서만 존재하는 자식 이름 목록 */
      branches: Record<string, string[]>;
    }
  /** BOOLEAN visibility가 제어하는 노드 내 isExposedInstance INSTANCE → ReactNode 슬롯 승격 대상 */
  | {
      type: "exposedInstanceSlot";
      /** visibility가 제어되는 노드 ID (FRAME 또는 INSTANCE) */
      nodeId: string;
      /** exposed INSTANCE의 노드 ID */
      instanceNodeId: string;
      /** componentPropertyReferences.visible 값 (예: "Leading Icon#438:4") */
      visibleRef?: string;
    };

/**
 * CSS Pseudo-class
 */
export type PseudoClass =
  | ":hover"
  | ":hover:not(:disabled)"
  | ":active"
  | ":active:not(:disabled)"
  | ":focus"
  | ":focus:not(:disabled)"
  | ":disabled"
  | ":focus-visible"
  | ":checked"
  | ":visited"
  | "::placeholder";

/** variant 불일치 진단 정보 */
export interface VariantInconsistency {
  cssProperty: string;
  propName: string;
  propValue: string;
  nodeName?: string;
  /** 진단이 발견된 UINode의 id (Figma 원본 노드 id, representative) */
  nodeId?: string;
  variants: Array<{
    props: Record<string, string>;
    value: string;
    /**
     * 이 variant entry에 해당하는 raw figma node id.
     * fix-assist는 outlier variant의 nodeId로 정확한 figma 노드를 수정.
     * mergedNodes lookup이 실패하면 undefined (FeedbackBuilder는 fallback으로 진단의 representative nodeId 사용).
     */
    nodeId?: string;
  }>;
  expectedValue: string | null;
  /** 이 진단이 피드백 엔진에서 자동 fix 가능한지 (expectedValue != null 기반) */
  canAutoFix?: boolean;
}

/**
 * 노드 가시성
 * variant 병합 시 각 노드의 보임/숨김 조건 표현
 */
export type VisibleValue =
  | { type: "static"; value: boolean }
  | { type: "condition"; condition: ConditionNode };

/**
 * 중첩 CSS 셀렉터 맵 (e.g., { "svg path": { fill: "#628CF5" } })
 * Emotion → 중첩 CSS 블록, Tailwind → arbitrary variant 클래스로 변환
 */
export type NestedStyleMap = Record<string, Record<string, string | number>>;

/**
 * 스타일 객체
 * base: 기본 스타일, dynamic: 조건부 스타일, pseudo: CSS pseudo-class 스타일
 * mediaQueries: @media 쿼리 스타일 (ResponsiveProcessor가 생성)
 */
export type StyleObject = {
  base: Record<string, string | number>;
  dynamic: Array<{
    condition: ConditionNode;
    style: Record<string, string | number>;
    /** compound-varying CSS의 조건부 pseudo (per-group pseudo-class 스타일) */
    pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
    /**
     * 이 dynamic entry가 어느 raw figma 노드에서 왔는지.
     * fix-assist가 outlier variant의 정확한 노드를 수정하기 위해 사용.
     * StyleProcessor.collectVariantStyles에서 채워짐. 이후 처리(decomposer 등)에서
     * entry가 합쳐지거나 가공되면 손실될 수 있으므로 best-effort.
     */
    sourceVariantNodeId?: string;
  }>;
  pseudo?: Partial<Record<PseudoClass, Record<string, string | number>>>;
  mediaQueries?: Array<{
    /** CSS @media 조건 (예: "(max-width: 767px)") */
    query: string;
    style: Record<string, string | number>;
  }>;
  /** loop 아이템의 boolean variant 스타일 (dependency COMPONENT_SET 기반) */
  itemVariant?: {
    true: Record<string, string | number>;
    false: Record<string, string | number>;
  };
  /** 레거시: variant prop별 스타일 맵 (StylesGenerator/UITreeOptimizer 일부 분기에서만 사용) */
  variants?: Record<string, Record<string, Record<string, string | number>>>;
};

/**
 * INSTANCE override 감지 결과
 * TreeBuilder가 감지하고, ComponentPropsLinker가 linking에 사용
 */
export interface InstanceOverride {
  propName: string;
  propType: "string" | "boolean" | "number";
  nodeId: string;
  nodeName: string;
  value: string;
}

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

export type PropType = "variant" | "boolean" | "slot" | "string" | "function" | "array";

interface PropBase {
  name: string;
  type: PropType;
  /** null = explicit "no default" (e.g., slot props); array = array slot default */
  defaultValue?: string | boolean | number | null | unknown[];
  required: boolean;
  /** Figma componentPropertyDefinitions 키 — DataPreparer 질의용 */
  sourceKey: string;
  /** 의도적으로 native HTML attribute와 동일한 이름 — rename 스킵 */
  nativeAttribute?: boolean;
}

export interface VariantPropDefinition extends PropBase {
  type: "variant";
  options: string[];
}

export interface BooleanPropDefinition extends PropBase {
  type: "boolean";
  /** 추가 문자열 리터럴 값 (예: ["indeterminate"]) → boolean | "indeterminate" 타입 생성 */
  extraValues?: string[];
}

export interface SlotPropDefinition extends PropBase {
  type: "slot";
  /** 참조하는 외부 컴포넌트 이름 (PascalCase) */
  componentName?: string;
  /** 컴파일 가능한 dependency 컴포넌트인지 */
  hasDependency?: boolean;
  /** 참조하는 컴포넌트 ID (mockupSvg 조회용) */
  componentId?: string;
  /** 대표 INSTANCE 노드 ID (bounding box 조회용) */
  nodeId?: string;
}

export interface StringPropDefinition extends PropBase {
  type: "string";
}

export interface FunctionPropDefinition extends PropBase {
  type: "function";
  functionSignature?: string; // e.g., "(value: string) => void"
}

export interface ArrayPropDefinition extends PropBase {
  type: "array";
  /** TypeScript 타입 문자열 (e.g., "Array<{ label: string; value: string }>") */
  itemType?: string;
}

export type PropDefinition =
  | VariantPropDefinition
  | BooleanPropDefinition
  | SlotPropDefinition
  | StringPropDefinition
  | FunctionPropDefinition
  | ArrayPropDefinition;

// ============================================================================
// Array Slot Types
// ============================================================================

/**
 * Array Slot 정보
 *
 * 동일한 컴포넌트가 반복되는 패턴 감지 → .map() 렌더링
 */
export interface ArraySlotInfo {
  /** 부모 노드 ID */
  parentId: string;
  /** 반복되는 노드들의 ID 목록 */
  nodeIds: string[];
  /** 슬롯 prop 이름 (예: "items") */
  slotName: string;
  /** 참조하는 외부 컴포넌트 이름 (예: "NavigationItem") */
  itemComponentName?: string;
  /** 아이템 컴포넌트의 Props (예: [{ name: "label", type: "string" }]) */
  itemProps?: Array<{ name: string; type: string; defaultValue?: string }>;
  /** 아이템 클릭 시 실행할 코드 (item 변수 참조 가능, 예: "setSelected(item.id); setOpen(false)") */
  onItemClick?: string;
}

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
  | "frame"
  | "badge"
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

/** 바인딩 소스: prop 참조, 외부 정적 참조, 또는 JS 표현식 */
export type BindingSource = { prop: string } | { ref: string } | { expr: string };

/** 노드 바인딩 정보 */
export interface Bindings {
  /** 노드 속성 바인딩 — 일반 속성 + 이벤트 (속성명 → 소스) */
  attrs?: Record<string, BindingSource>;
  /** 노드 콘텐츠 바인딩 — TextNode, SlotNode */
  content?: BindingSource;
  /** 텍스트 노드의 텍스트 내용 바인딩 (CSS 보존 텍스트 치환용) */
  textContent?: BindingSource;
  /** 인라인 스타일 바인딩 — CSS 속성명 → 소스 (예: background → props.iconBg) */
  style?: Record<string, BindingSource>;
}

interface UINodeBase {
  id: string;
  name: string;
  styles?: StyleObject;
  visibleCondition?: ConditionNode;
  bindings?: Bindings;
  /** 휴리스틱이 판별한 세부 역할 */
  semanticType?: string;
  /**
   * variant 출처 정보 — 어떤 raw figma 노드들로부터 합쳐졌는지.
   * fix-assist의 outlier per-variant nodeId lookup에 사용.
   * InternalNode에서 그대로 복사됨.
   */
  mergedNodes?: VariantOrigin[];
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
    /** INSTANCE override 감지 결과 (TreeBuilder에서 설정) */
    instanceOverrides?: InstanceOverride[];
    /** Vector-only 의존성의 variant별 색상 맵 (ExternalRefsProcessor → StyleProcessor 간 전달) */
    vectorColorMap?: Record<string, string>;
    /** squash prune 시 제거된 wrapper의 레이아웃 오버라이드 (variantName → CSS property map) */
    layoutOverrides?: Record<string, Record<string, string>>;
    /** 디자인 패턴 감지 결과 (DesignPatternDetector가 부착) */
    designPatterns?: DesignPattern[];
  };
  /** 루프 설정 (Heuristic이 설정, UINode로 전달) */
  loop?: { dataProp: string; keyField?: string };
  /** children slot (FrameHeuristic이 설정, 래퍼 컴포넌트의 {children} 렌더링용) */
  childrenSlot?: string;
  /** CONDITIONAL_GROUP 전용: 분기 기준 prop 이름 */
  branchProp?: string;
  /** CONDITIONAL_GROUP 전용: prop 값 → 해당 모드의 자식들 */
  branches?: Record<string, InternalNode[]>;
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
  /** children slot (래퍼 컴포넌트의 {children} 렌더링용) */
  childrenSlot?: string;
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

/** 조건 분기 노드 — variant prop 값에 따라 다른 자식 렌더링 */
export interface ConditionalGroupNode extends UINodeBase {
  type: "conditionalGroup";
  /** 분기 기준 prop 이름 */
  prop: string;
  /** prop 값 → 해당 모드에서 렌더링할 자식들 */
  branches: Record<string, UINode[]>;
}

export interface ComponentNode extends UINodeBase {
  type: "component";
  /** 외부 컴포넌트 참조 ID */
  refId: string;
  children: UINode[];
  /** INSTANCE override props (메인 컴포넌트에서 의존 컴포넌트로 전달할 값) */
  overrideProps?: Record<string, string>;
  /** Override 메타 정보 (ComponentPropsLinker가 linking에 사용) */
  overrideMeta?: InstanceOverride[];
  /** INSTANCE/COMPONENT 크기 비율 (1이 아닌 경우만 설정) */
  instanceScale?: number;
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
  | ComponentNode
  | ConditionalGroupNode;

/** 컴포넌트 함수 본문에 삽입할 파생 변수 */
export interface DerivedVar {
  /** 변수명 (예: "state") */
  name: string;
  /** 계산식 (예: "checked ? \"Checked\" : indeterminate ? \"Indeterminate\" : \"Unchecked\"") */
  expression: string;
}

/** TreeBuilder 출력, CodeEmitter 입력 */
/** React useState 훅 선언 */
export interface StateVar {
  name: string;
  setter: string;
  initialValue: string;
}

export interface UITree {
  root: UINode;
  componentType?: ComponentType;
  props: PropDefinition[];
  arraySlots?: ArraySlotInfo[];
  /** props destructuring 이후 삽입할 파생 변수 선언 */
  derivedVars?: DerivedVar[];
  /** React useState 훅 선언 */
  stateVars?: StateVar[];
  /** dependency 컴포넌트 여부 (root width/height를 100%로 변환) */
  isDependency?: boolean;
}
