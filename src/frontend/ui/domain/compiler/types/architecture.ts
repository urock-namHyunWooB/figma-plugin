/**
 * FigmaCodeGenerator Architecture Types
 *
 * 새로운 아키텍처의 핵심 인터페이스 및 타입 정의
 * @see docs/ARCHITECTURE.md
 */

import type { FigmaNodeData, StyleTree } from "./baseType";
import type { ConditionNode, StyleObject } from "./customType";

// ============================================================================
// Shared Types
// ============================================================================

/**
 * 컴포넌트 고유 식별자
 * ComponentSet의 ID를 사용
 */
export type ComponentId = string;

/**
 * Import 문 정의
 */
export interface ImportStatement {
  /** 모듈 경로 (예: "@emotion/styled", "./Button") */
  module: string;
  /** default import 이름 */
  defaultImport?: string;
  /** named imports */
  namedImports?: string[];
  /** type import 여부 */
  isTypeOnly?: boolean;
}

// ============================================================================
// Policy Types
// ============================================================================

/**
 * 전체 Policy 정의
 * 각 단계에서 사용되는 정책들의 집합
 */
export interface Policy {
  dataPreparer?: DataPreparerPolicy;
  treeBuilder?: TreeBuilderPolicy;
  codeEmitter?: CodeEmitterPolicy;
  bundler?: BundlerPolicy;
}

/**
 * DataPreparer 정책
 */
export interface DataPreparerPolicy {
  /** 특정 레이어 무시 */
  shouldIgnore?: (node: FigmaNodeData) => boolean;

  /** 노드 변환 규칙 */
  transformNode?: (node: FigmaNodeData) => FigmaNodeData;

  /** 커스텀 props 추출 */
  extractCustomProps?: (node: FigmaNodeData) => Record<string, unknown>;
}

/**
 * TreeBuilder 정책
 */
export interface TreeBuilderPolicy {
  /** 특정 레이어를 특정 컴포넌트로 해석 */
  interpretAs?: Map<string, ComponentType>;

  /** 컴포넌트 분리 기준 */
  shouldSplitComponent?: (node: DesignNode) => boolean;

  /** 커스텀 조건부 렌더링 규칙 */
  customConditionals?: (node: DesignNode) => ConditionalRule | null;

  /** 배열 슬롯 감지 커스터마이징 */
  detectArraySlot?: (nodes: DesignNode[]) => ArraySlotInfo | null;
}

/**
 * CodeEmitter 정책
 */
export interface CodeEmitterPolicy {
  /** 타겟 플랫폼 */
  platform: Platform;

  /** 스타일 전략 */
  styleStrategy: StyleStrategy;

  /** 코드 컨벤션 */
  convention?: CodeConvention;

  /** 메타데이터 삽입 */
  injectMetadata?: (code: EmittedCode) => EmittedCode;

  /** 커스텀 import 추가 */
  additionalImports?: ImportStatement[];

  /** 디자인 시스템 통합 */
  designSystem?: DesignSystemConfig;
}

/**
 * Bundler 정책
 */
export interface BundlerPolicy {
  /** 코드 스타일 */
  codeStyle?: "airbnb" | "google" | "standard" | "custom";

  /** Prettier 설정 */
  prettier?: PrettierConfig;

  /** Import 정렬 규칙 */
  importOrder?: string[];

  /** 번들링 옵션 */
  bundling?: BundlingOptions;

  /** 후처리 훅 */
  postProcess?: (code: string) => string;
}

// Policy 관련 서브 타입들

export type Platform = "react" | "vue" | "svelte" | "swift" | "kotlin";

export type StyleStrategy =
  | "emotion"
  | "tailwind"
  | "css-modules"
  | "styled-components";

export interface CodeConvention {
  componentStyle: "function" | "arrow" | "class";
  naming: "camelCase" | "PascalCase" | "kebab-case";
  exportStyle: "default" | "named";
}

export interface DesignSystemConfig {
  name: string;
  /** DesignNode type → DS component */
  componentMapping: Map<string, string>;
  /** Figma token → DS token */
  tokenMapping: Map<string, string>;
}

export interface PrettierConfig {
  semi?: boolean;
  singleQuote?: boolean;
  tabWidth?: number;
  trailingComma?: "none" | "es5" | "all";
  printWidth?: number;
  [key: string]: unknown;
}

export interface BundlingOptions {
  /** 단일 파일로 출력 */
  singleFile: boolean;
  /** 타입 정의 분리 */
  separateTypes: boolean;
  /** 스타일 분리 */
  separateStyles: boolean;
}

// ============================================================================
// PreparedDesignData Types
// ============================================================================

/**
 * DataPreparer의 출력
 * 정규화되고 enriched된 디자인 데이터
 */
export interface PreparedDesignData {
  /** 루트 문서 노드 */
  document: PreparedNode;

  /** 스타일 트리 */
  styleTree: StyleTree;

