import type {
  Expression,
  BinaryExpression,
  LogicalExpression,
  MemberExpression,
  Literal,
  UnaryExpression,
  BinaryOperator,
} from "estree";
import { StyleTree } from "@frontend/ui/domain/code-generator";

export type { BinaryOperator };

// 2. 우리가 사용할 조건 노드 타입 정의 (필요한 것만 좁혀서 써도 되고, Expression 전체를 써도 됩니다)
// Expression은 ESTree의 모든 표현식 타입을 포함합니다.
// export type ConditionNode = Expression;

/**
 * 조건 노드 타입
 * ESTree 표현식 타입 중 조건 표현에 필요한 타입들의 유니온
 */
export type ConditionNode =
  | BinaryExpression
  | LogicalExpression
  | UnaryExpression
  | MemberExpression
  | CallExpression
  | Literal;

/**
 * 렌더 트리 타입 (StyleTree의 별칭)
 */
export type RenderTree = StyleTree;

/**
 * Props 정의 타입
 * 키-값 형태의 props 맵
 */
export type PropsDef = Record<string, any>;

/**
 * 병합된 노드 인터페이스
 * 여러 variant에서 병합된 노드 정보
 */
export interface MergedNode {
  /** 노드 ID */
  id: string;
  /** 노드 이름 */
  name: string;
  /** variant 이름 (선택적) */
  variantName?: string | null;
}

/**
 * 형제 노드 그래프 타입
 * 노드 ID를 키로 하고 RenderTree 배열을 값으로 하는 맵
 */
export type SiblingGraph = Map<string, RenderTree[]>;

/**
 * 새로운 병합 노드 인터페이스
 * MergedNode와 StyleTree를 결합한 타입
 */
export interface NewMergedNode extends MergedNode, StyleTree {}

/**
 * 슈퍼 트리 노드 타입
 * variant 병합 후의 통합 트리 노드
 */
export type SuperTreeNode = {
  /** 노드 ID */
  id: string;
  /** 노드 타입 */
  type: string;
  /** 노드 이름 */
  name: string;
  /** 부모 노드 (null이면 루트) */
  parent: SuperTreeNode | null;
  /** 자식 노드 배열 */
  children: (SuperTreeNode | undefined)[];

  /** 각 Variant에서 이 노드에 합쳐진 노드 정보 */
  mergedNode: MergedNode[];

  /** 추가 메타데이터 */
  metaData?: any;
};

/**
 * 반응형 값 타입
 * 정적 값 또는 동적 조건부 값을 표현
 */
type ReactiveValue<T> =
  | { type: "static"; value: T }
  | {
      type: "dynamic";
      expression: string;
      cases: Array<{ condition: string; value: T }>;
    };

/**
 * Visible 값 타입
 * AST 노드의 가시성 속성
 * 명시적 바인딩(props.visible)은 props에서 처리하므로 여기선 제외
 */
export type VisibleValue =
  | { type: "static"; value: boolean } // 항상 보임 or 항상 숨김
  | { type: "condition"; condition: ConditionNode }; // 복합 조건 (예: props.variant === 'hover')

/**
 * CSS Pseudo-class 타입
 * 지원하는 CSS 의사 클래스 목록
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
 * 동적 Variants 타입
 * variant별 스타일 정보를 담는 레코드
 */
export type DynamicVariants = Record<
  string,
  {
    style: {
      /** 기본 스타일 */
      base: Record<string, string>;
      /** 동적 스타일 배열 */
      dynamic: {
        variantName: string;
        base: Record<string, string>;
        dynamic: any[];
        report: any[];
      }[];
    };
  }
>;

/**
 * 스타일 객체 타입
 * 기본, 동적, pseudo-class 스타일을 포함하는 통합 스타일 구조
 */
export type StyleObject = {
  /** 기본 스타일 */
  base: Record<string, any>;

  /** 조건부 동적 스타일 배열 */
  dynamic: Array<{
    /** 조건 표현식 */
    condition: ConditionNode;
    /** 적용할 스타일 (예: { backgroundColor: 'blue' }) */
    style: Record<string, any>;
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
    /** 조건 표현식 */
    condition: ConditionNode;
    /** 적용할 스타일 */
    style: Record<string, any>;
  }>;

  /**
   * Boolean prop + Index prop 조합 조건부 스타일
   * 예: customDisabled && color 조합으로 배경색 결정
   * 생성 코드: ${$customDisabled ? DisabledColorStyles[$color] : {}}
   */
  indexedConditional?: {
    /** Boolean prop 이름 (예: "customDisabled") */
    booleanProp: string;
    /** Index prop 이름 (예: "color") */
    indexProp: string;
    /** variant별 스타일 맵 (예: { Primary: { background: "#CCE2FF" }, ... }) */
    styles: Record<string, Record<string, any>>;
    /** 생성될 레코드 변수명 */
    recordName?: string;
  };
};
