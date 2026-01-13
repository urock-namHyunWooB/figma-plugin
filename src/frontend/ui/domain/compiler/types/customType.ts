import type {
  Expression,
  BinaryExpression,
  LogicalExpression,
  MemberExpression,
  Literal,
  UnaryExpression,
  BinaryOperator,
} from "estree";
import { StyleTree } from "@frontend/ui/domain/compiler";

export type { BinaryOperator };

// 2. 우리가 사용할 조건 노드 타입 정의 (필요한 것만 좁혀서 써도 되고, Expression 전체를 써도 됩니다)
// Expression은 ESTree의 모든 표현식 타입을 포함합니다.
// export type ConditionNode = Expression;

export type ConditionNode =
  | BinaryExpression
  | LogicalExpression
  | UnaryExpression
  | MemberExpression
  | CallExpression
  | Literal;

export type RenderTree = StyleTree;

export type PropsDef = Record<string, any>;

export interface MergedNode {
  id: string;
  name: string;
  variantName?: string | null;
}

export type SiblingGraph = Map<string, RenderTree[]>;

export interface NewMergedNode extends MergedNode, StyleTree {}

export type SuperTreeNode = {
  id: string;
  type: string;
  name: string;
  parent: SuperTreeNode | null;
  children: (SuperTreeNode | undefined)[];

  // 각 Variant에서 이 노드에 합쳐진 노드 정보
  mergedNode: MergedNode[];

  metaData?: any;
};

type ReactiveValue<T> =
  | { type: "static"; value: T }
  | {
      type: "dynamic";
      expression: string;
      cases: Array<{ condition: string; value: T }>;
    };

// AST Node의 visible 속성 타입
// 명시적 바인딩(props.visible)은 props에서 처리하므로 여기선 제외
export type VisibleValue =
  | { type: "static"; value: boolean } // 항상 보임 or 항상 숨김
  | { type: "condition"; condition: ConditionNode }; // 복합 조건 (예: props.variant === 'hover')

export type PseudoClass = ":hover" | ":active" | ":focus" | ":disabled";

export type DynamicVariants = Record<
  string,
  {
    style: {
      base: Record<string, string>;
      dynamic: {
        variantName: string;
        base: Record<string, string>;
        dynamic: any[];
        report: any[];
      }[];
    };
  }
>;

export type StyleObject = {
  base: Record<string, any>;

  dynamic: Array<{
    condition: ConditionNode;
    style: Record<string, any>; // 예: { backgroundColor: 'blue' }
  }>;

  /**
   * CSS pseudo-class 스타일
   * State prop에서 변환됨 (Hover → :hover, Pressed → :active 등)
   */
  pseudo?: Partial<Record<PseudoClass, Record<string, any>>>;

  /**
   * CSS로 변환 불가능한 조건부 스타일
   * 런타임에서 JS로 처리 필요 (예: props.states === 'loading')
   */
  unresolved?: Array<{
    condition: ConditionNode;
    style: Record<string, any>;
  }>;
};

export interface TempAstTree extends SuperTreeNode {
  id: string;
  name: string;
  type: string;
  props: any;
  parent: TempAstTree | null;
  visible: VisibleValue | null;
  style: StyleObject;
  mergedNode: MergedNode[];
  children: TempAstTree[];

  /**
   * 조건부 래퍼 플래그
   * true면 코드 생성 시 조건에 따라 Fragment로 대체됨
   * 예: (condition) ? <Frame>...</Frame> : <>...</>
   */
  isConditionalWrapper?: boolean;
}

/**
 * 플랫폼 독립적인 시맨틱 역할
 * 코드 생성기에서 플랫폼별 태그/위젯으로 변환됨
 */
export type SemanticRole =
  | "root" // 루트 컴포넌트
  | "container" // 레이아웃 컨테이너 (FRAME, GROUP)
  | "text" // 텍스트 (TEXT)
  | "button" // 버튼
  | "icon" // 아이콘 (INSTANCE)
  | "vector" // 벡터 그래픽 (VECTOR)
  | "image"; // 이미지

/**
 * 코드 생성 시 사용되는 변수명들
 * GenerateStyles에서 생성하고 CreateJsxTree에서 참조
 */
export interface GeneratedNames {
  /** CSS 함수/변수명 (예: btnCss, buttonCss_2) */
  cssVarName: string;
  /** prop별 Record 객체 변수명 (예: { size: "btnSizeStyles", customType: "btnTypeStyles" }) */
  recordVarNames: Record<string, string>;
}

/**
 * TempAst애서 한번더 견고하게 가공된 형태
 */
export interface FinalAstTree {
  id: string;
  name: string;
  type: string;
  props: Record<string, Record<string, any>>;
  parent: FinalAstTree | null;
  visible: VisibleValue;
  style: StyleObject;
  children: FinalAstTree[];

  /**
   * 플랫폼 독립적인 시맨틱 역할
   * React: div, span, button 등
   * Flutter: Container, Text, ElevatedButton 등
   */
  semanticRole: SemanticRole;
  metaData: any;

  /**
   * 코드 생성 시 사용되는 변수명들
   * GenerateStyles에서 생성하고 CreateJsxTree에서 참조
   */
  generatedNames?: GeneratedNames;

  /**
   * INSTANCE 노드가 참조하는 외부 컴포넌트 정보
   * 이 필드가 있으면 children은 무시되고 외부 컴포넌트로 렌더링됨
   */
  externalComponent?: ExternalComponentRef;
}

/**
 * 외부 컴포넌트 참조 정보
 * INSTANCE 노드가 별도 컴포넌트로 렌더링될 때 사용
 */
export interface ExternalComponentRef {
  /** 원본 컴포넌트 ID (dependencies의 key) */
  componentId: string;
  /** ComponentSet ID (같은 ComponentSet은 하나의 컴포넌트로 통합) */
  componentSetId: string;
  /** 정규화된 컴포넌트 이름 (예: "SelectButton") */
  componentName: string;
  /** INSTANCE에서 전달하는 props (예: { size: "default", selected: "false" }) */
  props: Record<string, string>;
}
