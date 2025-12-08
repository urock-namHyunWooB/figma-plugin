import { StyleTree } from "@frontend/ui/domain/compiler";

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
};

// 1. 값의 형태 정의 (고정 vs 조건부)
type ReactiveValue<T> =
  | { type: "static"; value: T }
  | {
      type: "dynamic";
      expression: string;
      cases: Array<{ condition: string; value: T }>;
    };

export interface FinalAstTree extends SuperTreeNode {
  props: {
    visible?: ReactiveValue<boolean>; // 예: props.hasIcon ? true : false
    text?: ReactiveValue<string>; // 텍스트 내용
    src?: ReactiveValue<string>; // 이미지 소스 등
  };

  style: {
    base: Record<string, any>;

    dynamic: Array<{
      condition: string; // 예: "props.type === 'primary'"
      style: Record<string, any>; // 예: { backgroundColor: 'blue' }
    }>;
  };

  children: FinalAstTree[];
}