  /** 의존성 (아직 준비 안 된 raw 데이터) */
  dependencies: Map<string, FigmaNodeData>;

  /** 추출된 Props 정의 */
  props: ExtractedProps;

  /** 노드 ID → PreparedNode 빠른 조회 */
  nodeMap: Map<string, PreparedNode>;

  /** 스타일 ID → StyleTree 빠른 조회 */
  styleMap: Map<string, StyleTree>;

  // 조회 메서드
  getNodeById(id: string): PreparedNode | undefined;
  getStyleById(id: string): StyleTree | undefined;
}

/**
 * 준비된 노드 데이터
 * FigmaNodeData를 정규화하고 enriched한 형태
 */
export interface PreparedNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;

  /** 절대 좌표 */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** 스타일 정보 (CSS로 변환 가능한 형태) */
  styles: Record<string, string>;

  /** INSTANCE override 병합 완료된 데이터 */
  overrides?: Record<string, unknown>;

  /** 원본 Figma 노드 데이터 참조 (필요시 접근) */
  raw: FigmaNodeData;

  /** 자식 노드들 */
  children: PreparedNode[];
}

/**
 * 추출된 Props 정의
 */
export interface ExtractedProps {
  /** prop 이름 → 정의 */
  definitions: Map<string, PropDefinition>;

  /** variant prop 정의 (Size, State 등) */
  variants: VariantPropDefinition[];

  /** boolean prop 정의 */
  booleans: BooleanPropDefinition[];

  /** slot prop 정의 */
  slots: SlotPropDefinition[];
}

export interface PropDefinition {
  name: string;
  type: PropType;
  defaultValue?: unknown;
  required: boolean;
  description?: string;
}

export interface VariantPropDefinition extends PropDefinition {
  type: "variant";
  options: string[];
}

export interface BooleanPropDefinition extends PropDefinition {
  type: "boolean";
  /** 이 prop이 제어하는 노드 ID들 */
  controlledNodes?: string[];
}

export interface SlotPropDefinition extends PropDefinition {
  type: "slot";
  /** slot이 대체하는 노드 ID */
  targetNodeId: string;
}

export type PropType = "variant" | "boolean" | "slot" | "string" | "number";

// ============================================================================
// DesignTree (IR) Types
// ============================================================================

/**
 * TreeBuilder의 출력
 * 플랫폼 독립적인 중간 표현 (Intermediate Representation)
 */
export interface DesignTree {
  /** 루트 노드 */
  root: DesignNode;

  /** Props 정의 */
  props: PropDefinition[];

  /** Slot 정의 */
  slots: SlotDefinition[];

  /** 조건부 렌더링 규칙 */
  conditionals: ConditionalRule[];

  /** 배열 렌더링 정보 */
  arraySlots: ArraySlotInfo[];
}

/**
 * 디자인 노드
 * 플랫폼 독립적인 UI 요소 표현
 */
export interface DesignNode {
  id: string;

  /** 노드 타입 */
  type: DesignNodeType;

  /** 노드 이름 */
  name: string;

  /** 스타일 정의 */
  styles: StyleDefinition;

  /** 자식 노드들 */
  children: DesignNode[];

  /** 조건부 렌더링 규칙 */
  conditions?: ConditionalRule[];

  /** 배열 렌더링 정보 */
  loop?: LoopDefinition;

  /** props 바인딩 */
  propBindings?: Record<string, string>;

  /** 외부 컴포넌트 참조 */
  externalRef?: ExternalRef;
}

export type DesignNodeType =
  | "container"
  | "text"
  | "image"
  | "vector"
  | "slot"
  | "component";

/**
 * 컴포넌트 타입 (interpretAs에서 사용)
 */
export type ComponentType = "button" | "input" | "checkbox" | "icon" | "custom";

/**
 * 스타일 정의
 * 플랫폼 독립적인 스타일 표현
 */
export interface StyleDefinition {
  /** 기본 스타일 */
  base: Record<string, string | number>;

  /** 조건부 스타일 */
  dynamic: Array<{
    condition: ConditionNode;
    style: Record<string, string | number>;
  }>;

  /** pseudo-class 스타일 */
  pseudo?: {
    hover?: Record<string, string | number>;
    active?: Record<string, string | number>;
    focus?: Record<string, string | number>;
    disabled?: Record<string, string | number>;
  };
}

/**
 * Slot 정의
 */
export interface SlotDefinition {
  name: string;
  targetNodeId: string;
  defaultContent?: DesignNode;
}

/**
 * 조건부 렌더링 규칙
 */
export interface ConditionalRule {
  /** 조건 표현식 */
  condition: ConditionNode;

  /** 조건이 true일 때 표시할 노드 ID */
  showNodeId?: string;

  /** 조건이 false일 때 표시할 노드 ID */
  hideNodeId?: string;

