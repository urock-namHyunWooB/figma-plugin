import type {
  Expression,
  BinaryExpression,
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
  | UnaryExpression
  | MemberExpression
  | Literal;

export type RenderTree = StyleTree;

export type PropsDef = Record<string, any>;

export interface MergedNode {
  id: string;
  name: string;
  variantName?: string | null;
}

export interface NewMergedNode extends MergedNode, StyleTree {}

export type SuperTreeNode = {
  id: string;
  type: string;
  name: string;
  parent: SuperTreeNode | null;
  children: SuperTreeNode[];

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
export type VisibleValue =
  | { type: "static"; value: boolean } // 항상 보임 or 항상 숨김
  | { type: "prop"; name: string } // 특정 Prop과 직접 연결됨 (예: props.showIcon)
  | { type: "condition"; condition: ConditionNode }; // 복합 조건 (예: props.variant === 'hover')

export type StyleObject = {
  base: Record<string, any>;

  dynamic: Array<{
    condition: ConditionNode;
    style: Record<string, any>; // 예: { backgroundColor: 'blue' }
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
}

/**
 * TempAst애서 한번더 견고하게 가공된 형태
 */
export interface FinalAstTree {
  id: string;
  name: string;
  type: string;
  props: any;
  parent: FinalAstTree | null;
  visible: VisibleValue;
  style: StyleObject;
  children: FinalAstTree[];
}
