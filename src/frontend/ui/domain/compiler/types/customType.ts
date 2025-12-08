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

export type SuperTreeNode = {
  id: string;
  type: string;
  name: string;
  parent: SuperTreeNode | null;
  children: (SuperTreeNode | undefined)[];

  // 각 Variant에서 이 노드에 합쳐진 노드 정보
  mergedNode: Record<string, string>[];

  metaData?: any;
};

type ReactiveValue<T> =
  | { type: "static"; value: T }
  | {
      type: "dynamic";
      expression: string;
      cases: Array<{ condition: string; value: T }>;
    };

export type StyleObject = {
  base: Record<string, any>;

  dynamic: Array<{
    condition: ConditionNode;
    style: Record<string, any>; // 예: { backgroundColor: 'blue' }
  }>;
};

export interface TempAstTree extends SuperTreeNode {
  props: {
    visible?: ReactiveValue<boolean>; // 예: props.hasIcon ? true : false
    text?: ReactiveValue<string>; // 텍스트 내용
    src?: ReactiveValue<string>; // 이미지 소스 등
  };

  style: StyleObject;

  children: TempAstTree[];
}

export interface FinalAstTree {
  props: any;
  style: any;
  children: FinalAstTree[];
}