  /** 대체 렌더링 (Fragment 등) */
  fallback?: "fragment" | "null" | "hidden";
}

/**
 * 배열/반복 렌더링 정의
 */
export interface LoopDefinition {
  /** 반복할 데이터 prop 이름 */
  dataProp: string;

  /** 아이템 변수 이름 */
  itemName: string;

  /** 인덱스 변수 이름 */
  indexName?: string;

  /** key로 사용할 필드 */
  keyField?: string;
}

/**
 * 배열 슬롯 정보
 */
export interface ArraySlotInfo {
  /** 슬롯 이름 */
  name: string;

  /** 반복되는 노드 ID들 */
  nodeIds: string[];

  /** 아이템 타입 (컴포넌트 참조) */
  itemType?: string;

  /** 최소/최대 아이템 수 */
  minItems?: number;
  maxItems?: number;
}

/**
 * 외부 컴포넌트 참조
 */
export interface ExternalRef {
  /** 참조하는 ComponentSet ID */
  componentSetId: string;

  /** 컴포넌트 이름 */
  componentName: string;

  /** 전달할 props */
  props: Record<string, unknown>;
}

// ============================================================================
// DependencyGraph Types
// ============================================================================

/**
 * 의존성 그래프
 */
export interface DependencyGraph {
  /** 컴포넌트 정보 맵 */
  nodes: Map<ComponentId, ComponentInfo>;

  /** 의존성 엣지 (A → B: A가 B를 의존) */
  edges: Map<ComponentId, Set<ComponentId>>;
}

/**
 * 컴포넌트 정보
 */
export interface ComponentInfo {
  id: ComponentId;
  name: string;
  data: FigmaNodeData;
}

/**
 * 순환 의존성
 */
export type Cycle = ComponentId[];

/**
 * 순환 의존성 에러
 */
export class CircularDependencyError extends Error {
  constructor(public cycles: Cycle[]) {
    super(
      `Circular dependency detected: ${cycles.map((c) => c.join(" → ")).join(", ")}`
    );
    this.name = "CircularDependencyError";
  }
}

// ============================================================================
// Component Interfaces
// ============================================================================

/**
 * DataPreparer 인터페이스
 * Figma 원본 데이터를 준비된 형태로 변환
 */
export interface IDataPreparer {
  prepare(data: FigmaNodeData, policy?: DataPreparerPolicy): PreparedDesignData;
}

/**
 * TreeBuilder 인터페이스
 * 준비된 데이터를 플랫폼 독립적 IR로 변환
 */
export interface ITreeBuilder {
  build(data: PreparedDesignData, policy?: TreeBuilderPolicy): DesignTree;
}

/**
 * CodeEmitter 인터페이스
 * IR을 플랫폼별 코드로 변환
 */
export interface ICodeEmitter {
  emit(tree: DesignTree, policy: CodeEmitterPolicy): EmittedCode;
}

/**
 * Bundler 인터페이스
 * 여러 컴포넌트 코드를 번들링
 */
export interface IBundler {
  bundle(codes: Map<ComponentId, EmittedCode>, policy?: BundlerPolicy): string;
}

/**
 * PolicyManager 인터페이스
 * 정책 관리 및 제공
 */
export interface IPolicyManager {
  load(policy: Partial<Policy>): void;
  getDataPreparerPolicy(): DataPreparerPolicy;
  getTreeBuilderPolicy(): TreeBuilderPolicy;
  getCodeEmitterPolicy(): CodeEmitterPolicy;
  getBundlerPolicy(): BundlerPolicy;
}

/**
 * DependencyAnalyzer 인터페이스
 * 의존성 분석 및 컴파일 순서 결정
 */
export interface IDependencyAnalyzer {
  /**
   * 의존성 그래프 구축
   */
  buildGraph(rootData: FigmaNodeData): DependencyGraph;

  /**
   * 토폴로지 정렬 (컴파일 순서 결정)
   * @throws CircularDependencyError 순환 의존성 발견 시
   */
  topologicalSort(graph: DependencyGraph): ComponentId[];

  /**
   * 순환 의존성 감지
   */
  detectCycles(graph: DependencyGraph): Cycle[] | null;
}

// ============================================================================
// CodeEmitter Output Types
// ============================================================================

/**
 * CodeEmitter의 출력
 */
export interface EmittedCode {
  /** 컴포넌트 코드 */
  code: string;

  /** Import 문들 */
  imports: ImportStatement[];

  /** TypeScript 타입 정의 */
  types: string;

  /** 컴포넌트 이름 */
  componentName: string;
}

// ============================================================================
// FigmaCodeGenerator Options (새 아키텍처)
// ============================================================================

/**
 * FigmaCodeGenerator 옵션 (새 아키텍처)
 */
export interface FigmaCodeGeneratorOptionsV2 {
  /** 전체 Policy */
  policy?: Policy;

  /** 디버그 모드 */
  debug?: boolean;
}
