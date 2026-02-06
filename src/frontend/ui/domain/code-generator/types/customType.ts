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

export type PseudoClass =
  | ":hover"
  | ":active"
  | ":focus"
  | ":disabled"
  | ":focus-visible"
  | ":checked"
  | ":visited";

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

  /**
   * Boolean prop + Index prop 조합 조건부 스타일
   * 예: customDisabled && color 조합으로 배경색 결정
   * 생성 코드: ${$customDisabled ? DisabledColorStyles[$color] : {}}
   */
  indexedConditional?: {
    booleanProp: string; // "customDisabled"
    indexProp: string; // "color"
    styles: Record<string, Record<string, any>>; // { Primary: { background: "#CCE2FF" }, ... }
    recordName?: string; // 생성될 레코드 변수명
  };
};

